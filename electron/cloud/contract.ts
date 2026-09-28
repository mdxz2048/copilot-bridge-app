import { z } from "zod";

export const CLOUD_CONTRACT_VERSION = "2.2.0";

export const DeviceInfoSchema = z.object({
  deviceId: z.uuid(),
  deviceName: z.string().min(1).max(120),
  platform: z.string().min(1).max(60),
  osVersion: z.string().max(120).default(""),
  appVersion: z.string().max(120).default(""),
});

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  role: z.enum(["USER", "ADMIN"]),
  status: z.enum(["ACTIVE", "DISABLED", "EXPIRED"]),
});

export const DeviceSchema = DeviceInfoSchema.extend({
  id: z.uuid(),
  userId: z.uuid(),
  status: z.enum(["ACTIVE", "REVOKED"]),
  activatedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime().nullable(),
});

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string(),
  device: DeviceInfoSchema,
});

const GatewayV1LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.literal(1800),
  user: UserSchema,
  device: DeviceSchema,
});

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(20),
});

export const RefreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.literal(1800),
});

export const ErrorCodeSchema = z.enum([
  "ACCOUNT_DISABLED",
  "AUTH_REQUIRED",
  "BILLING_REVIEW_REQUIRED",
  "CANNOT_DISABLE_SELF",
  "CLIENT_THREAD_ID_REQUIRED",
  "COPILOT_AUTH_EXPIRED",
  "COPILOT_NOT_ENTITLED",
  "COPILOT_USAGE_UNAVAILABLE",
  "CSRF_REJECTED",
  "DEVICE_LIMIT_REACHED",
  "DEVICE_NOT_REGISTERED",
  "DEVICE_REVOKED",
  "EMAIL_IN_USE",
  "FORBIDDEN",
  "GATEWAY_TIMEOUT",
  "IDEMPOTENCY_CONFLICT",
  "INSUFFICIENT_POINTS",
  "INTERNAL_ERROR",
  "INVALID_CREDENTIALS",
  "INVALID_POINTS",
  "INVALID_PROVIDER_CONNECTION",
  "INVALID_REFERRAL_CODE",
  "MODEL_NOT_ALLOWED",
  "MODEL_NOT_AVAILABLE",
  "MODEL_PROVIDER_MISMATCH",
  "MODEL_UNAVAILABLE",
  "MONTHLY_QUOTA_EXCEEDED",
  "NOT_FOUND",
  "ORDER_NOT_PAYABLE",
  "PAYMENT_PROVIDER_NOT_CONNECTED",
  "PLAN_NOT_FOUND",
  "PLAN_REQUIRED",
  "PROVIDER_AUTH_REQUIRED",
  "PROVIDER_CONNECTION_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "RATE_CARD_EXISTS",
  "RATE_CARD_FUTURE_SCHEDULE_NOT_SUPPORTED",
  "RATE_CARD_NOT_DRAFT",
  "RATE_CARD_UNAVAILABLE",
  "RATE_LIMITED",
  "REFERRAL_CODE_UNAVAILABLE",
  "REFERRAL_NOT_ELIGIBLE",
  "REFERRAL_NOT_REVIEWABLE",
  "REQUEST_NOT_FOUND",
  "ROLLOVER_POLICY_INVALID",
  "SUBSCRIPTION_EXPIRED",
  "SUBSCRIPTION_NOT_FOUND",
  "SUBSCRIPTION_REQUIRED",
  "TOKEN_EXPIRED",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "WALLET_LEDGER_MISMATCH",
  "WALLET_LIMIT_REACHED",
]);

export const ErrorResponseV2Schema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    request_id: z.string(),
  }).refine((error) => error.request_id === error.requestId),
});
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    requestId: z.string(),
    request_id: z.string().optional(),
  }).superRefine((error, context) => {
    if (error.request_id && error.request_id !== error.requestId) {
      context.addIssue({
        code: "custom",
        message: "request_id must equal requestId",
        path: ["request_id"],
      });
    }
  }),
});

