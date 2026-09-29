import type { CloudAuthState } from "./auth-state.js";
import { CloudAuthStateMachine } from "./auth-state.js";
import type { CloudClient } from "./cloud-client.js";
import { CloudContractUnavailableError } from "./cloud-client.js";
import type {
  CloudConfiguration,
  CloudConfigurationProvider,
} from "./cloud-config.js";
import { referralRegistrationUrl } from "./cloud-config.js";
import { CLOUD_CONTRACT_VERSION } from "./contract.js";
import type {
  ClientConfig,
  LatestReleaseResponse,
  LoginRequest,
  MeV2,
  ProviderConnectionV2,
  ProviderV2,
  ReferralRecordV2,
  ReferralSummaryV2,
  RegisterRequestV2,
  UsageSettlementV2,
  UsageSummaryV2,
  UsageHistoryRecord,
  User,
  WalletTransactionV2,
} from "./contract.js";
import type { DeviceIdentityStore } from "./device-identity.js";
import {
  authStateForCloudError,
  cloudErrorCode,
  cloudErrorPolicy,
} from "./cloud-error.js";
import type { CloudErrorAction } from "./cloud-error.js";

export interface CloudServiceStatus {
  contractVersion: typeof CLOUD_CONTRACT_VERSION;
  authState: CloudAuthState;
  contractReady: boolean;
  account: string | null;
  plan: "Standard" | "Pro" | null;
  subscriptionStatus: string | null;
  validUntil: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  usage: string | null;
  usagePercent: number | null;
  usageRequests: number | null;
  usageTokens: number | null;
  usagePointsUsed: number | null;
  remainingPoints: number | null;
  currentDevice: string;
  currentDeviceId: string | null;
  devices: Array<{
    id: string;
    deviceId: string;
    name: string;
    platform: string;
    status: "ACTIVE" | "REVOKED" | "BLOCKED";
    activatedAt: string;
    lastSeenAt: string | null;
    current: boolean;
  }>;
  walletTransactions: WalletTransactionV2[];
  usageV2: UsageSummaryV2 | null;
  usageHistory: UsageHistoryRecord[];
  referral: ReferralSummaryV2 | null;
  referralRegistrationUrl: string | null;
  referralHistory: ReferralRecordV2[];
  providers: Array<ProviderV2 & {
    models: Array<{
      id: string;
      publicId: string;
      displayName: string;
      capabilities: {
        tools: boolean;
        vision: boolean;
        reasoning: boolean;
        streaming: boolean;
      };
    }>;
  }>;
  providerConnections: ProviderConnectionV2[];
  clientConfig: ClientConfig | null;
  latestRelease: LatestReleaseResponse["release"];
  serviceConfigurationError: string | null;
  updateState: "CURRENT" | "AVAILABLE" | "REQUIRED" | "MAINTENANCE";
  lastError: {
    code: string;
    message: string;
    action: CloudErrorAction;
    retryable: boolean;
  } | null;
  accountManagementAvailable: boolean;
  subscriptionManagementAvailable: boolean;
  serviceStatus:
    | "WAITING_FOR_CONTRACT"
    | "AVAILABLE"
    | "UNREACHABLE"
    | "MAINTENANCE"
    | "UPDATE_REQUIRED";
  message: string;
}

export interface CloudLoginCredentials {
  email: string;
  password: string;
}

