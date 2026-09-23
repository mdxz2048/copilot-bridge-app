import type {
  Account,
  ClientConfig,
  Device,
  DeviceInfo,
  LoginRequest,
  LoginResponse,
  LatestReleaseResponse,
  ModelList,
  ResponseRequest,
  SubscriptionResponse,
  Usage,
  User,
} from "./contract.js";

export interface CloudResponseTransport {
  contentType: string;
  response: Response;
}

export interface CreateResponseOptions {
  threadId: string;
  signal?: AbortSignal;
}

export interface CloudClient {
  login(request: LoginRequest): Promise<LoginResponse>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
  getMe(): Promise<User>;
  getAccount(): Promise<Account>;
  registerDevice(request: DeviceInfo): Promise<Device>;
  listDevices(): Promise<Device[]>;
  getSubscription(): Promise<SubscriptionResponse>;
  getUsage(): Promise<Usage>;
  getClientConfig(): Promise<ClientConfig>;
  listModels(): Promise<ModelList>;
  createResponse(
    request: ResponseRequest,
    options: CreateResponseOptions,
  ): Promise<CloudResponseTransport>;
  getLatestRelease(): Promise<LatestReleaseResponse>;
}

export class CloudContractUnavailableError extends Error {
  constructor(message = "Cloud Server Contract 尚未就绪。") {
    super(message);
    this.name = "CloudContractUnavailableError";
  }
}

export class PendingCloudClient implements CloudClient {
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

  private unavailable(message?: string): Promise<never> {
    return Promise.reject(new CloudContractUnavailableError(message));
  }
}
