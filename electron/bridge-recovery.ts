import type { BridgeStatus } from './bridge-manager.js';

/** Recover the listener only for an authenticated, available, enabled Cloud mode. */
export function createBridgeRecovery(deps: {
  eligible: () => Promise<boolean>;
  status: () => BridgeStatus;
  start: () => Promise<BridgeStatus>;
  now?: () => number;
}) {
  let inFlight: Promise<BridgeStatus | null> | null = null;
  let failedAt = -Infinity;
  return (force = false): Promise<BridgeStatus | null> => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      if (!(await deps.eligible())) return null;
      if (['ready', 'starting'].includes(deps.status().state)) return null;
      const now = deps.now ?? Date.now;
      if (!force && now() - failedAt < 15000) return null;
      try {
        const result = await deps.start();
        failedAt = result.state === 'ready' ? -Infinity : now();
        return result;
      } catch (error) { failedAt = now(); throw error; }
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
}
