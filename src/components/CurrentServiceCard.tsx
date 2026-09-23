import type {
  AppSettings,
  BridgeStatus,
  ChatGptStatus,
  CloudServiceStatus,
  ProfileStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";

interface CurrentServiceCardProps {
  busy: boolean;
  bridge: BridgeStatus | null;
  chatGpt: ChatGptStatus;
  cloud: CloudServiceStatus | null;
  model: string;
  profile: ProfileStatus | null;
  service: AppSettings["backendMode"];
  onConnectLocal: () => void;
  onEnableChatGpt: () => void;
  onInstallChatGpt: () => void;
  onOpenAccount: () => void;
  onOpenChatGpt: () => void;
  onRetryCloud: () => void;
  onSwitchService: () => void;
}

export function CurrentServiceCard({
  busy,
  bridge,
  chatGpt,
  cloud,
  model,
  profile,
  service,
  onConnectLocal,
  onEnableChatGpt,
  onInstallChatGpt,
  onOpenAccount,
  onOpenChatGpt,
  onRetryCloud,
  onSwitchService,
}: CurrentServiceCardProps) {
  const copy = zhCN.product;
  const isCloud = service === "REMOTE";
  const cloudReady = cloud?.authState === "AUTHENTICATED";
  const bridgeReady = bridge?.state === "ready";
  const serviceReady = isCloud ? cloudReady && bridgeReady : bridgeReady;
  const state = isCloud ? cloudStatePresentation(cloud) : localStatePresentation(bridge);

  return (
    <section aria-labelledby="current-service-heading" className="service-section">
      <h2 id="current-service-heading">{copy.currentService}</h2>
      <div className="card current-service-card" aria-live="polite">
        <div className="service-card-header">
          <div>
            <p className="service-name">
              {isCloud ? copy.cloudService : copy.localService}
            </p>
            <p className={`service-state state-${state.tone}`}>
              <span aria-hidden="true">{state.symbol}</span>
              {state.title}
            </p>
          </div>
          {isCloud && cloud?.plan && (
            <span className="plan-pill">{cloud.plan}</span>
          )}
        </div>

        {(isCloud ? cloudReady : bridgeReady) && (
          <div className="service-details">
            <div className="service-detail">
              <span>{copy.currentModel}</span>
              <strong>{model || "自动选择"}</strong>
            </div>
            {isCloud
              ? (
                <UsageSummary
                  label={copy.cloudUsage}
                  percent={cloud?.usagePercent}
                  summary={cloud?.usage}
                />
              )
              : (
                <p className="local-usage-note">
                  {copy.localDescription}
                  <span>{copy.localUsage}</span>
                </p>
              )}
          </div>
        )}

        {!state.ready && (
          <div className="service-message">
            <p>{state.message}</p>
            {isCloud
              ? (
                <Button
                  className="secondary compact"
                  disabled={busy}
                  onClick={
                    cloud?.authState === "SERVER_UNREACHABLE"
                      ? onRetryCloud
                      : onOpenAccount
                  }
                  type="button"
                >
                  {cloud?.authState === "SERVER_UNREACHABLE"
                    ? zhCN.account.retry
                    : cloudActionLabel(cloud)}
                </Button>
              )
              : (
                <Button
                  className="secondary compact"
                  disabled={busy}
                  onClick={onConnectLocal}
                  type="button"
                >
                  连接 GitHub Copilot
                </Button>
              )}
          </div>
        )}

        <div className="chatgpt-context">
          <span>
            {profile?.activeProfile === "bridge"
              ? copy.bridgeEnvironment
              : copy.originalEnvironment}
          </span>
        </div>

        <div className="service-actions">
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
          <Button
            className="secondary"
            disabled={busy}
            onClick={onSwitchService}
            type="button"
          >
            {copy.switchService}
          </Button>
        </div>
      </div>
    </section>
  );
}

function UsageSummary({
  label,
  percent,
  summary,
}: {
  label: string;
  percent: number | null | undefined;
  summary: string | null | undefined;
}) {
  const normalized = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div className="usage-summary">
      <div>
        <span>{label}</span>
        <strong>{percent == null ? "—" : `${String(percent)}%`}</strong>
      </div>
      <div
        aria-label={`${label} ${String(normalized)}%`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={normalized}
        className="usage-track"
        role="progressbar"
      >
        <span style={{ width: `${String(normalized)}%` }} />
      </div>
      {summary && <small>{summary}</small>}
    </div>
  );
}

function localStatePresentation(bridge: BridgeStatus | null) {
  if (bridge?.state === "ready") {
    return {
      ready: true,
      symbol: "●",
      title: zhCN.product.connected,
      message: "",
      tone: "success",
    };
  }
  if (bridge?.state === "starting") {
    return {
      ready: false,
      symbol: "◌",
      title: zhCN.product.connecting,
      message: "正在连接你的 GitHub Copilot。",
      tone: "neutral",
    };
  }
  if (bridge?.state === "failed") {
    return {
      ready: false,
      symbol: "●",
      title: zhCN.product.needsAttention,
      message: "GitHub Copilot 连接需要重新处理。",
      tone: "danger",
    };
  }
  return {
    ready: false,
    symbol: "○",
    title: zhCN.product.notConnected,
    message: "连接你的 GitHub Copilot 账号后即可使用。",
    tone: "neutral",
  };
}

function cloudStatePresentation(cloud: CloudServiceStatus | null) {
  switch (cloud?.authState) {
    case "AUTHENTICATED":
      return {
        ready: true,
        symbol: "●",
        title: zhCN.product.connected,
        message: "",
        tone: "success",
      };
    case "AUTHENTICATING":
      return {
        ready: false,
        symbol: "◌",
        title: zhCN.account.authenticating,
        message: "正在验证账号并准备云服务。",
        tone: "neutral",
      };
    case "DEVICE_REVOKED":
      return {
        ready: false,
        symbol: "●",
        title: zhCN.account.deviceRevoked,
        message: zhCN.account.deviceRevokedMessage,
        tone: "danger",
      };
    case "SUBSCRIPTION_REQUIRED":
      return {
        ready: false,
        symbol: "●",
        title: zhCN.account.subscriptionRequired,
        message: zhCN.account.subscriptionRequiredMessage,
        tone: "warning",
      };
    case "SUBSCRIPTION_EXPIRED":
      return {
        ready: false,
        symbol: "●",
        title: zhCN.account.subscriptionExpired,
        message: zhCN.account.subscriptionExpiredMessage,
        tone: "warning",
      };
    case "QUOTA_EXCEEDED":
      return {
        ready: false,
        symbol: "●",
        title: zhCN.account.quotaExceeded,
        message: zhCN.account.quotaExceededMessage,
        tone: "warning",
      };
    case "SERVER_UNREACHABLE":
      return {
        ready: false,
        symbol: "●",
        title: zhCN.account.serverUnreachable,
        message: zhCN.account.serverUnreachableMessage,
        tone: "warning",
      };
    default:
      return {
        ready: false,
        symbol: "○",
        title: zhCN.account.signedOut,
        message: zhCN.account.signedOutMessage,
        tone: "neutral",
      };
  }
}

function cloudActionLabel(cloud: CloudServiceStatus | null): string {
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
