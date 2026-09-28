import { z } from "zod";
import {
  AccountSchema,
  ClientConfigSchema,
  DeviceInfoSchema,
  DeviceListSchema,
  DeviceV2Schema,
  ErrorResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  LatestReleaseResponseSchema,
  LogoutResponseSchema,
  MeResponseSchema,
  ModelListSchema,
  ModelV2Schema,
  RefreshResponseSchema,
  ReferralApplyV2Schema,
  ReferralCodeV2Schema,
  ReferralRecordV2Schema,
  ReferralSummaryV2Schema,
  RegisterRequestV2Schema,
  RegisterDeviceResponseSchema,
  RegisterV2ResponseSchema,
  ResponseRequestSchema,
  SubscriptionResponseSchema,
  UsageSettlementV2Schema,
  UsageSchema,
  UsageHistoryRecordSchema,
  UsageSummaryV2Schema,
  WalletSummaryV2Schema,
  WalletTransactionV2Schema,
  type Account,
  type ClientConfig,
  type Device,
  type DeviceInfo,
  type DeviceV2,
  type LoginRequest,
  type LoginResponse,
  type LatestReleaseResponse,
  type ModelList,
  type ModelV2,
  type ProviderConnectionV2,
  type ProviderV2,
  type ReferralCodeV2,
  type ReferralRecordV2,
  type ReferralSummaryV2,
  type RegisterRequestV2,
  type ResponseRequest,
  type SubscriptionResponse,
  type Usage,
  type UsageHistoryRecord,
  type UsageSettlementV2,
  type UsageSummaryV2,
  type User,
  type WalletSummaryV2,
  type WalletTransactionV2,
  MeV2Schema,
  ProviderConnectionV2Schema,
  ProviderV2Schema,
  type MeV2,
} from "./contract.js";
import type {
  CloudClient,
  CloudResponseTransport,
  CreateResponseOptions,
} from "./cloud-client.js";
import { CloudError } from "./cloud-error.js";
import type { DeviceIdentityStore } from "./device-identity.js";
import { withSingleTokenRefreshRetry } from "./retry.js";
import type { CloudTokenSession } from "./token-store.js";

export interface HttpCloudClientOptions {
  baseUrl: string;
  tokens: CloudTokenSession;
  devices: DeviceIdentityStore;
  timeoutMs?: number;
  defaultHeaders?: HeadersInit;
  fetch?: typeof fetch;
}

export class HttpCloudClient implements CloudClient {
  private readonly baseUrl: string;
  private readonly tokens: CloudTokenSession;
  private readonly devices: DeviceIdentityStore;
  private readonly timeoutMs: number;
  private readonly defaultHeaders: Headers;
  private readonly fetch: typeof fetch;

  constructor(options: HttpCloudClientOptions) {
    this.baseUrl = new URL(options.baseUrl).toString().replace(/\/$/, "");
    this.tokens = options.tokens;
    this.devices = options.devices;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.defaultHeaders = new Headers(options.defaultHeaders);
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async register(request: RegisterRequestV2): Promise<User> {
    const response = await this.requestJson(
      "/api/v1/auth/register",
      RegisterV2ResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(RegisterRequestV2Schema.parse(request)),
      },
    );
    return response.user;
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    const body = LoginRequestSchema.parse(request);
    const response = await this.requestJson(
      "/api/v1/auth/login",
      LoginResponseSchema,
      { method: "POST", body: JSON.stringify(body) },
    );
    await this.tokens.rotate(response);
    return response;
  }

  async refresh(): Promise<void> {
    const refreshToken = await this.tokens.readRefreshToken();
    if (!refreshToken) {
      throw new CloudError("UNAUTHORIZED", "No Cloud refresh token is stored.");
    }
    const response = await this.requestJson(
      "/api/v1/auth/refresh",
      RefreshResponseSchema,
      {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      },
    );
    await this.tokens.rotate(response);
  }

  async logout(): Promise<void> {
    if (!(await this.tokens.readRefreshToken())) {
      await this.tokens.clear();
      return;
    }
    await withSingleTokenRefreshRetry(
      async () => {
        const refreshToken = await this.tokens.readRefreshToken();
        if (!refreshToken) {
          throw new CloudError(
            "UNAUTHORIZED",
            "No Cloud refresh token is stored.",
          );
        }
        const response = await this.authenticatedFetch(
          "/api/v1/auth/logout",
          {
            method: "POST",
            body: JSON.stringify({ refreshToken }),
          },
        );
        await parseResponse(response, LogoutResponseSchema);
      },
      () => this.refresh(),
    );
    await this.tokens.clear();
  }

  async getMe(): Promise<User> {
    const response = await this.authenticatedJson(
      "/api/v1/auth/me",
      MeResponseSchema,
    );
    return response.user;
  }

  getAccount(): Promise<Account> {
    return this.authenticatedJson("/api/v1/account", AccountSchema);
  }

