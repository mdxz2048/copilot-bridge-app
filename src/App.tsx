import { useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  BridgeModel,
  BridgeStatus,
  ChatGptStatus,
  CloudServiceStatus,
  Diagnostics,
  ProfileStatus,
} from "./bridge-api";
import { AppTitleBar } from "./components/AppTitleBar";
import { AccountSummaryCard } from "./components/AccountSummaryCard";
import { BridgeActivationBar } from "./components/BridgeActivationBar";
import { Button } from "./components/Button";
import { CloudAccountSheet } from "./components/CloudAccountSheet";
import { CurrentServiceCard } from "./components/CurrentServiceCard";
import { Modal } from "./components/Modal";
import { ProductSettingsSheet } from "./components/ProductSettingsSheet";
import { zhCN } from "./locales/zh-CN";
import { displayModel } from "./model-display";


const DEFAULT_SETTINGS: AppSettings = {
  backendModel: null,
  reasoningEffort: null,
  reasoningMode: "auto",
  autoLaunch: true,
  minimizeToTray: true,
  autoBridgeStart: true,
  backendMode: "REMOTE",
  providerConnectionId: null,
  theme: "system",
  onboardingCompleted: false,
};

export function App() {
  const [profile, setProfile] = useState<ProfileStatus | null>(null);
  const [bridge, setBridge] = useState<BridgeStatus | null>(null);
  const [models, setModels] = useState<BridgeModel[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [cloud, setCloud] = useState<CloudServiceStatus | null>(null);
  const [chatGpt, setChatGpt] = useState<ChatGptStatus>({
    state: "NOT_INSTALLED",
    message: "正在检测 ChatGPT…",
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [cloudLoginIssue, setCloudLoginIssue] = useState<"SUBSCRIPTION_REQUIRED" | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [pendingMode, setPendingMode] = useState<boolean | null>(null);
  const confirmedMode = useRef<boolean | null>(null);
  const [restartDismissed, setRestartDismissed] = useState(false);
  const [restartingChatGpt, setRestartingChatGpt] = useState(false);
  const [restartError, setRestartError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.theme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  const refreshApp = async () => {
    try {
      const [nextProfile, nextBridge, nextSettings, nextChatGpt] =
        await Promise.all([
          window.copilotBridge.getProfileStatus(),
          window.copilotBridge.getBridgeStatus(),
          window.copilotBridge.getSettings(),
          window.copilotBridge.getChatGptStatus(),
        ]);
      setProfile(nextProfile);
      setBridge(nextBridge);
      setSettings(nextSettings);
      setChatGpt(nextChatGpt);
      if (nextBridge.state === "ready") {
        setModels(await window.copilotBridge.getModels());
      } else {
        setModels([]);
      }
    } catch (error) {
      showError(error, "暂时无法读取应用状态。");
    } finally {
      setLoaded(true);
    }
  };

  const refreshCloud = async () => {
    try {
      setCloud(await window.copilotBridge.getCloudStatus());
    } catch (error) {
      showError(error, "暂时无法读取云服务状态。");
    }
  };

  useEffect(() => {
    void refreshApp();
    void refreshCloud();
    void window.copilotBridge.getAppVersion().then(setVersion);
    const removeBridge = window.copilotBridge.onBridgeStatus((next) => {
      setBridge(next);
      if (next.state === "ready") {
        void window.copilotBridge.getModels().then(setModels).catch(error => {
          setModels([]);
          showError(error, "暂时无法读取 Cloud 模型，请检查账户或更新后重试。");
        });
      }
    });
    const removeProfile = window.copilotBridge.onProfileStatus(setProfile);
    const removeChatGpt = window.copilotBridge.onChatGptStatus((next) => {
      setChatGpt(next);
      if (next.state === "INSTALLED") void refreshApp();
    });
    const removeCloud = window.copilotBridge.onCloudStatus(setCloud);
    return () => {
      removeBridge();
      removeProfile();
      removeChatGpt();
      removeCloud();
    };
  }, []);

  useEffect(() => {
    if (chatGpt.state !== "INSTALLED" || !installOpen) return;
    const timer = window.setTimeout(() => setInstallOpen(false), 800);
    return () => window.clearTimeout(timer);
  }, [chatGpt.state, installOpen]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (profile?.restartRequired) setRestartDismissed(false);
  }, [profile?.restartRequired, profile?.pendingProfile]);

  const persistSettings = async (next: AppSettings) => {
    setBusy(true);
    try {
      const persisted = await window.copilotBridge.updateSettings({ ...next, backendMode: "REMOTE", providerConnectionId: null });
      setSettings(persisted);
      const nextBridge = await window.copilotBridge.getBridgeStatus();
      setBridge(nextBridge);
      setModels(
        nextBridge.state === "ready"
          ? await window.copilotBridge.getModels()
          : [],
      );
    } catch (error) {
      showError(error, "设置未能保存，请稍后重试。");
    } finally {
      setBusy(false);
    }
  };

  const requestModeSwitch = (enabled: boolean) => {
    if (busy) return;
    if (enabled && chatGpt.state !== "INSTALLED") {
      setNotice("请先安装 ChatGPT，安装完成后才能开启 Cloud。");
      return;
    }
    setPendingMode(enabled);
  };

  const applyConfirmedMode = async (enabled: boolean, authenticatedCloud?: CloudServiceStatus) => {
    if (confirmedMode.current !== enabled) return;
    if (enabled && (authenticatedCloud ?? cloud)?.authState !== "AUTHENTICATED") {
      setCloudOpen(true);
      return;
    }
    setBusy(true);
    setProgressOpen(true);
    setNotice(null);
    try {
      let nextSettings = settings;
      if (enabled) {
        const result = await window.copilotBridge.switchAiService("REMOTE");
        setSettings(result.settings);
        setBridge(result.bridge);
        setModels(result.models);
        nextSettings = result.settings;
        await window.copilotBridge.prepareBridgeEnvironment();
      }
      // Restoring Original does not need Cloud authentication, availability or models.
      const nextProfile = await window.copilotBridge.activateProfile(enabled ? "bridge" : "original");
      setProfile(nextProfile);
      setRestartError(null);
      setRestartDismissed(false);
      setCloudOpen(false);
      confirmedMode.current = null;
      setNotice(enabled ? "✓ Cloud 连接已配置，重启 ChatGPT 后生效" : "✓ 原账号连接已恢复，重启 ChatGPT 后生效");
      if (!nextSettings.onboardingCompleted) {
        try {
          const saved = await window.copilotBridge.updateSettings({ ...nextSettings, backendMode: "REMOTE", providerConnectionId: null, onboardingCompleted: true });
          setSettings(saved);
        } catch {
          setNotice("连接已切换，重启 ChatGPT 后生效；首次使用记录保存失败，可稍后重试。");
        }
      }
    } catch (error) {
      confirmedMode.current = null;
      showError(error, enabled ? "Cloud 连接切换失败，请检查登录和服务状态后重试。" : "原账号连接恢复失败，请重试。");
    } finally {
      setProgressOpen(false);
      setBusy(false);
    }
  };

  const loginCloud = async (credentials: { email: string; password: string }) => {
    setCloudLoginIssue(null);
    setBusy(true);
    setNotice(null);
    try {
      const next = await window.copilotBridge.loginCloud(credentials);
      setCloud(next);
      setCloudLoginIssue(null);
      // Signing in from the account page alone must not change ChatGPT's mode.
      if (confirmedMode.current === true) await applyConfirmedMode(true, next);
    } catch (error) {
      if (error instanceof Error && /SUBSCRIPTION_REQUIRED/i.test(error.message)) setCloudLoginIssue("SUBSCRIPTION_REQUIRED");
      showError(error, "登录失败，请检查账号信息后重试。");
    } finally {
      setBusy(false);
    }
  };

  const openDiagnostics = async () => {
    try {
      setDiagnostics(await window.copilotBridge.getDiagnostics());
      setSettingsOpen(false);
    } catch (error) {
      showError(error, "无法读取诊断信息。");
    }
  };
  const currentModel = displayModel(settings.backendModel ?? models[0]?.id ?? "");
  const serviceHealthy = bridge?.state === "ready" && cloud?.authState === "AUTHENTICATED";

  const installChatGpt = () => {
    setInstallOpen(true);
    void window.copilotBridge.installChatGpt().catch(error => {
      setChatGpt({ state: 'ERROR', message: error instanceof Error ? error.message : '无法启动 ChatGPT 安装，请重试。' });
    });
  };
  const downloadChatGpt = () => {
    setInstallOpen(true);
    void window.copilotBridge.openChatGptDownload().catch(() => {
      setChatGpt({ state: "ERROR", message: "无法下载安装 ChatGPT，请重试。" });
    });
  };

  return (
    <main>
      <AppTitleBar onSettings={() => setSettingsOpen(true)} />
      <div className="app-content">
      {cloud && cloud.updateState !== "CURRENT" && (
        <div className="product-alert" role="status">
          <span>
            {cloud.updateState === "MAINTENANCE"
              ? "Cloud 正在维护，可关闭开关恢复 ChatGPT 原账号。"
              : cloud.updateState === "REQUIRED"
                ? "需要更新 Copilot Bridge 后才能继续使用云服务。"
                : `Copilot Bridge ${
                    cloud.latestRelease?.version
                    ?? cloud.clientConfig?.latestVersion
                    ?? ""
                  } 已发布。`}
          </span>
          {cloud.latestRelease && cloud.updateState !== "MAINTENANCE" && (
            <Button
              className="secondary compact"
              onClick={() =>
                void window.copilotBridge.openCloudRelease().catch(
                  (error: unknown) => showError(error, "无法打开更新下载页面。"),
                )}
              type="button"
            >
              查看更新
            </Button>
          )}
        </div>
      )}

      <BridgeActivationBar
        busy={busy}
        chatGptInstalled={chatGpt.state === 'INSTALLED'}
        onChange={requestModeSwitch}
        profile={profile}
      />

      <AccountSummaryCard
        busy={busy}
        cloud={cloud}
        onLogin={() => {
          confirmedMode.current = null;
          setCloudOpen(true);
        }}
        onOpenDetails={() => {
          setCloudOpen(true);
          void refreshCloud();
        }}
        onRenew={() =>
          void window.copilotBridge.manageCloudSubscription().catch(
            (error: unknown) => showError(error, "无法打开订阅管理页面。"),
          )}
        onUseCloud={() => requestModeSwitch(true)}
        service="REMOTE"
      />

      <CurrentServiceCard
        bridge={bridge}
        bridgeEnabled={profile?.activeProfile === "bridge"}
        busy={busy}
        chatGpt={chatGpt}
        cloud={cloud}
        models={models}
        onEnableChatGpt={() => requestModeSwitch(true)}
        onInstallChatGpt={installChatGpt}
        onOpenAccount={() => setCloudOpen(true)}
        onOpenChatGpt={() => void window.copilotBridge.launchChatGpt()}
        onRestartChatGpt={() => { setRestartError(null); setRestartDismissed(false); }}
        onOpenRelease={() =>
          void window.copilotBridge.openCloudRelease().catch(
            (error: unknown) => showError(error, "无法打开更新下载页面。"),
          )}
        onRetryCloud={() => void refreshCloud()}
        profile={profile}
        settings={settings}
        onUpdateSettings={(next) => void persistSettings(next)}
      />

      </div>
      <footer className="status-bar">
        <span aria-hidden="true">{serviceHealthy ? "●" : "○"}</span>
        {profile?.activeProfile !== "bridge"
          ? zhCN.product.ready
          : serviceHealthy
            ? zhCN.product.serviceNormal
            : zhCN.product.needsAttention}
        <small>{version && `v${version}`}</small>
        <button
          onClick={() =>
            bridge?.state === "failed"
              ? void window.copilotBridge.restartBridge()
              : void openDiagnostics()}
          type="button"
        >
          {bridge?.state === "failed"
            ? zhCN.product.restartBridge
            : zhCN.product.details}
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m6 3 5 5-5 5"/></svg>
        </button>
      </footer>

      {loaded && !settings.onboardingCompleted && chatGpt.state !== 'INSTALLED' && !installOpen && (
        <Modal title="先安装 ChatGPT">
          <p>安装官方 ChatGPT 客户端后，才能开启 Cloud 模式。</p>
          {chatGpt.state === 'ERROR' && <p role="alert">{chatGpt.message}</p>}
          <Button disabled={chatGpt.state === 'INSTALLING'} onClick={installChatGpt} type="button">
            {chatGpt.state === 'INSTALLING' ? '正在安装 ChatGPT…' : '安装 ChatGPT'}
          </Button>
          <Button className="secondary" disabled={chatGpt.state === "INSTALLING" && chatGpt.step !== "WAITING_FOR_STORE"} onClick={downloadChatGpt} type="button">下载并安装</Button>
        </Modal>
      )}
      {settingsOpen && (
        <ProductSettingsSheet
          bridge={bridge}
          onClose={() => setSettingsOpen(false)}
          onDiagnostics={() => void openDiagnostics()}
          onManageChatGpt={() => void window.copilotBridge.launchChatGpt()}
          onRestartBridge={() =>
            void window.copilotBridge.restartBridge().then(setBridge)}
          onUpdate={(next) => void persistSettings(next)}
          profile={profile}
          settings={settings}
        />
      )}

      {cloudOpen && (
        <CloudAccountSheet
          busy={busy}
          loginIssue={cloudLoginIssue}
          onClose={() => {
            setCloudOpen(false);
            confirmedMode.current = null;
          }}
          onLogin={(credentials) => void loginCloud(credentials)}
          onOpenRegistration={() =>
            void window.copilotBridge.openCloudRegistration().catch((error: unknown) =>
              showError(error, "无法打开网站注册页面，请联系管理员。")
            )}
          onLogout={() =>
            void runCloudAction(
              () => window.copilotBridge.logoutCloud(),
              setCloud,
              setBusy,
              showError,
            )}
          onManageAccount={() =>
            void window.copilotBridge.manageCloudAccount().catch((error: unknown) =>
              showError(error, "无法打开账号管理页面。")
            )}
          onManageSubscription={() =>
            void window.copilotBridge.manageCloudSubscription().catch(
              (error: unknown) => showError(error, "无法打开订阅管理页面。"),
            )}
          onRefresh={() =>
            void runCloudAction(
              () => window.copilotBridge.refreshCloud(),
              setCloud,
              setBusy,
              showError,
            )}
          onRevokeDevice={(id) =>
            void runCloudAction(
              () => window.copilotBridge.revokeCloudDevice(id),
              setCloud,
              setBusy,
              showError,
            )}
          onUseOriginal={() => { setCloudOpen(false); requestModeSwitch(false); }}
          status={cloud}
        />
      )}

      {installOpen && (
        <Modal onClose={() => setInstallOpen(false)} title="安装 ChatGPT">
          <ul className="progress-steps">
            <li>{chatGpt.step === "CHECKING" ? "◌" : "✓"} 检查系统环境</li>
            <li>{chatGpt.step === "INSTALLING" ? "◌" : "○"} 安装 ChatGPT</li>
            <li>{chatGpt.step === "VERIFYING" ? "◌" : "○"} 验证安装</li>
          </ul>
          <p>{chatGpt.message}</p>
          {chatGpt.state !== "INSTALLED" && <p>Bridge 会下载并校验官方包，然后启动安装。请允许 Windows 管理员确认。</p>}
          <div className="modal-actions">
            {chatGpt.state !== "INSTALLED" && <Button disabled={chatGpt.state === "INSTALLING" && chatGpt.step !== "WAITING_FOR_STORE"} onClick={downloadChatGpt} type="button">下载并安装</Button>}
            <Button
              className="secondary"
              onClick={() => {
                void window.copilotBridge.cancelChatGptInstall();
                setInstallOpen(false);
              }}
              type="button"
            >
              {zhCN.common.cancel}
            </Button>
          </div>
        </Modal>
      )}

      {pendingMode !== null && (
        <Modal onClose={() => setPendingMode(null)} title={pendingMode ? "切换到 Cloud？" : "切换到 ChatGPT 原账号？"}>
          <p>{pendingMode ? "开启后，ChatGPT 将通过 Bridge 使用 Cloud 模型。" : "关闭后，ChatGPT 将恢复你的原账号连接。"}</p>
          <p>确认切换后需要重启 ChatGPT 才能生效，无需重启 Windows。</p>
          <div className="modal-actions">
            <Button className="secondary" onClick={() => setPendingMode(null)} type="button">取消</Button>
            <Button disabled={busy} onClick={() => {
              const target = pendingMode;
              setPendingMode(null);
              confirmedMode.current = target;
              void applyConfirmedMode(target);
            }} type="button">确认切换</Button>
          </div>
        </Modal>
      )}

      {progressOpen && (
        <Modal title="正在切换 ChatGPT 连接">
          <ul className="progress-steps">
            <li>✓ 检查 AI 服务</li>
            <li>✓ 启动 Copilot Bridge</li>
            <li>◌ 准备 ChatGPT</li>
          </ul>
          <p>请稍候…</p>
        </Modal>
      )}

      {profile?.restartRequired && chatGpt.state === "INSTALLED" && !restartDismissed && (
        <Modal onClose={() => { if (!restartingChatGpt) setRestartDismissed(true); }} title="现在重启 ChatGPT？">
          <p>
            {profile.pendingProfile === "bridge"
              ? "已切换到 Copilot Bridge Cloud，重启 ChatGPT 后生效。"
              : "你自己的 ChatGPT 原账号配置已恢复，重启 ChatGPT 后生效。"}
          </p>
          <p>保存工作后即可重启 ChatGPT。运行中的任务会中止，会话和工作区保留；无需重启 Windows。</p>
          {restartError && <p role="alert">{restartError}</p>}
          <div className="modal-actions">
            <Button
              className="secondary"
              onClick={() => setRestartDismissed(true)}
              type="button"
              disabled={restartingChatGpt}
            >
              稍后重启 ChatGPT
            </Button>
            <Button disabled={restartingChatGpt} onClick={() => {
              setRestartError(null); setRestartingChatGpt(true);
              void window.copilotBridge.restartChatGpt().then(setProfile)
                .catch(error => setRestartError(error instanceof Error && !/Command failed|powershell\.exe|Stop-Process|Error invoking remote method|FullyQualifiedErrorId/i.test(error.message)
                  ? error.message : "ChatGPT 重启失败。请手动关闭后重新打开，或稍后重试。"))
                .finally(() => setRestartingChatGpt(false));
            }} type="button">
              {restartingChatGpt ? "正在重启…" : "立即重启 ChatGPT"}
            </Button>
          </div>
        </Modal>
      )}

      {diagnostics && (
        <Modal onClose={() => setDiagnostics(null)} title="诊断信息">
          <div className="diagnostics-grid">
            <span>AI 服务</span>
            <strong>
              {settings.backendMode === "REMOTE"
                ? zhCN.product.cloudService
                : "Cloud（尚未开启）"}
            </strong>
            <span>Bridge</span>
            <strong>{diagnostics.bridge.message}</strong>
            <span>ChatGPT</span>
            <strong>
              {diagnostics.chatGpt.state === "INSTALLED" ? "已安装" : "未安装"}
            </strong>
            <span>ChatGPT 环境</span>
            <strong>
              {diagnostics.profile.activeProfile === "bridge"
                ? "Copilot 环境"
                : "原账号环境"}
            </strong>
            <span>模型</span>
            <strong>{currentModel || "自动选择"}</strong>
            <span>App</span>
            <strong>{`v${diagnostics.appVersion}`}</strong>
          </div>
          <div className="modal-actions">
            <Button className="secondary" onClick={() => setDiagnostics(null)} type="button">
              {zhCN.common.close}
            </Button>
          </div>
        </Modal>
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice(null)} type="button">
            ×
          </button>
        </div>
      )}
    </main>
  );

  function showError(error: unknown, fallback: string) {
    setNotice(friendlyError(error, fallback));
  }
}

async function runCloudAction(
  action: () => Promise<CloudServiceStatus>,
  setCloud: (status: CloudServiceStatus) => void,
  setBusy: (busy: boolean) => void,
  showError: (error: unknown, fallback: string) => void,
) {
  setBusy(true);
  try {
    setCloud(await action());
  } catch (error) {
    showError(error, "云服务操作失败，请稍后重试。");
  } finally {
    setBusy(false);
  }
}

function friendlyError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/CLIENT_UPGRADE_REQUIRED|请升级 Copilot Bridge|需要更新 Copilot Bridge/i.test(error.message)) {
    return "当前 Bridge 版本已停止服务，请使用右上角更新按钮安装最新版后重试。关闭开关仍可恢复自己的 ChatGPT。";
  }
  if (/DEVICE_REVOKED/i.test(error.message)) return zhCN.account.deviceRevokedMessage;
  if (/SUBSCRIPTION_EXPIRED/i.test(error.message)) {
    return zhCN.account.subscriptionExpiredMessage;
  }
  if (/SUBSCRIPTION_REQUIRED/i.test(error.message)) {
    return "Cloud 套餐未开通，需管理员人工开通；请在账户页查看网站入口，开通后重试登录。";
  }
  if (/MONTHLY_QUOTA_EXCEEDED|QUOTA_EXCEEDED/i.test(error.message)) {
    return zhCN.account.quotaExceededMessage;
  }
  if (/fetch failed|ECONNREFUSED|SERVER_UNREACHABLE/i.test(error.message)) {
    return zhCN.account.serverUnreachableMessage;
  }
  return fallback;
}