export class CloudFoundation {
  private readonly auth = new CloudAuthStateMachine();
  private readonly client: CloudClient;
  private readonly configuration: CloudConfigurationProvider;
  private readonly devices: DeviceIdentityStore;
  private account: MeV2 | null = null;
  private devicesV2: Awaited<ReturnType<CloudClient["listDevicesV2"]>> = [];
  private walletTransactions: WalletTransactionV2[] = [];
  private usageV2: UsageSummaryV2 | null = null;
  private usageHistory: UsageHistoryRecord[] = [];
  private referral: ReferralSummaryV2 | null = null;
  private referralHistory: ReferralRecordV2[] = [];
  private providers: CloudServiceStatus["providers"] = [];
  private providerConnections: ProviderConnectionV2[] = [];
  private clientConfig: ClientConfig | null = null;
  private latestRelease: LatestReleaseResponse["release"] = null;
  private serviceConfigurationError: string | null = null;
  private serviceConfigurationLoadedAt = 0;
  private lastError: CloudServiceStatus["lastError"] = null;
  private refreshInFlight: Promise<CloudServiceStatus> | null = null;
  private readonly appVersion: string;

  constructor(
    client: CloudClient,
    configuration: CloudConfigurationProvider,
    devices: DeviceIdentityStore,
    appVersion = "0.0.0",
  ) {
    this.client = client;
    this.configuration = configuration;
    this.devices = devices;
    this.appVersion = appVersion;
  }

  async getStatus(): Promise<CloudServiceStatus> {
    const configuration = await this.configuration.get();
    const device = await this.devices.get();
    if (configuration.contractStatus !== "READY") {
      return this.toStatus(configuration, device.deviceId, device.deviceName);
    }
    await this.refreshServiceConfiguration();
    if (this.auth.state === "SIGNED_OUT") {
      try {
        await this.loadAccount();
        this.auth.transition("AUTHENTICATING");
        this.auth.transition("AUTHENTICATED");
      } catch (error) {
        if (
          error
          && typeof error === "object"
          && "code" in error
          && (error.code === "UNAUTHORIZED" || error.code === "TOKEN_EXPIRED")
        ) {
          return this.toStatus(
            configuration,
            device.deviceId,
            device.deviceName,
          );
        }
        this.applyErrorState(error);
      }
    }
    return this.toStatus(configuration, device.deviceId, device.deviceName);
  }

  async login(
    credentials: CloudLoginCredentials,
  ): Promise<CloudServiceStatus> {
    const configuration = await this.requireContract();
    const device = await this.devices.get();
    this.moveToAuthenticating();
    try {
      const request: LoginRequest = {
        email: credentials.email,
        password: credentials.password,
        device,
      };
      await this.client.login(request);
      await this.client.registerDevice(device);
      this.transitionFromAny("AUTHENTICATED");
      await this.loadAccount();
      await this.refreshServiceConfiguration();
    } catch (error) {
      this.applyErrorState(error);
      throw error;
    }
    return this.toStatus(configuration, device.deviceId, device.deviceName);
  }

  async register(request: RegisterRequestV2): Promise<User> {
    await this.requireContract();
    return this.client.register(request);
  }

  async logout(): Promise<CloudServiceStatus> {
    const configuration = await this.requireContract();
    try {
      await this.client.logout();
    } finally {
      this.account = null;
      this.lastError = null;
      this.moveToSignedOut();
    }
    const device = await this.devices.get();
    return this.toStatus(configuration, device.deviceId, device.deviceName);
  }

  async refresh(): Promise<CloudServiceStatus> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  async handleRequestError(error: unknown): Promise<CloudServiceStatus> {
    this.applyErrorState(error);
    const [configuration, device] = await Promise.all([
      this.configuration.get(),
      this.devices.get(),
    ]);
    return this.toStatus(configuration, device.deviceId, device.deviceName);
  }

  async revokeDevice(id: string): Promise<CloudServiceStatus> {
    await this.client.revokeDevice(id);
    return this.refresh();
  }

  async renameDevice(id: string, deviceName: string): Promise<CloudServiceStatus> {
    await this.client.renameDevice(id, deviceName);
    return this.refresh();
  }

  async applyReferral(code: string): Promise<CloudServiceStatus> {
    await this.client.applyReferral(code);
    return this.refresh();
  }

  async getUsageSettlement(responseId: string): Promise<UsageSettlementV2> {
    await this.requireContract();
    return this.client.getUsageByResponse(responseId);
  }