export const PlanSchema = z.object({
  id: z.uuid(),
  code: z.enum(["STANDARD", "PRO"]),
  name: z.string(),
  description: z.string(),
  monthlyPrice: z.string(),
  currency: z.string(),
  maxDevices: z.number().int(),
  monthlyTokenLimit: z.number().int(),
  monthlyUsageCreditLimit: z.string(),
  maxConcurrentRequests: z.number().int(),
  requestsPerMinute: z.number().int(),
  enabled: z.boolean(),
});

export const SubscriptionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  planId: z.uuid(),
  status: z.enum([
    "TRIAL",
    "ACTIVE",
    "PAST_DUE",
    "CANCELED",
    "EXPIRED",
    "SUSPENDED",
  ]),
  startedAt: z.iso.datetime(),
  currentPeriodStart: z.iso.datetime(),
  currentPeriodEnd: z.iso.datetime(),
  cancelAtPeriodEnd: z.boolean(),
  pendingPlanId: z.uuid().nullable(),
});

export const UsageSchema = z.object({
  tokens: z.number(),
  credit: z.number(),
  requests: z.number(),
  tokenLimit: z.number(),
  creditLimit: z.number(),
  percent: z.number(),
  threshold: z.union([
    z.literal(0),
    z.literal(70),
    z.literal(90),
    z.literal(100),
  ]),
});

export const AccountSchema = z.object({
  user: UserSchema,
  subscription: SubscriptionSchema.nullable(),
  plan: PlanSchema.nullable(),
  devices: z.array(DeviceSchema),
  usage: UsageSchema.nullable(),
});

export const ModelSchema = z.object({
  id: z.string(),
  object: z.literal("model"),
  owned_by: z.string(),
  capabilities: z.object({
    tools: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
  }),
});

export const ModelListSchema = z.object({
  object: z.literal("list"),
  data: z.array(ModelSchema),
});

export const ReleaseSchema = z.object({
  id: z.uuid(),
  version: z.string(),
  channel: z.string(),
  platform: z.string(),
  arch: z.string(),
  downloadUrl: z.string(),
  sha256: z.string(),
  releaseNotes: z.string(),
  published: z.boolean(),
  createdAt: z.iso.datetime(),
});

export const LatestReleaseResponseSchema = z.object({
  release: ReleaseSchema.nullable(),
});

export const FunctionToolSchema = z.object({
  type: z.literal("function").optional(),
  name: z.string(),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export const InputItemSchema = z.union([
  z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.union([z.string(), z.array(z.unknown())]),
  }).passthrough(),
  z.object({
    type: z.literal("function_call"),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
  }),
  z.object({
    type: z.literal("function_call_output"),
    call_id: z.string(),
    output: z.string(),
  }),
]);

export const ResponseRequestSchema = z.object({
  model: z.string().min(1),
  input: z.union([z.string(), z.array(InputItemSchema)]),
  stream: z.boolean().default(false),
  tools: z.array(FunctionToolSchema).optional(),
  reasoning: z.record(z.string(), z.unknown()).optional(),
});

export const OutputItemSchema = z.union([
  z.object({
    type: z.literal("message"),
    role: z.literal("assistant"),
    content: z.array(z.object({
      type: z.literal("output_text"),
      text: z.string(),
    })),
  }),
  z.object({
    type: z.literal("function_call"),
    call_id: z.string(),
    name: z.string(),
    arguments: z.string(),
  }),
]);

export const ResponseSchema = z.object({
  id: z.string(),
  object: z.literal("response"),
  status: z.literal("completed"),
  model: z.string(),
  output: z.array(OutputItemSchema),
  usage: z.object({
    input_tokens: z.number().int(),
    output_tokens: z.number().int(),
    total_tokens: z.number().int(),
    points: z.number().int().nonnegative().optional(),
    points_rated: z.number().int().nonnegative().optional(),
    points_charged: z.number().int().nonnegative().optional(),
    remaining_points: z.number().int().nonnegative().optional(),
    request_id: z.uuid().optional(),
    billing_mode: z.enum(["SHADOW", "ENFORCED"]).optional(),
  }).passthrough(),
}).passthrough();

export const ClientConfigSchema = z.object({
  minimumVersion: z.string(),
  latestVersion: z.string(),
  maintenance: z.boolean(),
  features: z.object({ cloudGateway: z.boolean() }),
});

