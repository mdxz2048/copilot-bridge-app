import type {
  AppSettings,
  BridgeModel,
  BridgeStatus,
  ChatGptStatus,
  CloudServiceStatus,
  ProfileStatus,
  ReasoningEffort,
} from "../bridge-api";
import type { AIProvider } from "../domain/product-models";
import { zhCN } from "../locales/zh-CN";
import { displayModel } from "../model-display";
import { Button } from "./Button";
import { Select, SelectRow } from "./Select";

interface CurrentServiceCardProps {
  bridge: BridgeStatus | null;
  busy: boolean;
  chatGpt: ChatGptStatus;
  cloud: CloudServiceStatus | null;
  models: BridgeModel[];
  profile: ProfileStatus | null;
  bridgeEnabled: boolean;
  provider: AIProvider;
  settings: AppSettings;
  onConnectLocal: () => void;
  onEnableChatGpt: () => void;
  onInstallChatGpt: () => void;
  onOpenAccount: () => void;
  onOpenChatGpt: () => void;
  onOpenRelease: () => void;
  onRetryCloud: () => void;
  onSwitchService: () => void;
  onUpdateSettings: (settings: AppSettings) => void;
}

export function CurrentServiceCard({
  bridge,
  busy,
  chatGpt,
  cloud,
  models,
  profile,
  bridgeEnabled,
  provider,
  settings,
  onConnectLocal,
  onEnableChatGpt,
  onInstallChatGpt,
  onOpenAccount,
  onOpenChatGpt,
  onOpenRelease,
  onRetryCloud,
  onSwitchService,
  onUpdateSettings,
}: CurrentServiceCardProps) {
  const copy = zhCN.product;
  const isCloud = provider.id !== "github-copilot";
  const cloudReady =
    cloud?.authState === "AUTHENTICATED"
    && cloud.serviceStatus === "AVAILABLE"
    && !cloud.lastError;
  const bridgeReady = bridge?.state === "ready";
  const serviceReady = isCloud ? cloudReady && bridgeReady : bridgeReady;
  const state = isCloud ? cloudStatePresentation(cloud) : localStatePresentation(bridge);
  const selectedModel = settings.backendModel ?? models[0]?.id ?? "";
  const selected = models.find((model) => model.id === selectedModel);
  const modelOptions = models.map((model) => ({
    value: model.id,
    label: displayModel(model.id),
  }));

  if (!bridgeEnabled) {
    return (
      <section aria-labelledby="current-service-heading">
        <h2 id="current-service-heading">AI 服务</h2>
        <div className="card current-service-card bridge-disabled-card">
          <div className="service-card-header">
            <p className="service-name">ChatGPT 原账号</p>
            <span className="service-state state-success">
              <span aria-hidden="true">●</span>
              当前使用
            </span>
          </div>
          <p className="bridge-disabled-message">
            Copilot Bridge 未启用，ChatGPT 保持原来的账号、会话和配置。
          </p>
          <div className="service-actions">
            <Button
              disabled={busy || chatGpt.state !== "INSTALLED"}
              onClick={onOpenChatGpt}
              type="button"
            >
              {chatGpt.state === "INSTALLED"
                ? copy.openChatGpt
                : copy.installChatGpt}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="current-service-heading">
      <h2 id="current-service-heading">{copy.currentService}</h2>
      <div className="card current-service-card" aria-live="polite">
        <div className="service-card-header">
          <p className="service-name">
            {provider.name}
          </p>
          <div className="service-header-state">
            <span className={`service-state state-${state.tone}`}>
              <span aria-hidden="true">{state.symbol}</span>
              {state.title}
            </span>
          </div>
        </div>

        {serviceReady && selectedModel
          ? (
            <div className="service-controls">
              <SelectRow label="模型">
                <Select
                  label="模型"
                  onChange={(backendModel) =>
                    onUpdateSettings({ ...settings, backendModel })}
                  options={modelOptions}
                  value={selectedModel}
                />
              </SelectRow>
              {selected?.supportsReasoningEffort && (
                <SelectRow label="推理强度">
                  <Select
                    label="推理强度"
                    onChange={(value) =>
                      onUpdateSettings({
                        ...settings,
                        reasoningEffort:
                          value === "auto" ? null : value as ReasoningEffort,
                      })}
                    options={[
                      { value: "auto", label: "自动" },
                      { value: "high", label: "高" },
                    ]}
                    value={settings.reasoningEffort ?? "auto"}
                  />
                </SelectRow>
              )}
            </div>
          )
          : (
            <div className="service-message">
              <p>{state.message}</p>
              <Button
                className="secondary compact"
                disabled={busy}
                onClick={
                  isCloud
                    ? cloudAction(cloud, {
                        openAccount: onOpenAccount,
                        openRelease: onOpenRelease,
                        retry: onRetryCloud,
                        switchService: onSwitchService,
                      })
                    : onConnectLocal
                }
                type="button"
              >
                {isCloud
                  ? cloud?.authState === "SERVER_UNREACHABLE"
                    ? zhCN.account.retry
                    : cloudActionLabel(cloud)
                  : "连接 GitHub Copilot"}
              </Button>
            </div>
          )}

        {!isCloud && serviceReady && (
          <p className="local-inline-note">
            使用你自己的 GitHub Copilot，不消耗云服务 AI 用量。
          </p>
        )}

        <div className="service-actions">
          <Button
            className="secondary"
            disabled={busy}
            onClick={onSwitchService}
            type="button"
          >
            {copy.switchService}
          </Button>
          <Button
            disabled={busy || (!serviceReady && chatGpt.state === "INSTALLED")}
            onClick={
              chatGpt.state !== "INSTALLED"
                ? onInstallChatGpt
                : profile?.activeProfile === "bridge"
                  ? onOpenChatGpt
                  : onEnableChatGpt
            }
            type="button"
          >
            {chatGpt.state !== "INSTALLED"
              ? copy.installChatGpt
              : profile?.activeProfile === "bridge"
                ? copy.openChatGpt
                : copy.enableInChatGpt}
          </Button>
        </div>
      </div>
    </section>
  );
}

function localStatePresentation(bridge: BridgeStatus | null) {
  if (bridge?.state === "ready") {
    return { symbol: "●", title: "已连接", message: "", tone: "success" };
  }
  if (bridge?.state === "starting") {
    return {
      symbol: "◌",
      title: "正在连接",
      message: "正在连接你的 GitHub Copilot。",
      tone: "neutral",
    };
  }
  if (bridge?.state === "failed") {
    return {
      symbol: "●",
      title: "需要处理",
      message: "GitHub Copilot 连接需要重新处理。",
      tone: "danger",
    };
  }
  return {
    symbol: "○",
    title: "尚未连接",
    message: "连接你的 GitHub Copilot 账号后即可使用。",
    tone: "neutral",
  };
}

function cloudStatePresentation(cloud: CloudServiceStatus | null) {
  if (cloud?.lastError) {
    return {
      symbol: "●",
      title: cloudErrorTitle(cloud.lastError.action),
      message: cloud.lastError.message,
      tone: cloud.lastError.retryable ? "warning" : "danger",
    } as const;
  }
  if (cloud?.serviceStatus === "MAINTENANCE") {
    return {
      symbol: "●",
      title: "服务维护中",
      message: cloud.message,
      tone: "warning",
    } as const;
  }
  if (cloud?.serviceStatus === "UPDATE_REQUIRED") {
    return {
      symbol: "●",
      title: "需要更新",
      message: cloud.message,
      tone: "warning",
    } as const;
  }
  const presentations = {
    AUTHENTICATED: { symbol: "●", title: "已连接", message: "", tone: "success" },
    AUTHENTICATING: {
      symbol: "◌",
      title: zhCN.account.authenticating,
      message: "正在验证账号并准备云服务。",
      tone: "neutral",
    },
    DEVICE_REVOKED: {
      symbol: "●",
      title: zhCN.account.deviceRevoked,
      message: zhCN.account.deviceRevokedMessage,
      tone: "danger",
    },
    SUBSCRIPTION_REQUIRED: {
      symbol: "●",
      title: zhCN.account.subscriptionRequired,
      message: zhCN.account.subscriptionRequiredMessage,
      tone: "warning",
    },
    SUBSCRIPTION_EXPIRED: {
      symbol: "●",
      title: zhCN.account.subscriptionExpired,
      message: zhCN.account.subscriptionExpiredMessage,
      tone: "warning",
    },
    QUOTA_EXCEEDED: {
      symbol: "●",
      title: zhCN.account.quotaExceeded,
      message: zhCN.account.quotaExceededMessage,
      tone: "warning",
    },
    SERVER_UNREACHABLE: {
      symbol: "●",
      title: zhCN.account.serverUnreachable,
      message: zhCN.account.serverUnreachableMessage,
      tone: "warning",
    },
    SIGNED_OUT: {
      symbol: "○",
      title: zhCN.account.signedOut,
      message: zhCN.account.signedOutMessage,
      tone: "neutral",
    },
  } as const;
  return presentations[cloud?.authState ?? "SIGNED_OUT"];
}

function cloudErrorTitle(
  action: NonNullable<CloudServiceStatus["lastError"]>["action"],
): string {
  if (action === "RECONNECT_PROVIDER") return "需要重新连接";
  if (action === "CHANGE_PROVIDER") return "当前 AI 服务不可用";
  if (action === "ADD_POINTS") return "AI 点数不足";
  return "云服务需要处理";
}

function cloudAction(
  cloud: CloudServiceStatus | null,
  actions: {
    openAccount: () => void;
    openRelease: () => void;
    retry: () => void;
    switchService: () => void;
  },
): () => void {
  if (cloud?.serviceStatus === "UPDATE_REQUIRED") return actions.openRelease;
  switch (cloud?.lastError?.action) {
    case "RECONNECT_PROVIDER":
    case "CHANGE_PROVIDER":
      return actions.switchService;
    case "RETRY":
    case "REFRESH_TOKEN":
      return actions.retry;
    default:
      return cloud?.authState === "SERVER_UNREACHABLE"
        ? actions.retry
        : actions.openAccount;
  }
}

function cloudActionLabel(cloud: CloudServiceStatus | null): string {
  if (cloud?.serviceStatus === "UPDATE_REQUIRED") return "立即更新";
  switch (cloud?.lastError?.action) {
    case "RECONNECT_PROVIDER":
      return "重新连接";
    case "CHANGE_PROVIDER":
      return "切换 AI 服务";
    case "RETRY":
      return zhCN.account.retry;
  }
  switch (cloud?.authState) {
    case "DEVICE_REVOKED":
      return zhCN.account.manageDevice;
    case "SUBSCRIPTION_EXPIRED":
      return zhCN.account.renew;
    case "SUBSCRIPTION_REQUIRED":
    case "QUOTA_EXCEEDED":
      return zhCN.account.upgrade;
    default:
      return zhCN.account.login;
  }
}