  async reconcileResponse(target: {
    responseId?: string | null;
    requestId?: string | null;
    recovery?: boolean;
  }): Promise<{
    settlement: UsageSettlementV2;
    status: CloudServiceStatus;
  }> {
    const configuration = await this.requireContract();
    const settlement = await this.pollSettlement(target);
    const [usage, usageHistory, walletTransactions, device] = await Promise.all([
      this.client.getUsageV2(),
      this.client.getUsageHistory(),
      this.client.listWalletTransactions(),
      this.devices.get(),
    ]);
    this.usageV2 = usage;
    this.usageHistory = usageHistory;
    this.walletTransactions = walletTransactions;
    if (this.account) {
      this.account = { ...this.account, wallet: settlement.wallet };
    } else {
      this.account = await this.client.getMeV2();
    }
    this.lastError = null;
    return {
      settlement,
      status: this.toStatus(configuration, device.deviceId, device.deviceName),
    };
  }

  async createProviderConnection(request: {
    providerId: string;
    label: string;
    apiKey: string;
  }): Promise<{
    connection: ProviderConnectionV2;
    status: CloudServiceStatus;
  }> {
    const connection = await this.client.createProviderConnection(request);
    return { connection, status: await this.refresh() };
  }

  async deleteProviderConnection(id: string): Promise<CloudServiceStatus> {
    await this.client.deleteProviderConnection(id);
    return this.refresh();
  }

  private async performRefresh(): Promise<CloudServiceStatus> {
    const configuration = await this.requireContract();
    const device = await this.devices.get();
    try {
      await this.loadAccount();
      await this.refreshServiceConfiguration();
      if (this.auth.state !== "AUTHENTICATED") {
        this.moveToAuthenticating();
        this.auth.transition("AUTHENTICATED");
      }
    } catch (error) {
      this.applyErrorState(error);
      throw error;
    }
    return this.toStatus(configuration, device.deviceId, device.deviceName);
  }

  private async loadAccount(): Promise<void> {
    const [
      account,
      devices,
      walletTransactions,
      usage,
      usageHistory,
      referral,
      referralHistory,
      providerConnections,
      providers,
    ] = await Promise.all([
      this.client.getMeV2(),
      this.client.listDevicesV2(),
      this.client.listWalletTransactions(),
      this.client.getUsageV2(),
      this.client.getUsageHistory(),
      this.client.getReferralSummary(),
      this.client.getReferralHistory(),
      this.client.listProviderConnections(),
      this.client.listProviders(),
    ]);
    this.account = account;
    this.devicesV2 = devices;
    this.walletTransactions = walletTransactions;
    this.usageV2 = usage;
    this.usageHistory = usageHistory;
    this.referral = referral;
    this.referralHistory = referralHistory;
    this.providerConnections = providerConnections;
    this.providers = [];
    for (const provider of providers) {
      this.providers.push({
        ...provider,
        models: await this.client.listProviderModels(provider.id),
      });
    }
    this.lastError = null;
  }

  private async refreshServiceConfiguration(force = false): Promise<void> {
    if (
      !force
      && Date.now() - this.serviceConfigurationLoadedAt < 5 * 60_000
    ) {
      return;
    }
    const [configResult, releaseResult] = await Promise.allSettled([
      this.client.getClientConfig(),
      this.client.getLatestRelease(),
    ]);
    const errors: string[] = [];
    if (configResult.status === "fulfilled") {
      this.clientConfig = configResult.value;
    } else {
      errors.push(errorMessage(configResult.reason));
    }
    if (releaseResult.status === "fulfilled") {
      this.latestRelease = releaseResult.value.release;
    } else {
      errors.push(errorMessage(releaseResult.reason));
    }
    this.serviceConfigurationError = errors.length > 0
      ? errors.join(" ")
      : null;
    this.serviceConfigurationLoadedAt = Date.now();
  }

