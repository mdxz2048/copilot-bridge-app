export const CLOUD_AUTH_STATES = [
  "SIGNED_OUT",
  "AUTHENTICATING",
  "AUTHENTICATED",
  "DEVICE_REVOKED",
  "SUBSCRIPTION_REQUIRED",
  "SUBSCRIPTION_EXPIRED",
  "QUOTA_EXCEEDED",
  "SERVER_UNREACHABLE",
] as const;

export type CloudAuthState = (typeof CLOUD_AUTH_STATES)[number];

const TRANSITIONS: Record<CloudAuthState, ReadonlySet<CloudAuthState>> = {
  SIGNED_OUT: new Set(["AUTHENTICATING", "SERVER_UNREACHABLE"]),
  AUTHENTICATING: new Set([
    "SIGNED_OUT",
    "AUTHENTICATED",
    "DEVICE_REVOKED",
    "SUBSCRIPTION_REQUIRED",
    "SUBSCRIPTION_EXPIRED",
    "QUOTA_EXCEEDED",
    "SERVER_UNREACHABLE",
  ]),
  AUTHENTICATED: new Set([
    "SIGNED_OUT",
    "AUTHENTICATING",
    "DEVICE_REVOKED",
    "SUBSCRIPTION_REQUIRED",
    "SUBSCRIPTION_EXPIRED",
    "QUOTA_EXCEEDED",
    "SERVER_UNREACHABLE",
  ]),
  DEVICE_REVOKED: new Set(["SIGNED_OUT", "AUTHENTICATING"]),
  SUBSCRIPTION_REQUIRED: new Set([
    "SIGNED_OUT",
    "AUTHENTICATING",
    "AUTHENTICATED",
    "SERVER_UNREACHABLE",
  ]),
  SUBSCRIPTION_EXPIRED: new Set([
    "SIGNED_OUT",
    "AUTHENTICATING",
    "AUTHENTICATED",
    "SERVER_UNREACHABLE",
  ]),
  QUOTA_EXCEEDED: new Set([
    "SIGNED_OUT",
    "AUTHENTICATING",
    "AUTHENTICATED",
    "SERVER_UNREACHABLE",
  ]),
  SERVER_UNREACHABLE: new Set([
    "SIGNED_OUT",
    "AUTHENTICATING",
    "AUTHENTICATED",
  ]),
};

export class CloudAuthStateMachine {
  private currentState: CloudAuthState;

  constructor(initialState: CloudAuthState = "SIGNED_OUT") {
    this.currentState = initialState;
  }

  get state(): CloudAuthState {
    return this.currentState;
  }

  transition(nextState: CloudAuthState): CloudAuthState {
    if (nextState === this.currentState) return this.currentState;
    if (!TRANSITIONS[this.currentState].has(nextState)) {
      throw new Error(
        `Invalid Cloud auth transition: ${this.currentState} -> ${nextState}`,
      );
    }
    this.currentState = nextState;
    return this.currentState;
  }
}
