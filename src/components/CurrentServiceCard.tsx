import type {
  AppSettings,
  BridgeModel,
  BridgeStatus,
  ChatGptStatus,
  CloudServiceStatus,
  ProfileStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { displayModel } from "../model-display";
import { Button } from "./Button";
import { Select, SelectRow } from "./Select";
import {ServiceMark,ServiceActionIcon} from './ServiceMark';

interface CurrentServiceCardProps {
  bridge: BridgeStatus | null;
  busy: boolean;
  chatGpt: ChatGptStatus;
  cloud: CloudServiceStatus | null;
  models: BridgeModel[];
  profile: ProfileStatus | null;
  bridgeEnabled: boolean;
  settings: AppSettings;
  onEnableChatGpt: () => void;
  onInstallChatGpt: () => void;
  onOpenAccount: () => void;
  onOpenChatGpt: () => void;
  onRestartChatGpt: () => void;
  onOpenRelease: () => void;
  onRetryCloud: () => void;
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
  settings,
  onEnableChatGpt,
  onInstallChatGpt,
  onOpenAccount,
  onOpenChatGpt,
  onRestartChatGpt,
  onOpenRelease,
  onRetryCloud,
  onUpdateSettings,
}: CurrentServiceCardProps) {
  const copy = zhCN.product;
  const cloudReady =
    cloud?.authState === "AUTHENTICATED"
    && cloud.serviceStatus === "AVAILABLE"
    && !cloud.lastError;
  const bridgeReady = bridge?.state === "ready";
  const profilePending = profile?.restartRequired === true;
  const serviceReady = cloudReady && bridgeReady;
  const connectionPending = cloudReady && !bridgeReady;
  const state = connectionPending ? {symbol:'●',title:'本地连接未就绪',message:bridge?.message || '平台账号已连接，本地转发尚未启动，请重试连接。',tone:'warning'} : cloudStatePresentation(cloud);
  const selectedModel = settings.backendModel ?? models[0]?.id ?? "";
  const selected = models.find((model) => model.id === selectedModel);
  const reasoningModes = selected?.reasoningModes?.length ? selected.reasoningModes : ["normal"];
  const reasoningMode = reasoningModes.includes(settings.reasoningMode ?? "auto")
    ? settings.reasoningMode ?? "auto" : reasoningModes.includes(selected?.defaultReasoningMode ?? "normal")
      ? selected?.defaultReasoningMode ?? "normal" : reasoningModes[0];
  const modelOptions = models.filter(model=>!model.availability||model.availability==="READY").map((model) => ({
    value: model.id,
    label: displayModel(model.id)+(model.availability==="SETUP_REQUIRED"?" · 待开通":model.availability==="UNAVAILABLE"?" · 暂不可用":""),
  }));

  if (!bridgeEnabled) {
    return (
      <section aria-labelledby="current-service-heading">
        <h2 id="current-service-heading">AI 服务</h2>
        <div className="card current-service-card bridge-disabled-card">
          <div className="service-card-header">
            <div className="service-identity"><ServiceMark original/><p className="service-name">ChatGPT 原账号</p></div>
            <span className={`service-state state-${profilePending ? "neutral" : "success"}`}>
              <span aria-hidden="true">●</span>
              {profilePending ? "需重启 ChatGPT" : "当前使用"}
            </span>
          </div>
          <p className="bridge-disabled-message">
            {profilePending
              ? "你自己的 ChatGPT 配置已恢复，重启 ChatGPT 后生效，无需重启或注销 Windows。"
              : "Copilot Bridge 未启用，ChatGPT 保持原来的账号、会话和配置。"}
          </p>
          <div className="service-actions">
            <Button
              disabled={busy}
              onClick={chatGpt.state !== "INSTALLED" ? onInstallChatGpt : profilePending ? onRestartChatGpt : onOpenChatGpt}
              type="button"
            >
              <ServiceActionIcon/>{chatGpt.state === "INSTALLING" ? "查看安装进度" : chatGpt.state !== "INSTALLED"
                ? copy.installChatGpt
                : profilePending
                  ? "重启 ChatGPT"
                  : copy.openChatGpt}
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
          <div className="service-identity"><ServiceMark/><p className="service-name">
            {copy.cloudService}
          </p></div>
          <div className="service-header-state">
            <span className={`service-state state-${profilePending ? "neutral" : state.tone}`}>
              <span aria-hidden="true">{state.symbol}</span>
              {profilePending ? "需重启 ChatGPT" : state.title}
            </span>
          </div>
        </div>
        {profilePending && (
          <p className="local-inline-note" role="status">
            Cloud 配置已保存，重启 ChatGPT 后生效，无需重启或注销 Windows。
          </p>
        )}

        {serviceReady && selected?.availability && selected.availability !== "READY" && <p className="local-inline-note" role="status">{selected.statusMessage ?? "模型暂不可用，请联系管理员。"} 选择其他可用模型可继续使用。</p>}
        {serviceReady && !selected && settings.backendModel && <p className="local-inline-note" role="status">当前模型已停用或权限已调整，请选择其他模型并新建会话。</p>}
        {serviceReady && selectedModel
          ? (
            <div className="service-controls">
              <SelectRow label="Cloud 实际模型">
                <Select
                  label="模型"
                  onChange={(backendModel) => {
                    const nextModel = models.find(model => model.id === backendModel);
                    const modes = nextModel?.reasoningModes?.length ? nextModel.reasoningModes : ["normal"];
                    const mode = modes.includes(settings.reasoningMode ?? "auto") ? settings.reasoningMode ?? "auto"
                      : modes.includes(nextModel?.defaultReasoningMode ?? "normal") ? nextModel?.defaultReasoningMode ?? "normal" : modes[0];
                    onUpdateSettings({ ...settings, backendModel, reasoningMode: mode as AppSettings["reasoningMode"], reasoningEffort: null });
                  }}
                  options={modelOptions}
                  value={selectedModel}
                />
              </SelectRow>
              <SelectRow label="思考模式">
                  <Select label="思考模式" value={reasoningMode}
                    options={reasoningModes.map(value => ({ value, label: value === "thinking" ? "思考" : value === "auto" ? "自动" : "普通" }))}
                    onChange={value => onUpdateSettings({ ...settings, reasoningMode: value as AppSettings["reasoningMode"], reasoningEffort: null })}/>
              </SelectRow>
            </div>
          )
          : (
            <div className="service-message">
              <p>{state.message}</p>
              {cloud?.lastError?.requestId && <p className="local-inline-note">请求 ID：<code>{cloud.lastError.requestId}</code> · 联系管理员时请提供此编号。</p>}
              <Button
                className="secondary compact"
                disabled={busy}
                onClick={connectionPending ? onRetryCloud : cloudAction(cloud, {
                  openAccount: onOpenAccount,
                  openRelease: onOpenRelease,
                  retry: onRetryCloud,
                })}
                type="button"
              >
                {connectionPending ? "重试连接" : cloudActionLabel(cloud)}
              </Button>
            </div>
          )}
        {serviceReady && selectedModel && <p className="local-inline-note">Cloud 请求使用 {displayModel(selectedModel)}。切换模型后请新建会话。</p>}

        <div className="service-actions">
          <Button
            disabled={busy
              || (!cloudReady && !profilePending && chatGpt.state === "INSTALLED")}
            onClick={
              chatGpt.state !== "INSTALLED"
                ? onInstallChatGpt
                : profilePending ? onRestartChatGpt
                : profile?.activeProfile === "bridge"
                  ? onOpenChatGpt
                  : onEnableChatGpt
            }
            type="button"
          >
            <ServiceActionIcon/>{chatGpt.state === "INSTALLING" ? "查看安装进度" : chatGpt.state !== "INSTALLED"
              ? copy.installChatGpt
              : profilePending
                ? "重启 ChatGPT"
                : profile?.activeProfile === "bridge"
                  ? copy.openChatGpt
                  : copy.enableInChatGpt}
          </Button>
        </div>
      </div>
    </section>
  );
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
  if (cloud?.serviceStatus === "BALANCE_REQUIRED") {
    return { symbol: "●", title: "余额不足", message: cloud.message, tone: "danger" } as const;
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
    ACCOUNT_LOCKED: { symbol: "●", title: "账号已锁定", message: "账号已被管理员锁定，请联系管理员解锁。", tone: "danger" },
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
  },
): () => void {
  if (cloud?.serviceStatus === "UPDATE_REQUIRED") return actions.openRelease;
  switch (cloud?.lastError?.action) {
    case "RECONNECT_PROVIDER":
    case "CHANGE_PROVIDER":
      return actions.retry;
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
  if (cloud?.serviceStatus === "BALANCE_REQUIRED") return "查看账户";
  if (cloud?.serviceStatus === "UPDATE_REQUIRED") return "立即更新";
  switch (cloud?.lastError?.action) {
    case "RECONNECT_PROVIDER":
      return "重新连接";
    case "CHANGE_PROVIDER":
      return "重试连接";
    case "RETRY":
      return zhCN.account.retry;
  }
  switch (cloud?.authState) {
    case "ACCOUNT_LOCKED":
      return "查看账户";
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