  private async pollSettlement(target: {
    responseId?: string | null;
    requestId?: string | null;
    recovery?: boolean;
  }): Promise<UsageSettlementV2> {
    if (!target.responseId && !target.requestId) {
      throw new Error("Response or request ID is required for settlement.");
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const useRequestId = target.recovery && target.requestId;
        const settlement = useRequestId
          ? await this.client.getUsageByRequest(target.requestId!)
          : target.responseId
            ? await this.client.getUsageByResponse(target.responseId)
            : await this.client.getUsageByRequest(target.requestId!);
        if (settlement.usage) return settlement;
      } catch (error) {
        if (cloudErrorCode(error) !== "NOT_FOUND") throw error;
        lastError = error;
      }
      await delay(250 * (attempt + 1));
    }
    if (lastError) throw lastError;
    throw new Error("Cloud usage settlement did not complete in time.");
  }

  private async requireContract(): Promise<CloudConfiguration> {
    const configuration = await this.configuration.get();
    if (configuration.contractStatus !== "READY") {
      throw new CloudContractUnavailableError();
    }
    return configuration;
  }

  private applyErrorState(error: unknown): void {
    const policy = cloudErrorPolicy(error);
    this.lastError = {
      code: cloudErrorCode(error) ?? "UNKNOWN",
      message: error instanceof Error
        ? error.message
        : "Cloud 服务发生未知错误。",
      action: policy.action,
      retryable: policy.retryable,
    };
    const mapped = authStateForCloudError(error);
    if (mapped) {
      this.transitionFromAny(mapped);
    }
  }

  private moveToAuthenticating(): void {
    if (this.auth.state === "AUTHENTICATING") return;
    if (this.auth.state !== "SIGNED_OUT") {
      this.transitionFromAny("SIGNED_OUT");
    }
    this.auth.transition("AUTHENTICATING");
  }

  private moveToSignedOut(): void {
    this.transitionFromAny("SIGNED_OUT");
  }

  private transitionFromAny(next: CloudAuthState): void {
    if (this.auth.state === next) return;
    try {
      this.auth.transition(next);
    } catch {
      if (this.auth.state !== "SIGNED_OUT") {
        this.auth.transition("SIGNED_OUT");
      }
      if (next !== "SIGNED_OUT") {
        this.auth.transition("AUTHENTICATING");
        this.auth.transition(next);
      }
    }
  }

  private toStatus(
    configuration: CloudConfiguration,
    deviceId: string,
    deviceName: string,
  ): CloudServiceStatus {
    const contractReady = configuration.contractStatus === "READY";
    const currentDevice = this.devicesV2.find(
      (device) => device.deviceId === deviceId,
    );
    const usage = this.usageV2;
    const subscription = this.account?.subscription;
    const updateState = this.updateState();
    const serviceStatus = !contractReady
      ? "WAITING_FOR_CONTRACT"
      : updateState === "MAINTENANCE"
        ? "MAINTENANCE"
        : updateState === "REQUIRED"
          ? "UPDATE_REQUIRED"
          : this.auth.state === "SERVER_UNREACHABLE"
            ? "UNREACHABLE"
            : "AVAILABLE";
    return {
      contractVersion: CLOUD_CONTRACT_VERSION,
      authState: this.auth.state,
      contractReady,
      account: this.account?.account.email ?? null,
      plan: subscription?.planCode === "PRO"
        ? "Pro"
        : subscription?.planCode === "STANDARD"
          ? "Standard"
          : null,
      subscriptionStatus: subscription?.status ?? null,
      validUntil: subscription?.periodEnd ?? null,
      currentPeriodStart:
        subscription?.periodStart ?? null,
      currentPeriodEnd: subscription?.periodEnd ?? null,
      usage: usage
        ? `${String(usage.pointsCharged)} points · ${String(usage.requests)} requests`
        : null,
      usagePercent: null,
      usageRequests: usage?.requests ?? null,
      usageTokens: null,
      usagePointsUsed: usage?.pointsCharged ?? null,
      remainingPoints: this.account?.wallet.balance ?? null,
      currentDevice: currentDevice?.status === "ACTIVE"
        ? `${deviceName} · 已激活`
        : deviceName,
      currentDeviceId: currentDevice?.deviceId ?? null,
      devices: this.devicesV2.map((item) => ({
        id: item.id,
        deviceId: item.deviceId,
        name: item.deviceName,
        platform: item.platform,
        status: item.status,
        activatedAt: item.activatedAt,
        lastSeenAt: item.lastSeenAt,
        current: item.deviceId === deviceId,
      })),
      walletTransactions: this.walletTransactions,
      usageV2: this.usageV2,
      usageHistory: this.usageHistory,
      referral: this.referral,
      referralRegistrationUrl: this.auth.state === "AUTHENTICATED" && this.referral
        ? referralRegistrationUrl(configuration, this.referral.code)
        : null,
      referralHistory: this.referralHistory,
      providers: this.providers,
      providerConnections: this.providerConnections,
      clientConfig: this.clientConfig,
      latestRelease: this.latestRelease,
      serviceConfigurationError: this.serviceConfigurationError,
      updateState,
      lastError: this.lastError,
      accountManagementAvailable:
        configuration.accountManagementUrl !== null,
      subscriptionManagementAvailable:
        configuration.subscriptionManagementUrl !== null,
      serviceStatus,
      message: !contractReady
        ? "等待 Server Contract，当前继续使用本地 Copilot。"
        : this.lastError?.message
          ?? serviceStatusMessage(serviceStatus)
          ?? statusMessage(this.auth.state),
    };
  }

  private updateState(): CloudServiceStatus["updateState"] {
    if (
      this.clientConfig?.maintenance
      || this.clientConfig?.features.cloudGateway === false
    ) {
      return "MAINTENANCE";
    }
    if (
      this.clientConfig
      && compareVersions(this.appVersion, this.clientConfig.minimumVersion) < 0
    ) {
      return "REQUIRED";
    }
    if (
      this.latestRelease
      && compareVersions(this.latestRelease.version, this.appVersion) > 0
    ) {
      return "AVAILABLE";
    }
    if (
      this.clientConfig
      && compareVersions(this.clientConfig.latestVersion, this.appVersion) > 0
    ) {
      return "AVAILABLE";
    }
    return "CURRENT";
  }
}

