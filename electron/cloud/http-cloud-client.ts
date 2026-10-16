import { z } from "zod";
import {
  AccountSchema,
  ClientConfigSchema,
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
  RegisterDeviceRequestV2Schema,
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
import { transportFailureMessage } from "./transport-diagnostics.js";
import type { DeviceIdentityStore } from "./device-identity.js";
import type { DeviceKeyStore } from "./device-proof.js";
import { withSingleTokenRefreshRetry } from "./retry.js";
import { FailureFeedbackSchema, FailureFeedbackResultSchema, sanitizeFailure, type FailureFeedback } from "./failure-feedback.js";
import type { CloudTokenSession } from "./token-store.js";

export interface HttpCloudClientOptions {
  baseUrl: string;
  tokens: CloudTokenSession;
  devices: DeviceIdentityStore;
  deviceKeys: DeviceKeyStore;
  timeoutMs?: number;
  responseTimeoutMs?: number;
  defaultHeaders?: HeadersInit;
  fetch?: typeof fetch;
}

export class HttpCloudClient implements CloudClient {
  private readonly baseUrl: string;
  private readonly tokens: CloudTokenSession;
  private readonly devices: DeviceIdentityStore;
  private readonly deviceKeys: DeviceKeyStore;
  private readonly timeoutMs: number;
  private readonly responseTimeoutMs: number;
  private readonly defaultHeaders: Headers;
  private readonly fetch: typeof fetch;
  private refreshInFlight: Promise<void> | null = null;
  private cachedUserId:string|null=null;
  private identityEpoch=0;
  getCachedUserId():string|null {return this.tokens.getAccessToken()?this.cachedUserId:null;}
  submitFailureFeedback(report:FailureFeedback) {
    const body=FailureFeedbackSchema.parse(report);
    if(this.getCachedUserId()!==body.ownerUserId)throw new CloudError("FEEDBACK_OWNER_MISMATCH","Failure report belongs to another account.",{httpStatus:409});
    return this.authenticatedJson("/api/v1/diagnostics/failures",FailureFeedbackResultSchema,{method:"POST",body:JSON.stringify(body)},true);
  }

  constructor(options: HttpCloudClientOptions) {
    this.baseUrl = new URL(options.baseUrl).toString().replace(/\/$/, "");
    this.tokens = options.tokens;
    this.devices = options.devices;
    this.deviceKeys = options.deviceKeys;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.responseTimeoutMs = options.responseTimeoutMs ?? 70 * 60_000;
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
    const epoch=++this.identityEpoch;
    this.cachedUserId=null;
    const key = await this.deviceKeys.get();
    const body = LoginRequestSchema.parse({
      ...request,
      device: { ...request.device, publicKeyJwk: key.publicKeyJwk },
    });
    const response = await this.requestJson(
      "/api/v1/auth/login",
      LoginResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(body),
        redirect: "manual",
      },
    );
    await this.tokens.rotate(response);
    if(epoch===this.identityEpoch)this.cachedUserId=response.user.id;
    return response;
  }

  refresh(): Promise<void> {
    this.refreshInFlight ??= this.performRefresh().finally(() => {
      this.refreshInFlight = null;
    });
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<void> {
    const refreshToken = await this.tokens.readRefreshToken();
    if (!refreshToken) {
      throw new CloudError("UNAUTHORIZED", "No Cloud refresh token is stored.");
    }
    const body = JSON.stringify({ refreshToken });
    const response = await this.requestJson(
      "/api/v1/auth/refresh",
      RefreshResponseSchema,
      {
        method: "POST",
        body,
        headers: (await this.deviceKeys.get()).sign(
          "POST",
          `${this.baseUrl}/api/v1/auth/refresh`,
          refreshToken,
          body,
        ),
        redirect: "manual",
      },
    );
    await this.tokens.rotate(response);
    // A refreshed session after an app upgrade must update the existing device version.
    // Do not use registerDevice's refresh retry here: retrying refreshInFlight would deadlock.
    const device = await this.devices.get();
    const registration = RegisterDeviceRequestV2Schema.parse({ ...device, publicKeyJwk: (await this.deviceKeys.get()).publicKeyJwk });
    const registered = await this.authenticatedFetch("/api/v1/devices/register", {
      method: "POST",
      body: JSON.stringify(registration),
    });
    const verified = await parseResponse(registered, RegisterDeviceResponseSchema);
    if (verified.device.deviceId !== device.deviceId) throw new CloudError("INVALID_SERVER_RESPONSE", "Cloud registered an unexpected device identity.");
  }

  async logout(): Promise<void> {
    this.identityEpoch++;
    this.cachedUserId=null;
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
    const epoch=this.identityEpoch;
    const response = await this.authenticatedJson(
      "/api/v1/auth/me",
      MeResponseSchema,
    );
    if(epoch===this.identityEpoch&&this.tokens.getAccessToken())this.cachedUserId=response.user.id;
    return response.user;
  }

  getAccount(): Promise<Account> {
    return this.authenticatedJson("/api/v1/account", AccountSchema);
  }

  async registerDevice(request: DeviceInfo): Promise<Device> {
    const key = await this.deviceKeys.get();
    const response = await this.authenticatedJson(
      "/api/v1/devices/register",
      RegisterDeviceResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(RegisterDeviceRequestV2Schema.parse({
          ...request,
          publicKeyJwk: key.publicKeyJwk,
        })),
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
      "/api/v1/me/wallet/transactions?kind=account",
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
          ...(options.traceId ? { "X-Bridge-Trace-ID": options.traceId } : {}),
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
    const proof = (await this.deviceKeys.get()).sign(
      init.method ?? "GET",
      `${this.baseUrl}${path}`,
      accessToken,
      init.body,
    );
    proof.forEach((value, name) => headers.set(name, value));
    const response = await this.rawFetch(path, {
      ...init,
      headers,
      redirect: "manual",
    });
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
    const startedAt=Date.now();
    const headers = new Headers(init.headers);
    if (init.body != null) headers.set("Content-Type", "application/json");
    const timeout = AbortSignal.timeout(path === "/v1/responses" ? this.responseTimeoutMs : this.timeoutMs);
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
        transportFailureMessage(error,Date.now()-startedAt,Boolean(init.signal?.aborted),timeout.aborted),
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
    // Error excerpts are bounded before parsing; a large/binary reply cannot fill diagnostics.
    const reader=response.body?.getReader();if(!reader)throw new Error("No error body");let size=0;const chunks:Uint8Array[]=[];
    try{for(;;){const part=await reader.read();if(part.done)break;const take=part.value.subarray(0,Math.max(0,32*1024-size));chunks.push(take);size+=take.byteLength;if(size>=32*1024){await reader.cancel().catch(()=>{});break;}}}finally{reader.releaseLock();}
    const text=Buffer.concat(chunks).toString("utf8");try{payload=JSON.parse(text);}catch{payload={excerpt:sanitizeFailure(text,12*1024).value};}
  } catch (error) {
    return new CloudError(
      response.status===413?"PAYLOAD_TOO_LARGE":"INVALID_SERVER_RESPONSE",
      response.status===413?"请求体超过代理或模型服务允许的容量，请减少本轮内容或联系管理员检查请求大小限制。":`Cloud error response was not JSON (HTTP ${String(response.status)}).`,
      { cause: error,httpStatus:response.status,requestId:response.headers.get("X-Bridge-AI-Request-Id")??response.headers.get("X-Request-Id")??undefined },
    );
  }
  const parsed = ErrorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return new CloudError(
      response.status===413?"PAYLOAD_TOO_LARGE":"INVALID_SERVER_RESPONSE",
      response.status===413?"请求体超过代理或模型服务允许的容量，请减少本轮内容或联系管理员检查请求大小限制。":`Cloud error response did not match the frozen contract (HTTP ${String(response.status)}).`,
      { cause: parsed.error,httpStatus:response.status,requestId:response.headers.get("X-Bridge-AI-Request-Id")??response.headers.get("X-Request-Id")??undefined,responseBody:sanitizeFailure(payload,12*1024).value },
    );
  }
  return new CloudError(
    parsed.data.error.code,
    String(sanitizeFailure(parsed.data.error.message,4096).value),
    {
      deviceLimit: parsed.data.error.code === "DEVICE_LIMIT_REACHED" ? parsed.data.error.details : undefined,
      httpStatus: response.status,
      requestId:
        parsed.data.error.request_id ?? parsed.data.error.requestId,
      responseBody:sanitizeFailure(payload,12*1024).value,
    },
  );
}