  async registerDevice(request: DeviceInfo): Promise<Device> {
    const response = await this.authenticatedJson(
      "/api/v1/devices/register",
      RegisterDeviceResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(DeviceInfoSchema.parse(request)),
      },
    );
    return response.device;
  }

  async listDevices(): Promise<Device[]> {
    const response = await this.authenticatedJson(
      "/api/v1/devices",
      DeviceListSchema,
    );
    return response.data;
  }

  getSubscription(): Promise<SubscriptionResponse> {
    return this.authenticatedJson(
      "/api/v1/subscription",
      SubscriptionResponseSchema,
    );
  }

  getUsage(): Promise<Usage> {
    return this.authenticatedJson("/api/v1/usage/current", UsageSchema);
  }

  async getUsageHistory(): Promise<UsageHistoryRecord[]> {
    const response = await this.authenticatedJson(
      "/api/v1/usage/history",
      z.object({ data: z.array(UsageHistoryRecordSchema) }),
    );
    return response.data;
  }

  getClientConfig(): Promise<ClientConfig> {
    return this.requestJson("/api/v1/client/config", ClientConfigSchema);
  }

  getLatestRelease(): Promise<LatestReleaseResponse> {
    return this.requestJson(
      "/api/v1/releases/latest",
      LatestReleaseResponseSchema,
    );
  }

  getMeV2(): Promise<MeV2> {
    return this.authenticatedJson("/api/v1/me", MeV2Schema);
  }

  getWallet(): Promise<WalletSummaryV2> {
    return this.authenticatedJson(
      "/api/v1/me/wallet",
      WalletSummaryV2Schema,
    );
  }

  async listWalletTransactions(): Promise<WalletTransactionV2[]> {
    const response = await this.authenticatedJson(
      "/api/v1/me/wallet/transactions",
      z.object({ data: z.array(WalletTransactionV2Schema) }),
    );
    return response.data;
  }

  getUsageV2(): Promise<UsageSummaryV2> {
    return this.authenticatedJson("/api/v1/me/usage", UsageSummaryV2Schema);
  }

  getUsageByResponse(responseId: string): Promise<UsageSettlementV2> {
    const id = z.string().regex(/^resp_[a-f0-9]{32}$/).parse(responseId);
    return this.authenticatedJson(
      `/api/v1/usage/responses/${encodeURIComponent(id)}`,
      UsageSettlementV2Schema,
    );
  }

  getUsageByRequest(requestId: string): Promise<UsageSettlementV2> {
    const id = z.uuid().parse(requestId);
    return this.authenticatedJson(
      `/api/v1/usage/requests/${encodeURIComponent(id)}`,
      UsageSettlementV2Schema,
    );
  }

  async listDevicesV2(): Promise<DeviceV2[]> {
    const response = await this.authenticatedJson(
      "/api/v1/me/devices",
      z.object({ data: z.array(DeviceV2Schema) }),
    );
    return response.data;
  }

  async renameDevice(id: string, deviceName: string): Promise<DeviceV2> {
    const response = await this.authenticatedJson(
      `/api/v1/devices/${encodeURIComponent(z.uuid().parse(id))}`,
      z.object({ device: DeviceV2Schema }),
      {
        method: "PATCH",
        body: JSON.stringify({
          deviceName: z.string().trim().min(1).max(120).parse(deviceName),
        }),
      },
    );
    return response.device;
  }

  async revokeDevice(id: string): Promise<DeviceV2> {
    const response = await this.authenticatedJson(
      `/api/v1/devices/${encodeURIComponent(z.uuid().parse(id))}/revoke`,
      z.object({ device: DeviceV2Schema }),
      { method: "POST" },
    );
    return response.device;
  }

  async listProviders(): Promise<ProviderV2[]> {
    const response = await this.authenticatedJson(
      "/api/v1/providers",
      z.object({ data: z.array(ProviderV2Schema) }),
    );
    return response.data;
  }

  getProvider(id: string): Promise<ProviderV2> {
    return this.authenticatedJson(
      `/api/v1/providers/${encodeURIComponent(z.uuid().parse(id))}`,
      ProviderV2Schema,
    );
  }

  async listProviderModels(id: string): Promise<ModelV2[]> {
    const response = await this.authenticatedJson(
      `/api/v1/providers/${encodeURIComponent(z.uuid().parse(id))}/models`,
      z.object({ data: z.array(ModelV2Schema) }),
    );
    return response.data;
  }

  async listProviderConnections(): Promise<ProviderConnectionV2[]> {
    const response = await this.authenticatedJson(
      "/api/v1/me/provider-connections",
      z.object({ data: z.array(ProviderConnectionV2Schema) }),
    );
    return response.data;
  }

  createProviderConnection(request: {
    providerId: string;
    label: string;
    apiKey: string;
  }): Promise<ProviderConnectionV2> {
    return this.authenticatedJson(
      "/api/v1/me/provider-connections",
      ProviderConnectionV2Schema,
      {
        method: "POST",
        body: JSON.stringify(z.object({
          providerId: z.uuid(),
          label: z.string().trim().min(1).max(120),
          apiKey: z.string().min(8).max(4096),
        }).parse(request)),
      },
    );
  }

  deleteProviderConnection(id: string): Promise<{
    id: string;
    status: "DISABLED";
  }> {
    return this.authenticatedJson(
      `/api/v1/me/provider-connections/${encodeURIComponent(z.uuid().parse(id))}`,
      z.object({ id: z.uuid(), status: z.literal("DISABLED") }),
      { method: "DELETE" },
    );
  }

  getReferralCode(): Promise<ReferralCodeV2> {
    return this.authenticatedJson(
      "/api/v1/referral/code",
      ReferralCodeV2Schema,
    );
  }

  applyReferral(code: string): Promise<{
    id: string;
    status: string;
    riskReviewRequired: boolean;
  }> {
    return this.authenticatedJson(
      "/api/v1/referral/apply",
      ReferralApplyV2Schema,
      {
        method: "POST",
        body: JSON.stringify({
          code: z.string().trim().min(8).max(24).parse(code),
        }),
      },
    );
  }

  getReferralSummary(): Promise<ReferralSummaryV2> {
    return this.authenticatedJson(
      "/api/v1/referral/stats",
      ReferralSummaryV2Schema,
    );
  }

  async getReferralHistory(): Promise<ReferralRecordV2[]> {
    const response = await this.authenticatedJson(
      "/api/v1/referral/history",
      z.object({ data: z.array(ReferralRecordV2Schema) }),
    );
    return response.data;
  }

  async listModels(): Promise<ModelList> {
    return this.authenticatedJson("/v1/models", ModelListSchema, {}, true);
  }

  async createResponse(
    request: ResponseRequest,
    options: CreateResponseOptions,
  ): Promise<CloudResponseTransport> {
    const body = ResponseRequestSchema.parse(request);
    if (!options.threadId.trim()) {
      throw new CloudError(
        "CLIENT_THREAD_ID_REQUIRED",
        "A stable Cloud client thread ID is required.",
      );
    }
    const send = () => this.authenticatedFetch(
      "/v1/responses",
      {
        method: "POST",
        body: JSON.stringify(body),
        signal: options.signal,
        headers: {
          "X-Client-Thread-ID": options.threadId,
          ...(options.providerConnectionId && {
            "X-Provider-Connection-ID": options.providerConnectionId,
          }),
        },
      },
      true,
    );
    const response = await withSingleTokenRefreshRetry(send, () =>
      this.refresh()
    );
    return {
      contentType: response.headers.get("content-type") ?? "",
      response,
    };
  }

  private authenticatedJson<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    gateway = false,
  ): Promise<T> {
    return withSingleTokenRefreshRetry(
      async () => {
        const response = await this.authenticatedFetch(path, init, gateway);
        return parseResponse(response, schema);
      },
      () => this.refresh(),
    );
  }

  private async authenticatedFetch(
    path: string,
    init: RequestInit = {},
    gateway = false,
  ): Promise<Response> {
    const accessToken = this.tokens.getAccessToken();
    if (!accessToken) {
      throw new CloudError("TOKEN_EXPIRED", "Cloud access token is unavailable.");
    }
    const headers = new Headers(this.defaultHeaders);
    new Headers(init.headers).forEach((value, name) => {
      headers.set(name, value);
    });
    headers.set("Authorization", ["Bearer", accessToken].join(" "));
    if (gateway) {
      headers.set("X-Device-ID", (await this.devices.get()).deviceId);
    }
    const response = await this.rawFetch(path, { ...init, headers });
    if (!response.ok) throw await responseError(response);
    return response;
  }

  private async requestJson<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.rawFetch(path, init);
    if (!response.ok) throw await responseError(response);
    return parseResponse(response, schema);
  }

  private rawFetch(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body != null) headers.set("Content-Type", "application/json");
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    return this.fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
      signal,
    }).catch((error: unknown) => {
      if (error instanceof CloudError) throw error;
      throw new CloudError(
        "SERVER_UNREACHABLE",
        error instanceof Error ? error.message : "Cloud Server is unreachable.",
        { cause: error },
      );
    });
  }
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new CloudError(
      "INVALID_SERVER_RESPONSE",
      `Cloud response did not match the frozen contract: ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

async function responseError(response: Response): Promise<CloudError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return new CloudError(
      "INVALID_SERVER_RESPONSE",
      `Cloud error response was not JSON (HTTP ${String(response.status)}).`,
      { cause: error },
    );
  }
  const parsed = ErrorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return new CloudError(
      "INVALID_SERVER_RESPONSE",
      `Cloud error response did not match the frozen contract (HTTP ${String(response.status)}).`,
      { cause: parsed.error },
    );
  }
  return new CloudError(
    parsed.data.error.code,
    parsed.data.error.message,
    {
      httpStatus: response.status,
      requestId:
        parsed.data.error.request_id ?? parsed.data.error.requestId,
    },
  );
}