export const MeResponseSchema = z.object({ user: UserSchema });
export const RegisterDeviceResponseSchema = z.object({ device: DeviceSchema });
export const DeviceListSchema = z.object({ data: z.array(DeviceSchema) });
export const SubscriptionResponseSchema = z.object({
  subscription: SubscriptionSchema.nullable(),
  plan: PlanSchema.nullable(),
});
export const LogoutResponseSchema = z.object({ ok: z.boolean() });

const V2InstantSchema = z.iso.datetime({ offset: true });
export const BillingModeV2Schema = z.enum(["OFF", "SHADOW", "ENFORCED"]);
export const RegisterRequestV2Schema = z.object({
  email: z.email(),
  password: z.string().min(12).max(256),
  referralCode: z.string().trim().min(8).max(24).optional(),
});
export const AccountSummaryV2Schema = z.object({
  id: z.uuid(),
  email: z.email(),
  status: z.enum(["ACTIVE", "DISABLED", "EXPIRED"]),
});
export const SubscriptionSummaryV2Schema = z.object({
  id: z.uuid(),
  status: z.enum([
    "TRIAL",
    "ACTIVE",
    "PAST_DUE",
    "CANCELED",
    "EXPIRED",
    "SUSPENDED",
  ]),
  planCode: z.string(),
  periodStart: V2InstantSchema,
  periodEnd: V2InstantSchema,
  monthlyPoints: z.number().int().nonnegative(),
  maxDevices: z.number().int().nonnegative(),
  rolloverPolicy: z.enum(["NONE", "UNLIMITED"]),
}).nullable();
export const WalletSummaryV2Schema = z.object({
  balance: z.number().int().nonnegative(),
  unit: z.literal("AI_POINT"),
});
export const DeviceV2Schema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  deviceId: z.uuid(),
  deviceName: z.string(),
  platform: z.string(),
  osVersion: z.string(),
  appVersion: z.string(),
  status: z.enum(["ACTIVE", "REVOKED", "BLOCKED"]),
  activatedAt: V2InstantSchema,
  lastSeenAt: V2InstantSchema.nullable(),
  updatedAt: V2InstantSchema,
});
export const DeviceCredentialV2Schema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.literal(1800),
  user: AccountSummaryV2Schema.extend({
    role: z.enum(["USER", "ADMIN"]),
  }),
  device: DeviceV2Schema,
});
export const LoginResponseSchema = z.union([
  DeviceCredentialV2Schema,
  GatewayV1LoginResponseSchema,
]);
export const MeV2Schema = z.object({
  account: AccountSummaryV2Schema,
  subscription: SubscriptionSummaryV2Schema,
  wallet: WalletSummaryV2Schema,
  activeDevices: z.number().int().nonnegative(),
});
export const ProviderV2Schema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  ownership: z.literal("MANAGED"),
  status: z.enum(["ACTIVE", "DISABLED"]),
});
export const ProviderConnectionV2Schema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  ownership: z.literal("BYOS"),
  status: z.enum(["ACTIVE", "DISABLED"]),
  label: z.string(),
  createdAt: V2InstantSchema.optional(),
  updatedAt: V2InstantSchema.optional(),
});
export const ModelV2Schema = z.object({
  id: z.uuid(),
  publicId: z.string(),
  displayName: z.string(),
  capabilities: z.object({
    tools: z.boolean(),
    vision: z.boolean(),
    reasoning: z.boolean(),
    streaming: z.boolean(),
  }),
});
export const UsageSummaryV2Schema = z.object({
  requests: z.number().int().nonnegative(),
  pointsRated: z.number().int().nonnegative(),
  pointsCharged: z.number().int().nonnegative(),
  legacy: z.record(z.string(), z.unknown()).nullable(),
});
export const UsageRecordV2Schema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  reasoningTokens: z.number().int().nonnegative(),
  pointsRated: z.number().int().nonnegative(),
  pointsCharged: z.number().int().nonnegative(),
  billingStatus: z.enum([
    "SETTLED",
    "SHADOW",
    "UNPAID",
    "NO_USAGE",
    "METERING_ERROR",
    "UNRATED",
  ]),
  rateCardVersionId: z.uuid().nullable(),
});
export const ReferralSummaryV2Schema = z.object({
  code: z.string(),
  registered: z.number().int().nonnegative(),
  rewarded: z.number().int().nonnegative(),
  pointsEarned: z.number().int().nonnegative(),
});
export const ReferralRecordV2Schema = z.object({
  id: z.uuid(),
  status: z.enum([
    "REGISTERED",
    "PENDING",
    "QUALIFIED",
    "REWARDED",
    "REJECTED",
  ]),
  registeredAt: V2InstantSchema,
  qualifiedAt: V2InstantSchema.nullable(),
});
export const WalletTransactionV2Schema = z.object({
  id: z.uuid(),
  type: z.string(),
  points: z.number().int(),
  balanceAfter: z.number().int().nonnegative(),
  referenceType: z.string(),
  referenceId: z.string(),
  createdAt: V2InstantSchema,
});
export const AiRequestV2Schema = z.object({
  id: z.uuid(),
  responseId: z.string().nullable(),
  status: z.enum([
    "CREATED",
    "STARTED",
    "COMPLETED",
    "CLIENT_DISCONNECTED",
    "PROVIDER_ERROR",
  ]),
  billingPolicy: z.string(),
  createdAt: V2InstantSchema,
  completedAt: V2InstantSchema.nullable(),
});
export const UsageSettlementV2Schema = z.object({
  request: AiRequestV2Schema,
  usage: UsageRecordV2Schema.nullable(),
  wallet: WalletSummaryV2Schema,
});
export const RegisterV2ResponseSchema = z.object({
  user: UserSchema,
});
export const ReferralCodeV2Schema = z.object({
  code: z.string(),
  status: z.string(),
});
export const ReferralApplyV2Schema = z.object({
  id: z.uuid(),
  status: z.string(),
  riskReviewRequired: z.boolean(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
export type RegisterRequestV2 = z.infer<typeof RegisterRequestV2Schema>;
export type User = z.infer<typeof UserSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type SubscriptionResponse = z.infer<
  typeof SubscriptionResponseSchema
>;
export type Usage = z.infer<typeof UsageSchema>;
export type Model = z.infer<typeof ModelSchema>;
export type ModelList = z.infer<typeof ModelListSchema>;
export type Release = z.infer<typeof ReleaseSchema>;
export type LatestReleaseResponse = z.infer<
  typeof LatestReleaseResponseSchema
>;
export type InputItem = z.infer<typeof InputItemSchema>;
export type FunctionTool = z.infer<typeof FunctionToolSchema>;
export type ResponseRequest = z.input<typeof ResponseRequestSchema>;
export type ResponseResult = z.infer<typeof ResponseSchema>;
export type OutputItem = z.infer<typeof OutputItemSchema>;
export type ClientConfig = z.infer<typeof ClientConfigSchema>;
export type AccountSummaryV2 = z.infer<typeof AccountSummaryV2Schema>;
export type SubscriptionSummaryV2 = z.infer<
  typeof SubscriptionSummaryV2Schema
>;
export type WalletSummaryV2 = z.infer<typeof WalletSummaryV2Schema>;
export type DeviceV2 = z.infer<typeof DeviceV2Schema>;
export type MeV2 = z.infer<typeof MeV2Schema>;
export type ProviderV2 = z.infer<typeof ProviderV2Schema>;
export type ProviderConnectionV2 = z.infer<
  typeof ProviderConnectionV2Schema
>;
export type ModelV2 = z.infer<typeof ModelV2Schema>;
export type UsageSummaryV2 = z.infer<typeof UsageSummaryV2Schema>;
export type UsageRecordV2 = z.infer<typeof UsageRecordV2Schema>;
export type ReferralSummaryV2 = z.infer<typeof ReferralSummaryV2Schema>;
export type ReferralRecordV2 = z.infer<typeof ReferralRecordV2Schema>;
export type WalletTransactionV2 = z.infer<
  typeof WalletTransactionV2Schema
>;
export type UsageSettlementV2 = z.infer<typeof UsageSettlementV2Schema>;
export type ReferralCodeV2 = z.infer<typeof ReferralCodeV2Schema>;
