import type { CloudAuthState } from "./auth-state.js";

export const KNOWN_CLOUD_ERROR_CODES = [
  "TOKEN_EXPIRED",
  "DEVICE_REVOKED",
  "SUBSCRIPTION_REQUIRED",
  "SUBSCRIPTION_EXPIRED",
  "MONTHLY_QUOTA_EXCEEDED",
] as const;

export type KnownCloudErrorCode = (typeof KNOWN_CLOUD_ERROR_CODES)[number];

export class CloudError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  readonly httpStatus?: number;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    options?: {
      cause?: unknown;
      httpStatus?: number;
      requestId?: string;
    },
  ) {
    super(message);
    this.name = "CloudError";
    this.code = code;
    this.cause = options?.cause;
    this.httpStatus = options?.httpStatus;
    this.requestId = options?.requestId;
  }
}

export function cloudErrorCode(error: unknown): string | null {
  if (error instanceof CloudError) return error.code;
  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
  ) {
    return error.code;
  }
  return null;
}

export function authStateForCloudError(
  error: unknown,
): CloudAuthState | null {
  switch (cloudErrorCode(error)) {
    case "DEVICE_REVOKED":
      return "DEVICE_REVOKED";
    case "SUBSCRIPTION_REQUIRED":
      return "SUBSCRIPTION_REQUIRED";
    case "SUBSCRIPTION_EXPIRED":
      return "SUBSCRIPTION_EXPIRED";
    case "MONTHLY_QUOTA_EXCEEDED":
      return "QUOTA_EXCEEDED";
    case "PROVIDER_UNAVAILABLE":
    case "MODEL_UNAVAILABLE":
    case "GATEWAY_TIMEOUT":
    case "SERVER_UNREACHABLE":
      return "SERVER_UNREACHABLE";
    default:
      return null;
  }
}
