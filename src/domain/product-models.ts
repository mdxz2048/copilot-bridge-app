import type {
  AppSettings,
  BridgeModel,
  BridgeStatus,
  CloudServiceStatus,
} from "../bridge-api";

export type AIProviderId =
  | "bridge-cloud"
  | "github-copilot"
  | "custom-api"
  | "local-model";

export type ProviderConnectionState =
  | "not_configured"
  | "connecting"
  | "connected"
  | "unavailable"
  | "auth_expired"
  | "error";

export interface AIModel {
  id: string;
  displayName: string;
  providerId: AIProviderId;
  capabilities: {
    reasoning: boolean;
  };
}

export interface AIProvider {
  id: AIProviderId;
  name: string;
  description: string;
  connection: ProviderConnectionState;
  available: boolean;
  active: boolean;
  models: AIModel[];
}

export interface UserAccount {
  email: string;
}

export interface SubscriptionSummary {
  plan: "Standard" | "Pro" | null;
  status: string | null;
  currentPeriodEnd: string | null;
}

export interface PointsBalance {
  usedPoints: number | null;
  remainingPoints: number | null;
  source: "server" | "unavailable";
}

export interface DeviceSummary {
  id: string;
  name: string;
  platform: string;
  status: "ACTIVE" | "REVOKED";
  lastSeenAt: string | null;
  current: boolean;
}

export interface UsageSummary {
  points: PointsBalance;
  requests: number | null;
}

export interface ReferralSummary {
  available: boolean;
  code: string | null;
  invited: number | null;
  qualified: number | null;
  rewardPoints: number | null;
}

export function buildProviders(
  settings: AppSettings,
  cloud: CloudServiceStatus | null,
  bridge: BridgeStatus | null,
  models: BridgeModel[],
): AIProvider[] {
  const activeId: AIProviderId = settings.providerConnectionId
    ? "custom-api"
    : settings.backendMode === "REMOTE"
      ? "bridge-cloud"
      : "github-copilot";
  const deepSeek = cloud?.providers.find(
    (provider) => provider.code.toUpperCase() === "DEEPSEEK",
  );
  const deepSeekConnection = deepSeek
    ? cloud?.providerConnections.find(
        (connection) =>
          connection.providerId === deepSeek.id
          && connection.status === "ACTIVE",
      )
    : undefined;
  return [
    {
      id: "bridge-cloud",
      name: "Copilot Bridge 云服务",
      description: "开箱即用，由 Copilot Bridge 提供",
      connection: cloudConnection(cloud),
      available: cloud?.contractReady === true,
      active: activeId === "bridge-cloud",
      models: activeId === "bridge-cloud"
        ? models.map((model) => toModel(model, "bridge-cloud"))
        : [],
    },
    {
      id: "github-copilot",
      name: "我的 GitHub Copilot",
      description: "使用自己的 GitHub Copilot 订阅",
      connection: bridgeConnection(bridge, activeId === "github-copilot"),
      available: true,
      active: activeId === "github-copilot",
      models: activeId === "github-copilot"
        ? models.map((model) => toModel(model, "github-copilot"))
        : [],
    },
    {
      id: "custom-api",
      name: "我的 API",
      description: deepSeek
        ? "使用自己的 DeepSeek API Key"
        : "使用自己的 API Key 和兼容服务",
      connection: deepSeekConnection ? "connected" : "not_configured",
      available: deepSeek?.status === "ACTIVE",
      active: activeId === "custom-api",
      models: (deepSeek?.models ?? []).map((model) => ({
        id: model.publicId,
        displayName: model.displayName,
        providerId: "custom-api" as const,
        capabilities: { reasoning: model.capabilities.reasoning },
      })),
    },
    {
      id: "local-model",
      name: "本地模型",
      description: "使用运行在本机的 AI 模型",
      connection: "not_configured",
      available: false,
      active: false,
      models: [],
    },
  ];
}

function toModel(model: BridgeModel, providerId: AIProviderId): AIModel {
  return {
    id: model.id,
    displayName: model.id,
    providerId,
    capabilities: { reasoning: model.supportsReasoningEffort },
  };
}

function cloudConnection(
  cloud: CloudServiceStatus | null,
): ProviderConnectionState {
  switch (cloud?.authState) {
    case "AUTHENTICATED":
      return "connected";
    case "AUTHENTICATING":
      return "connecting";
    case "SERVER_UNREACHABLE":
      return "unavailable";
    case "DEVICE_REVOKED":
    case "SUBSCRIPTION_EXPIRED":
    case "SUBSCRIPTION_REQUIRED":
    case "QUOTA_EXCEEDED":
      return "error";
    default:
      return "not_configured";
  }
}

function bridgeConnection(
  bridge: BridgeStatus | null,
  active: boolean,
): ProviderConnectionState {
  if (!active) return "not_configured";
  if (bridge?.state === "ready") return "connected";
  if (bridge?.state === "starting") return "connecting";
  if (bridge?.state === "failed") return "error";
  return "not_configured";
}
