import type {
  Account,
  ClientConfig,
  Device,
  DeviceInfo,
  LoginRequest,
  LoginResponse,
  LatestReleaseResponse,
  MeV2,
  ModelV2,
  ModelList,
  ProviderConnectionV2,
  ProviderV2,
  ReferralCodeV2,
  ReferralRecordV2,
  ReferralSummaryV2,
  RegisterRequestV2,
  ResponseRequest,
  SubscriptionResponse,
  Usage,
  UsageHistoryRecord,
  UsageSettlementV2,
  UsageSummaryV2,
  User,
  WalletSummaryV2,
  WalletTransactionV2,
  DeviceV2,
} from "./contract.js";

export interface CloudResponseTransport {
  contentType: string;
  response: Response;
}

export interface CreateResponseOptions {
  threadId: string;
  signal?: AbortSignal;
  providerConnectionId?: string | null;
}

export interface CloudClient {
  register(request: RegisterRequestV2): Promise<User>;
  login(request: LoginRequest): Promise<LoginResponse>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
  getMe(): Promise<User>;
  getAccount(): Promise<Account>;
  registerDevice(request: DeviceInfo): Promise<Device>;
  listDevices(): Promise<Device[]>;
  getSubscription(): Promise<SubscriptionResponse>;
  getUsage(): Promise<Usage>;
  getUsageHistory(): Promise<UsageHistoryRecord[]>;
  getClientConfig(): Promise<ClientConfig>;
  listModels(): Promise<ModelList>;
  createResponse(
    request: ResponseRequest,
    options: CreateResponseOptions,
  ): Promise<CloudResponseTransport>;
  getLatestRelease(): Promise<LatestReleaseResponse>;
  getMeV2(): Promise<MeV2>;
  getWallet(): Promise<WalletSummaryV2>;
  listWalletTransactions(): Promise<WalletTransactionV2[]>;
  getUsageV2(): Promise<UsageSummaryV2>;
  getUsageByResponse(responseId: string): Promise<UsageSettlementV2>;
  getUsageByRequest(requestId: string): Promise<UsageSettlementV2>;
  listDevicesV2(): Promise<DeviceV2[]>;
  renameDevice(id: string, deviceName: string): Promise<DeviceV2>;
  revokeDevice(id: string): Promise<DeviceV2>;
  listProviders(): Promise<ProviderV2[]>;
  getProvider(id: string): Promise<ProviderV2>;
  listProviderModels(id: string): Promise<ModelV2[]>;
  listProviderConnections(): Promise<ProviderConnectionV2[]>;
  createProviderConnection(request: {
    providerId: string;
    label: string;
    apiKey: string;
  }): Promise<ProviderConnectionV2>;
  deleteProviderConnection(id: string): Promise<{
    id: string;
    status: "DISABLED";
  }>;
  getReferralCode(): Promise<ReferralCodeV2>;
  applyReferral(code: string): Promise<{
    id: string;
    status: string;
    riskReviewRequired: boolean;
  }>;
  getReferralSummary(): Promise<ReferralSummaryV2>;
  getReferralHistory(): Promise<ReferralRecordV2[]>;
}

export class CloudContractUnavailableError extends Error {
  constructor(message = "Cloud Server Contract 尚未就绪。") {
    super(message);
    this.name = "CloudContractUnavailableError";
  }
}

export class PendingCloudClient implements CloudClient {
  register(): Promise<never> {
    return this.unavailable();
  }
  login(): Promise<never> {
    return this.unavailable();
  }

  refresh(): Promise<never> {
    return this.unavailable();
  }

  logout(): Promise<never> {
    return this.unavailable();
  }

  getMe(): Promise<never> {
    return this.unavailable();
  }

  getAccount(): Promise<never> {
    return this.unavailable();
  }

  registerDevice(): Promise<never> {
    return this.unavailable();
  }

  listDevices(): Promise<never> {
    return this.unavailable();
  }

  getSubscription(): Promise<never> {
    return this.unavailable();
  }

  getUsage(): Promise<never> {
    return this.unavailable();
  }
  getUsageHistory(): Promise<never> { return this.unavailable(); }

  getClientConfig(): Promise<never> {
    return this.unavailable();
  }

  listModels(): Promise<never> {
    return this.unavailable();
  }

  createResponse(): Promise<never> {
    return this.unavailable();
  }

  getLatestRelease(): Promise<never> {
    return this.unavailable(
      "Release endpoint is missing from the frozen OpenAPI and Zod contract.",
    );
  }

  getMeV2(): Promise<never> { return this.unavailable(); }
  getWallet(): Promise<never> { return this.unavailable(); }
  listWalletTransactions(): Promise<never> { return this.unavailable(); }
  getUsageV2(): Promise<never> { return this.unavailable(); }
  getUsageByResponse(): Promise<never> { return this.unavailable(); }
  getUsageByRequest(): Promise<never> { return this.unavailable(); }
  listDevicesV2(): Promise<never> { return this.unavailable(); }
  renameDevice(): Promise<never> { return this.unavailable(); }
  revokeDevice(): Promise<never> { return this.unavailable(); }
  listProviders(): Promise<never> { return this.unavailable(); }
  getProvider(): Promise<never> { return this.unavailable(); }
  listProviderModels(): Promise<never> { return this.unavailable(); }
  listProviderConnections(): Promise<never> { return this.unavailable(); }
  createProviderConnection(): Promise<never> { return this.unavailable(); }
  deleteProviderConnection(): Promise<never> { return this.unavailable(); }
  getReferralCode(): Promise<never> { return this.unavailable(); }
  applyReferral(): Promise<never> { return this.unavailable(); }
  getReferralSummary(): Promise<never> { return this.unavailable(); }
  getReferralHistory(): Promise<never> { return this.unavailable(); }

  private unavailable(message?: string): Promise<never> {
    return Promise.reject(new CloudContractUnavailableError(message));
  }
}
