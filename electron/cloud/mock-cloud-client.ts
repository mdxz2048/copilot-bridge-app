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
import type {
  CloudClient,
  CloudResponseTransport,
  CreateResponseOptions,
} from "./cloud-client.js";

export type CloudClientMethod = keyof CloudClient;

type CloudClientResponse = {
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
