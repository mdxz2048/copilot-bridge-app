export type ProfileId = "original" | "bridge";

export interface ProfileStatus {
  activeProfile: ProfileId;
  bridgeHome: string;
  originalState: "UNINITIALIZED" | "READY" | "CUSTOM";
  restartRequired: boolean;
  pendingProfile: ProfileId | null;
  unrestrictedBridgeAccess: boolean;
}

export interface ChatGptStatus {
  state: "NOT_INSTALLED" | "INSTALLED" | "INSTALLING" | "ERROR";
  message: string;
  packageFullName?: string;
  packageFamilyName?: string;
  version?: string;
  appId?: string;
  step?: "CHECKING" | "INSTALLING" | "WAITING_FOR_STORE" | "VERIFYING";
}

export interface Diagnostics {
  appVersion: string;
  bridge: BridgeStatus;
  chatGpt: ChatGptStatus;
  profile: ProfileStatus;
  settings: AppSettings;
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

export type CloudAuthState =
  | "SIGNED_OUT"
  | "AUTHENTICATING"
  | "AUTHENTICATED"
  | "DEVICE_REVOKED"
  | "SUBSCRIPTION_REQUIRED"
  | "SUBSCRIPTION_EXPIRED"
  | "QUOTA_EXCEEDED"
  | "SERVER_UNREACHABLE";

export interface CloudServiceStatus {
  authState: CloudAuthState;
  contractReady: boolean;
  account: string | null;
  plan: "Standard" | "Pro" | null;
  subscriptionStatus: string | null;
  validUntil: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  usage: string | null;
  usagePercent: number | null;
  usageRequests: number | null;
  usageTokens: number | null;
  currentDevice: string;
  accountManagementAvailable: boolean;
  subscriptionManagementAvailable: boolean;
  serviceStatus: "WAITING_FOR_CONTRACT" | "AVAILABLE" | "UNREACHABLE";
  message: string;
}

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface AppSettings {
  backendModel: string | null;
  reasoningEffort: ReasoningEffort | null;
  autoLaunch: boolean;
  minimizeToTray: boolean;
  autoBridgeStart: boolean;
  backendMode: "LOCAL" | "REMOTE";
  theme: "system" | "light" | "dark";
  onboardingCompleted: boolean;
}

export interface ServiceSwitchResult {
  settings: AppSettings;
  bridge: BridgeStatus;
  models: BridgeModel[];
}

declare global {
  interface Window {
    copilotBridge: {
      getAppVersion(): Promise<string>;
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
      switchAiService(
        target: AppSettings["backendMode"],
      ): Promise<ServiceSwitchResult>;
      getCloudStatus(): Promise<CloudServiceStatus>;
      loginCloud(credentials: {
        email: string;
        password: string;
      }): Promise<CloudServiceStatus>;
      logoutCloud(): Promise<CloudServiceStatus>;
      refreshCloud(): Promise<CloudServiceStatus>;
      manageCloudAccount(): Promise<void>;
      manageCloudSubscription(): Promise<void>;
      onCloudStatus(handler: (status: CloudServiceStatus) => void): () => void;
      getSettings(): Promise<AppSettings>;
      updateSettings(settings: AppSettings): Promise<AppSettings>;
      onBridgeStatus(handler: (status: BridgeStatus) => void): () => void;
      onProfileStatus(handler: (status: ProfileStatus) => void): () => void;
      getChatGptStatus(): Promise<ChatGptStatus>;
      installChatGpt(): Promise<void>;
      cancelChatGptInstall(): Promise<void>;
      launchChatGpt(): Promise<void>;
      getDiagnostics(): Promise<Diagnostics>;
      onChatGptStatus(handler: (status: ChatGptStatus) => void): () => void;
    };
  }
}

export {};
