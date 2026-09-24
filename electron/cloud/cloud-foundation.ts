import type { CloudAuthState } from "./auth-state.js";
import { CloudAuthStateMachine } from "./auth-state.js";
import type { CloudClient } from "./cloud-client.js";
import { CloudContractUnavailableError } from "./cloud-client.js";
import type {
  CloudConfiguration,
  CloudConfigurationProvider,
} from "./cloud-config.js";
import { CLOUD_CONTRACT_VERSION } from "./contract.js";
import type {
  LoginRequest,
  MeV2,
  ProviderConnectionV2,
  ProviderV2,
  ReferralRecordV2,
  ReferralSummaryV2,
  RegisterRequestV2,
  UsageSettlementV2,
  UsageSummaryV2,
  User,
  WalletTransactionV2,
} from "./contract.js";
import type { DeviceIdentityStore } from "./device-identity.js";
import { authStateForCloudError } from "./cloud-error.js";

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
  referral: ReferralSummaryV2 | null;
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
  accountManagementAvailable: boolean;
  subscriptionManagementAvailable: boolean;
  serviceStatus: "WAITING_FOR_CONTRACT" | "AVAILABLE" | "UNREACHABLE";
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
  private referral: ReferralSummaryV2 | null = null;
  private referralHistory: ReferralRecordV2[] = [];
  private providers: CloudServiceStatus["providers"] = [];
  private providerConnections: ProviderConnectionV2[] = [];
  private refreshInFlight: Promise<CloudServiceStatus> | null = null;

  constructor(
    client: CloudClient,
    configuration: CloudConfigurationProvider,
    devices: DeviceIdentityStore,
  ) {
    this.client = client;
    this.configuration = configuration;
    this.devices = devices;
  }

  async getStatus(): Promise<CloudServiceStatus> {
    const configuration = await this.configuration.get();
    const device = await this.devices.get();
    if (configuration.contractStatus !== "READY") {
      return this.toStatus(configuration, device.deviceId, device.deviceName);
    }
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
    this.account = await this.client.getMeV2();
    this.devicesV2 = await this.client.listDevicesV2();
    this.walletTransactions = await this.client.listWalletTransactions();
    this.usageV2 = await this.client.getUsageV2();
    this.referral = await this.client.getReferralSummary();
    this.referralHistory = await this.client.getReferralHistory();
    this.providerConnections = await this.client.listProviderConnections();
    const providers = await this.client.listProviders();
    this.providers = [];
    for (const provider of providers) {
      this.providers.push({
        ...provider,
        models: await this.client.listProviderModels(provider.id),
      });
    }
  }

  private async requireContract(): Promise<CloudConfiguration> {
    const configuration = await this.configuration.get();
    if (configuration.contractStatus !== "READY") {
      throw new CloudContractUnavailableError();
    }
    return configuration;
  }

  private applyErrorState(error: unknown): void {
    const mapped = authStateForCloudError(error);
    if (mapped) {
      this.transitionFromAny(mapped);
      return;
    }
    this.transitionFromAny("SIGNED_OUT");
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
      referral: this.referral,
      referralHistory: this.referralHistory,
      providers: this.providers,
      providerConnections: this.providerConnections,
      accountManagementAvailable:
        configuration.accountManagementUrl !== null,
      subscriptionManagementAvailable:
        configuration.subscriptionManagementUrl !== null,
      serviceStatus: !contractReady
        ? "WAITING_FOR_CONTRACT"
        : this.auth.state === "SERVER_UNREACHABLE"
          ? "UNREACHABLE"
          : "AVAILABLE",
      message: !contractReady
        ? "等待 Server Contract，当前继续使用本地 Copilot。"
        : statusMessage(this.auth.state),
    };
  }
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
