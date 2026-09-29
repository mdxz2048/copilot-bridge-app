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
  state:
    | "idle"
    | "requesting_code"
    | "waiting_for_user"
    | "verifying"
    | "success"
    | "no_subscription"
    | "expired"
    | "network_error"
    | "cancelled";
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
  contractVersion: "2.2.0";
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
  usagePointsUsed: number | null;
  remainingPoints: number | null;
  currentDevice: string;
  currentDeviceId: string | null;
  devices: Array<{
    id: string;
    deviceId: string;
    name: string;
    platform: string;
    status: "ACTIVE" | "REVOKED" | "BLOCKED";
    activatedAt: string;
    lastSeenAt: string | null;
    current: boolean;
  }>;
  walletTransactions: Array<{
    id: string;
    type: string;
    points: number;
    balanceAfter: number;
    referenceType: string;
    referenceId: string;
    createdAt: string;
  }>;
  usageV2: {
    requests: number;
    pointsRated: number;
    pointsCharged: number;
    legacy: Record<string, unknown> | null;
  } | null;
  usageHistory: Array<{
    id: string;
    status: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    usageCredit: string;
    createdAt: string;
  }>;
  referral: {
    code: string;
    registered: number;
    rewarded: number;
    pointsEarned: number;
  } | null;
  referralRegistrationUrl: string | null;
  referralHistory: Array<{
    id: string;
    status: "REGISTERED" | "PENDING" | "QUALIFIED" | "REWARDED" | "REJECTED";
    registeredAt: string;
    qualifiedAt: string | null;
  }>;
  providers: Array<{
    id: string;
    code: string;
    name: string;
    ownership: "MANAGED";
    status: "ACTIVE" | "DISABLED";
    models: Array<{
      id: string;
      publicId: string;
      displayName: string;
      capabilities: {
        tools: boolean;
        vision: boolean;
        reasoning: boolean;
        streaming: boolean;
      };
    }>;
  }>;
  providerConnections: Array<{
    id: string;
    providerId: string;
    ownership: "BYOS";
    status: "ACTIVE" | "DISABLED";
    label: string;
    createdAt?: string;
    updatedAt?: string;
  }>;
  clientConfig: {
    minimumVersion: string;
    latestVersion: string;
    maintenance: boolean;
    features: { cloudGateway: boolean };
  } | null;
  latestRelease: {
    id: string;
    version: string;
    channel: string;
    platform: string;
    arch: string;
    downloadUrl: string;
    sha256: string;
    releaseNotes: string;
    published: boolean;
    createdAt: string;
  } | null;
  serviceConfigurationError: string | null;
  updateState: "CURRENT" | "AVAILABLE" | "REQUIRED" | "MAINTENANCE";
  lastError: {
    code: string;
    message: string;
    action:
      | "SIGN_IN"
      | "REFRESH_TOKEN"
      | "MANAGE_DEVICE"
      | "RENEW_SUBSCRIPTION"
      | "ADD_POINTS"
      | "RECONNECT_PROVIDER"
      | "CHANGE_PROVIDER"
      | "RETRY"
      | "NONE";
    retryable: boolean;
  } | null;
  accountManagementAvailable: boolean;
  subscriptionManagementAvailable: boolean;
  serviceStatus:
    | "WAITING_FOR_CONTRACT"
    | "AVAILABLE"
    | "UNREACHABLE"
    | "MAINTENANCE"
    | "UPDATE_REQUIRED";
  message: string;
}

export interface CloudUser {
  id: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "DISABLED" | "EXPIRED";
}

export interface CloudUsageSettlement {
  request: {
    id: string;
    responseId: string | null;
    status:
      | "CREATED"
      | "STARTED"
      | "COMPLETED"
      | "CLIENT_DISCONNECTED"
      | "PROVIDER_ERROR";
    billingPolicy: string;
    createdAt: string;
    completedAt: string | null;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    reasoningTokens: number;
    pointsRated: number;
    pointsCharged: number;
    billingStatus:
      | "SETTLED"
      | "SHADOW"
      | "UNPAID"
      | "NO_USAGE"
      | "METERING_ERROR"
      | "UNRATED";
    rateCardVersionId: string | null;
  } | null;
  wallet: {
    balance: number;
    unit: "AI_POINT";
  };
}

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface AppSettings {
  backendModel: string | null;
  reasoningEffort: ReasoningEffort | null;
  autoLaunch: boolean;
  minimizeToTray: boolean;
  autoBridgeStart: boolean;
  backendMode: "LOCAL" | "REMOTE";
  providerConnectionId: string | null;
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
      openCopilotVerification(url: string): Promise<void>;
      onCopilotLoginStatus(handler: (status: AuthStatus) => void): () => void;
      getBridgeStatus(): Promise<BridgeStatus>;
      startBridge(): Promise<BridgeStatus>;
      restartBridge(): Promise<BridgeStatus>;
      getModels(): Promise<BridgeModel[]>;
      switchAiService(
        target: AppSettings["backendMode"],
      ): Promise<ServiceSwitchResult>;
      getCloudStatus(): Promise<CloudServiceStatus>;
      registerCloud(request: {
        email: string;
        password: string;
        referralCode?: string;
      }): Promise<CloudUser>;
      loginCloud(credentials: {
        email: string;
        password: string;
      }): Promise<CloudServiceStatus>;
      logoutCloud(): Promise<CloudServiceStatus>;
      refreshCloud(): Promise<CloudServiceStatus>;
      manageCloudAccount(): Promise<void>;
      manageCloudSubscription(): Promise<void>;
      openCloudRelease(): Promise<void>;
      revokeCloudDevice(id: string): Promise<CloudServiceStatus>;
      renameCloudDevice(request: {
        id: string;
        deviceName: string;
      }): Promise<CloudServiceStatus>;
      applyReferral(code: string): Promise<CloudServiceStatus>;
      getCloudUsageSettlement(
        responseId: string,
      ): Promise<CloudUsageSettlement>;
      connectCloudProvider(request: {
        providerId: string;
        label: string;
        apiKey: string;
      }): Promise<{
        status: CloudServiceStatus;
        settings: AppSettings;
        bridge: BridgeStatus;
        models: BridgeModel[];
      }>;
      disconnectCloudProvider(id: string): Promise<CloudServiceStatus>;
      activateCloudProvider(id: string): Promise<ServiceSwitchResult>;
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
