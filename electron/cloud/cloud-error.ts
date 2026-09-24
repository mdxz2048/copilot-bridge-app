import type { CloudAuthState } from "./auth-state.js";

export const KNOWN_CLOUD_ERROR_CODES = [
  "TOKEN_EXPIRED",
  "DEVICE_REVOKED",
  "SUBSCRIPTION_REQUIRED",
  "SUBSCRIPTION_EXPIRED",
  "MONTHLY_QUOTA_EXCEEDED",
] as const;

export type KnownCloudErrorCode = (typeof KNOWN_CLOUD_ERROR_CODES)[number];
export type CloudErrorAction =
  | "SIGN_IN"
  | "REFRESH_TOKEN"
  | "MANAGE_DEVICE"
  | "RENEW_SUBSCRIPTION"
  | "ADD_POINTS"
  | "RECONNECT_PROVIDER"
  | "CHANGE_PROVIDER"
  | "RETRY"
  | "NONE";

export interface CloudErrorPolicy {
  authState: CloudAuthState | null;
  action: CloudErrorAction;
  retryable: boolean;
}

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
  return cloudErrorPolicy(error).authState;
}

export function cloudErrorPolicy(error: unknown): CloudErrorPolicy {
  switch (cloudErrorCode(error)) {
    case "AUTH_REQUIRED":
    case "UNAUTHORIZED":
      return { authState: "SIGNED_OUT", action: "SIGN_IN", retryable: false };
    case "TOKEN_EXPIRED":
      return {
        authState: null,
        action: "REFRESH_TOKEN",
        retryable: true,
      };
    case "DEVICE_REVOKED":
      return {
        authState: "DEVICE_REVOKED",
        action: "MANAGE_DEVICE",
        retryable: false,
      };
    case "SUBSCRIPTION_REQUIRED":
      return {
        authState: "SUBSCRIPTION_REQUIRED",
        action: "RENEW_SUBSCRIPTION",
        retryable: false,
      };
    case "SUBSCRIPTION_EXPIRED":
      return {
        authState: "SUBSCRIPTION_EXPIRED",
        action: "RENEW_SUBSCRIPTION",
        retryable: false,
      };
    case "MONTHLY_QUOTA_EXCEEDED":
    case "INSUFFICIENT_POINTS":
      return {
        authState: "QUOTA_EXCEEDED",
        action: "ADD_POINTS",
        retryable: false,
      };
    case "PROVIDER_AUTH_REQUIRED":
      return {
        authState: null,
        action: "RECONNECT_PROVIDER",
        retryable: false,
      };
    case "COPILOT_NOT_ENTITLED":
    case "PROVIDER_CONNECTION_UNAVAILABLE":
      return {
        authState: null,
        action: "CHANGE_PROVIDER",
        retryable: false,
      };
    case "PROVIDER_UNAVAILABLE":
    case "MODEL_UNAVAILABLE":
    case "GATEWAY_TIMEOUT":
    case "SERVER_UNREACHABLE":
      return {
        authState: "SERVER_UNREACHABLE",
        action: "RETRY",
        retryable: true,
      };
    default:
      return { authState: null, action: "NONE", retryable: false };
  }
}
