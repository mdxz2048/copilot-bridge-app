import { cloudErrorCode } from "./cloud-error.js";

export async function withSingleTokenRefreshRetry<T>(
  operation: () => Promise<T>,
  refresh: () => Promise<void>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (cloudErrorCode(error) !== "TOKEN_EXPIRED") throw error;
  }

  await refresh();
  return operation();
}