function serviceStatusMessage(
  status: CloudServiceStatus["serviceStatus"],
): string | null {
  if (status === "MAINTENANCE") return "云服务正在维护，请稍后再试。";
  if (status === "UPDATE_REQUIRED") return "需要更新 Copilot Bridge 后才能继续使用云服务。";
  return null;
}

export function compareVersions(left: string, right: string): number {
  const parse = (value: string) => value
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  const leftParts = parse(left);
  const rightParts = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "无法读取 Cloud 更新配置。";
}

function statusMessage(state: CloudAuthState): string {
  switch (state) {
    case "SIGNED_OUT":
      return "登录后即可使用在线模型与订阅服务。";
    case "AUTHENTICATING":
      return "正在验证账号并注册当前设备。";
    case "AUTHENTICATED":
      return "Cloud 服务已连接。";
    case "DEVICE_REVOKED":
      return "当前设备已被撤销，请重新登录或管理设备。";
    case "SUBSCRIPTION_REQUIRED":
      return "当前账号需要有效订阅。";
    case "SUBSCRIPTION_EXPIRED":
      return "当前订阅已过期。";
    case "QUOTA_EXCEEDED":
      return "本月 AI 用量已达到套餐上限。";
    case "SERVER_UNREACHABLE":
      return "暂时无法连接 Cloud 服务。";
  }
}
