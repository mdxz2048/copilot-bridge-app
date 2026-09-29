export function createFocusRefresh(
  hasCloudSession: () => boolean,
  refresh: () => Promise<void>,
  intervalMs = 30_000,
  now: () => number = Date.now,
): () => Promise<void> | null {
  let lastStartedAt = -Infinity;
  let inFlight: Promise<void> | null = null;

  return () => {
    if (!hasCloudSession() || inFlight || now() - lastStartedAt < intervalMs) {
      return null;
    }
    lastStartedAt = now();
    inFlight = refresh().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
