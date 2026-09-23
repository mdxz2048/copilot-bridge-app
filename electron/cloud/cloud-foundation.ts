import type { CloudAuthState } from "./auth-state.js";
import { CloudAuthStateMachine } from "./auth-state.js";
import type { CloudClient } from "./cloud-client.js";
import { CloudContractUnavailableError } from "./cloud-client.js";
import type {
  CloudConfiguration,
  CloudConfigurationProvider,
} from "./cloud-config.js";
import type { Account, LoginRequest } from "./contract.js";
import type { DeviceIdentityStore } from "./device-identity.js";
import { authStateForCloudError } from "./cloud-error.js";

export interface CloudServiceStatus {
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
  currentDevice: string;
  currentDeviceId: string | null;
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
  private account: Account | null = null;
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
      this.auth.transition("AUTHENTICATED");
      await this.loadAccount();
    } catch (error) {
      this.applyErrorState(error);
      throw error;
    }
    return this.toStatus(configuration, device.deviceId, device.deviceName);
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
    this.account = await this.client.getAccount();
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
    const currentDevice = this.account?.devices.find(
      (device) => device.deviceId === deviceId,
    );
    const usage = this.account?.usage;
    return {
      authState: this.auth.state,
      contractReady,
      account: this.account?.user.email ?? null,
      plan: this.account?.plan?.code === "PRO"
        ? "Pro"
        : this.account?.plan?.code === "STANDARD"
          ? "Standard"
          : null,
      subscriptionStatus: this.account?.subscription?.status ?? null,
      validUntil: this.account?.subscription?.currentPeriodEnd ?? null,
      currentPeriodStart:
        this.account?.subscription?.currentPeriodStart ?? null,
      currentPeriodEnd: this.account?.subscription?.currentPeriodEnd ?? null,
      usage: usage
        ? `${String(usage.percent)}% · ${String(usage.requests)} requests · ${String(usage.tokens)} tokens`
        : null,
      usagePercent: usage?.percent ?? null,
      usageRequests: usage?.requests ?? null,
      usageTokens: usage?.tokens ?? null,
      currentDevice: currentDevice?.status === "ACTIVE"
        ? `${deviceName} · 已激活`
        : deviceName,
      currentDeviceId: currentDevice?.deviceId ?? null,
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
