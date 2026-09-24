import type {
  Account,
  ClientConfig,
  Device,
  DeviceInfo,
  LoginRequest,
  LoginResponse,
  LatestReleaseResponse,
  MeV2,
  ModelList,
  ModelV2,
  ProviderConnectionV2,
  ProviderV2,
  ReferralCodeV2,
  ReferralRecordV2,
  ReferralSummaryV2,
  RegisterRequestV2,
  ResponseRequest,
  SubscriptionResponse,
  Usage,
  UsageSettlementV2,
  UsageSummaryV2,
  User,
  WalletSummaryV2,
  WalletTransactionV2,
  DeviceV2,
} from "./contract.js";
import type {
  CloudClient,
  CloudResponseTransport,
  CreateResponseOptions,
} from "./cloud-client.js";

export type CloudClientMethod = keyof CloudClient;

type CloudClientResponse = {
  register: User;
  login: LoginResponse;
  refresh: void;
  logout: void;
  getMe: User;
  getAccount: Account;
  registerDevice: Device;
  listDevices: Device[];
  getSubscription: SubscriptionResponse;
  getUsage: Usage;
  getClientConfig: ClientConfig;
  listModels: ModelList;
  createResponse: CloudResponseTransport;
  getLatestRelease: LatestReleaseResponse;
  getMeV2: MeV2;
  getWallet: WalletSummaryV2;
  listWalletTransactions: WalletTransactionV2[];
  getUsageV2: UsageSummaryV2;
  getUsageByResponse: UsageSettlementV2;
  listDevicesV2: DeviceV2[];
  renameDevice: DeviceV2;
  revokeDevice: DeviceV2;
  listProviders: ProviderV2[];
  getProvider: ProviderV2;
  listProviderModels: ModelV2[];
  listProviderConnections: ProviderConnectionV2[];
  createProviderConnection: ProviderConnectionV2;
  deleteProviderConnection: { id: string; status: "DISABLED" };
  getReferralCode: ReferralCodeV2;
  applyReferral: { id: string; status: string; riskReviewRequired: boolean };
  getReferralSummary: ReferralSummaryV2;
  getReferralHistory: ReferralRecordV2[];
};

export class MockCloudClient implements CloudClient {
  readonly calls: Array<{ method: CloudClientMethod; request?: unknown }> = [];
  private readonly responses = new Map<CloudClientMethod, unknown>();
  private readonly errors = new Map<CloudClientMethod, unknown>();

  respond<K extends CloudClientMethod>(
    method: K,
    response: CloudClientResponse[K],
  ): this {
    this.responses.set(method, response);
    this.errors.delete(method);
    return this;
  }

  reject(method: CloudClientMethod, error: unknown): this {
    this.errors.set(method, error);
    this.responses.delete(method);
    return this;
  }

  register(request: RegisterRequestV2): Promise<User> {
    return this.invoke("register", request);
  }

  login(request: LoginRequest): Promise<LoginResponse> {
    return this.invoke("login", request);
  }

  refresh(): Promise<void> {
    return this.invoke("refresh");
  }

  logout(): Promise<void> {
    return this.invoke("logout");
  }

  getMe(): Promise<User> {
    return this.invoke("getMe");
  }

  getAccount(): Promise<Account> {
    return this.invoke("getAccount");
  }

  registerDevice(request: DeviceInfo): Promise<Device> {
    return this.invoke("registerDevice", request);
  }

  listDevices(): Promise<Device[]> {
    return this.invoke("listDevices");
  }

  getSubscription(): Promise<SubscriptionResponse> {
    return this.invoke("getSubscription");
  }

  getUsage(): Promise<Usage> {
    return this.invoke("getUsage");
  }

  getClientConfig(): Promise<ClientConfig> {
    return this.invoke("getClientConfig");
  }

  listModels(): Promise<ModelList> {
    return this.invoke("listModels");
  }

  createResponse(
    request: ResponseRequest,
    options: CreateResponseOptions,
  ): Promise<CloudResponseTransport> {
    return this.invoke("createResponse", { request, options });
  }

  getLatestRelease(): Promise<LatestReleaseResponse> {
    return this.invoke("getLatestRelease");
  }

  getMeV2(): Promise<MeV2> { return this.invoke("getMeV2"); }
  getWallet(): Promise<WalletSummaryV2> { return this.invoke("getWallet"); }
  listWalletTransactions(): Promise<WalletTransactionV2[]> {
    return this.invoke("listWalletTransactions");
  }
  getUsageV2(): Promise<UsageSummaryV2> { return this.invoke("getUsageV2"); }
  getUsageByResponse(responseId: string): Promise<UsageSettlementV2> {
    return this.invoke("getUsageByResponse", responseId);
  }
  listDevicesV2(): Promise<DeviceV2[]> { return this.invoke("listDevicesV2"); }
  renameDevice(id: string, deviceName: string): Promise<DeviceV2> {
    return this.invoke("renameDevice", { id, deviceName });
  }
  revokeDevice(id: string): Promise<DeviceV2> {
    return this.invoke("revokeDevice", id);
  }
  listProviders(): Promise<ProviderV2[]> { return this.invoke("listProviders"); }
  getProvider(id: string): Promise<ProviderV2> {
    return this.invoke("getProvider", id);
  }
  listProviderModels(id: string): Promise<ModelV2[]> {
    return this.invoke("listProviderModels", id);
  }
  listProviderConnections(): Promise<ProviderConnectionV2[]> {
    return this.invoke("listProviderConnections");
  }
  createProviderConnection(request: {
    providerId: string;
    label: string;
    apiKey: string;
  }): Promise<ProviderConnectionV2> {
    return this.invoke("createProviderConnection", request);
  }
  deleteProviderConnection(id: string): Promise<{
    id: string;
    status: "DISABLED";
  }> {
    return this.invoke("deleteProviderConnection", id);
  }
  getReferralCode(): Promise<ReferralCodeV2> {
    return this.invoke("getReferralCode");
  }
  applyReferral(code: string): Promise<{
    id: string;
    status: string;
    riskReviewRequired: boolean;
  }> {
    return this.invoke("applyReferral", code);
  }
  getReferralSummary(): Promise<ReferralSummaryV2> {
    return this.invoke("getReferralSummary");
  }
  getReferralHistory(): Promise<ReferralRecordV2[]> {
    return this.invoke("getReferralHistory");
  }

  private invoke<K extends CloudClientMethod>(
    method: K,
    request?: unknown,
  ): Promise<CloudClientResponse[K]> {
    this.calls.push({ method, request });
    if (this.errors.has(method)) {
      return Promise.reject(this.errors.get(method));
    }
    return Promise.resolve(
      this.responses.get(method) as CloudClientResponse[K],
    );
  }
}
