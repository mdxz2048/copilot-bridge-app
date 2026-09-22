export type ProfileId = "original" | "bridge";

export interface ProfileStatus {
  activeProfile: ProfileId;
  bridgeHome: string;
  restartRequired: boolean;
  pendingProfile: ProfileId | null;
  unrestrictedBridgeAccess: boolean;
}

export interface AuthStatus {
  state: "idle" | "starting" | "waiting" | "completed" | "failed";
  deviceCode?: string;
  verificationUrl?: string;
  message: string;
}

export interface BridgeStatus {
  state: "stopped" | "starting" | "ready" | "failed";
  message: string;
  endpoint: string;
}

export interface BridgeModel {
  id: string;
  supportsReasoningEffort: boolean;
}

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface AppSettings {
  backendModel: string | null;
  reasoningEffort: ReasoningEffort | null;
}

declare global {
  interface Window {
    copilotBridge: {
      getProfileStatus(): Promise<ProfileStatus>;
      activateProfile(target: ProfileId): Promise<ProfileStatus>;
      acknowledgeRestart(): Promise<ProfileStatus>;
      prepareBridgeEnvironment(): Promise<void>;
      restartSystem(): Promise<void>;
      startCopilotLogin(): Promise<void>;
      cancelCopilotLogin(): Promise<void>;
      onCopilotLoginStatus(handler: (status: AuthStatus) => void): () => void;
      getBridgeStatus(): Promise<BridgeStatus>;
      startBridge(): Promise<BridgeStatus>;
      restartBridge(): Promise<BridgeStatus>;
      getModels(): Promise<BridgeModel[]>;
      getSettings(): Promise<AppSettings>;
      updateSettings(settings: AppSettings): Promise<AppSettings>;
      onBridgeStatus(handler: (status: BridgeStatus) => void): () => void;
      onProfileStatus(handler: (status: ProfileStatus) => void): () => void;
    };
  }
}

export {};
