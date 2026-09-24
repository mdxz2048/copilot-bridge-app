import { useEffect, useState } from "react";
import type {
  AppSettings,
  AuthStatus,
  BridgeModel,
  BridgeStatus,
  ChatGptStatus,
  CloudServiceStatus,
  Diagnostics,
  ProfileId,
  ProfileStatus,
} from "./bridge-api";
import { AppTitleBar } from "./components/AppTitleBar";
import { AccountSummaryCard } from "./components/AccountSummaryCard";
import { BridgeActivationBar } from "./components/BridgeActivationBar";
import { Button } from "./components/Button";
import { CloudAccountSheet } from "./components/CloudAccountSheet";
import { CurrentServiceCard } from "./components/CurrentServiceCard";
import { FirstRunDialog } from "./components/FirstRunDialog";
import { Modal } from "./components/Modal";
import { ProductSettingsSheet } from "./components/ProductSettingsSheet";
import { ServiceSelectionSheet } from "./components/ServiceSelectionSheet";
import { zhCN } from "./locales/zh-CN";
import { displayModel } from "./model-display";
import {
  buildProviders,
  type AIProviderId,
} from "./domain/product-models";

const DEFAULT_SETTINGS: AppSettings = {
  backendModel: null,
  reasoningEffort: null,
  autoLaunch: true,
  minimizeToTray: true,
  autoBridgeStart: true,
  backendMode: "LOCAL",
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
  const [auth, setAuth] = useState<AuthStatus>({
    state: "idle",
    message: "请在浏览器中完成 GitHub 登录。",
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [activateCloudAfterLogin, setActivateCloudAfterLogin] = useState(false);
  const [activateLocalAfterLogin, setActivateLocalAfterLogin] = useState(false);
  const [restartDismissed, setRestartDismissed] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<AIProviderId | null>(null);
  const [copilotPreflightOpen, setCopilotPreflightOpen] = useState(false);
  const [customApiOpen, setCustomApiOpen] = useState(false);
  const [customApiLabel, setCustomApiLabel] = useState("我的 DeepSeek");
  const [customApiKey, setCustomApiKey] = useState("");

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
    const removeAuth = window.copilotBridge.onCopilotLoginStatus((next) => {
      setAuth(next);
      if (next.state === "success") {
        window.setTimeout(() => setLoginOpen(false), 800);
        if (activateLocalAfterLogin) {
          setActivateLocalAfterLogin(false);
          void switchService("LOCAL");
        } else {
          void refreshApp();
        }
      }
    });
    const removeBridge = window.copilotBridge.onBridgeStatus((next) => {
      setBridge(next);
      if (next.state === "ready") {
        void window.copilotBridge.getModels().then(setModels);
      }
    });
    const removeProfile = window.copilotBridge.onProfileStatus(setProfile);
    const removeChatGpt = window.copilotBridge.onChatGptStatus((next) => {
      setChatGpt(next);
      if (next.state === "INSTALLED") void refreshApp();
    });
    const removeCloud = window.copilotBridge.onCloudStatus(setCloud);
    return () => {
      removeAuth();
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
      const persisted = await window.copilotBridge.updateSettings(next);
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

  const switchService = async (target: AppSettings["backendMode"]) => {
    if (
      target === settings.backendMode
      && bridge?.state === "ready"
      && !(target === "REMOTE" && settings.providerConnectionId)
    ) {
      setServicesOpen(false);
      return;
    }
    if (target === "REMOTE" && cloud?.authState !== "AUTHENTICATED") {
      setActivateCloudAfterLogin(true);
      setServicesOpen(false);
      setCloudOpen(true);
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const result = await window.copilotBridge.switchAiService(target);
      setSettings(result.settings);
      setBridge(result.bridge);
      setModels(result.models);
      setServicesOpen(false);
      setCloudOpen(false);
      setNotice(
        target === "REMOTE"
          ? "✓ 已切换到 Copilot Bridge 云服务"
          : "✓ 已切换到我的 GitHub Copilot",
      );
    } catch (error) {
      showError(error, "AI 服务切换失败，已恢复之前的服务。");
      if (target === "LOCAL") {
        const unavailable = error instanceof Error
          && /没有可用模型|no available model/i.test(error.message);
        setAuth({
          state: unavailable ? "no_subscription" : "network_error",
          message: unavailable
            ? "未检测到可用的 GitHub Copilot 订阅。"
            : "GitHub Copilot 暂时无法连接。",
        });
        setLoginOpen(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const loginCloud = async (credentials: {
    email: string;
    password: string;
  }) => {
    setBusy(true);
    setNotice(null);
    try {
      const next = await window.copilotBridge.loginCloud(credentials);
      setCloud(next);
      if (activateCloudAfterLogin || settings.backendMode !== "REMOTE") {
        setActivateCloudAfterLogin(false);
        await switchService("REMOTE");
      }
    } catch (error) {
      showError(error, "登录失败，请检查账号信息后重试。");
    } finally {
      setBusy(false);
    }
  };

  const registerCloud = async (request: {
    email: string;
    password: string;
    referralCode?: string;
  }) => {
    setBusy(true);
    setNotice(null);
    try {
      await window.copilotBridge.registerCloud(request);
      setNotice("账号创建成功。登录并完成套餐设置后即可使用云服务。");
    } catch (error) {
      showError(error, "注册失败，请检查账号和邀请码后重试。");
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const startLocalLogin = async () => {
    setLoginOpen(true);
    setNotice(null);
    try {
      await window.copilotBridge.startCopilotLogin();
    } catch (error) {
      showError(error, "暂时无法开始 GitHub Copilot 登录。");
    }
  };

  const completeOnboarding = async (
    target: AppSettings["backendMode"],
  ) => {
    const next = { ...settings, onboardingCompleted: true };
    await persistSettings(next);
    if (target === "REMOTE") {
      setActivateCloudAfterLogin(true);
      setCloudOpen(true);
    } else if (bridge?.state !== "ready") {
      await startLocalLogin();
    }
  };

  const switchProfile = async (target: ProfileId) => {
    setBusy(true);
    setProgressOpen(true);
    try {
      setProfile(await window.copilotBridge.activateProfile(target));
    } catch (error) {
      showError(error, "ChatGPT 环境切换失败。");
    } finally {
      setProgressOpen(false);
      setBusy(false);
    }
  };

  const prepareBridgeProfile = async () => {
    setSetupOpen(false);
    try {
      await window.copilotBridge.prepareBridgeEnvironment();
      await switchProfile("bridge");
    } catch (error) {
      showError(error, "无法准备 Copilot 环境。");
    }
  };

  const setBridgeEnabled = async (enabled: boolean) => {
    if (enabled) {
      if (bridge?.state !== "ready") {
        showError(
          new Error("AI service unavailable"),
          "请先连接当前 AI 服务，再启用 Copilot Bridge。",
        );
        setServicesOpen(true);
        return;
      }
      setSetupOpen(true);
      return;
    }
    await switchProfile("original");
  };

  const openDiagnostics = async () => {
    try {
      setDiagnostics(await window.copilotBridge.getDiagnostics());
      setSettingsOpen(false);
    } catch (error) {
      showError(error, "无法读取诊断信息。");
    }
  };

  const currentModel = displayModel(
    settings.backendModel ?? models[0]?.id ?? "",
  );
  const serviceHealthy = bridge?.state === "ready"
    && (
      settings.backendMode === "LOCAL"
      || cloud?.authState === "AUTHENTICATED"
    );
  const providers = buildProviders(settings, cloud, bridge, models);
  const currentProvider = providers.find((provider) => provider.active)!;
  const targetProvider = providers.find(
    (provider) => provider.id === pendingProvider,
  );

  const activateCustomApi = async () => {
    const provider = providers.find(
      (item) => item.id === "custom-api",
    );
    if (!provider) return;
    const connection = cloud?.providerConnections.find(
      (item) => item.status === "ACTIVE",
    );
    setBusy(true);
    try {
      if (connection) {
        const result = await window.copilotBridge.activateCloudProvider(
          connection.id,
        );
        setSettings(result.settings);
        setBridge(result.bridge);
        setModels(result.models);
      } else {
        const result = await window.copilotBridge.connectCloudProvider({
            providerId: cloud!.providers.find(
              (item) => item.code.toUpperCase() === "DEEPSEEK",
            )!.id,
            label: customApiLabel,
            apiKey: customApiKey,
          });
        setSettings(result.settings);
        setBridge(result.bridge);
        setModels(result.models);
        setCloud(result.status);
      }
      setCustomApiKey("");
      setCustomApiOpen(false);
      setPendingProvider(null);
      setNotice("✓ 已切换到我的 API");
    } catch (error) {
      showError(error, "API Key 验证失败，未切换当前服务。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <AppTitleBar onSettings={() => setSettingsOpen(true)} />

      <BridgeActivationBar
        busy={busy}
        onChange={(enabled) => void setBridgeEnabled(enabled)}
        profile={profile}
      />

      <AccountSummaryCard
        busy={busy}
        cloud={cloud}
        onLogin={() => {
          setActivateCloudAfterLogin(false);
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
        onUseCloud={() => void switchService("REMOTE")}
        service={settings.backendMode}
      />

      <CurrentServiceCard
        bridge={bridge}
        bridgeEnabled={profile?.activeProfile === "bridge"}
        busy={busy}
        chatGpt={chatGpt}
        cloud={cloud}
        models={models}
        onConnectLocal={() => void startLocalLogin()}
        onEnableChatGpt={() => setSetupOpen(true)}
        onInstallChatGpt={() => {
          setInstallOpen(true);
          void window.copilotBridge.installChatGpt();
        }}
        onOpenAccount={() => setCloudOpen(true)}
        onOpenChatGpt={() => void window.copilotBridge.launchChatGpt()}
        onRetryCloud={() => void refreshCloud()}
        onSwitchService={() => setServicesOpen(true)}
        profile={profile}
        provider={currentProvider}
        settings={settings}
        onUpdateSettings={(next) => void persistSettings(next)}
      />

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
        </button>
      </footer>

      {loaded && !settings.onboardingCompleted && (
        <FirstRunDialog
          busy={busy}
          onChoose={(service) => void completeOnboarding(service)}
        />
      )}

      {servicesOpen && (
        <ServiceSelectionSheet
          busy={busy}
          onClose={() => setServicesOpen(false)}
          onSelect={(provider) => {
            setServicesOpen(false);
            if (provider === "custom-api") {
              const connection = cloud?.providerConnections.find(
                (item) => item.status === "ACTIVE",
              );
              if (connection) {
                setPendingProvider(provider);
              } else {
                setCustomApiOpen(true);
              }
              return;
            }
            if (provider === "github-copilot" && bridge?.state !== "ready") {
              setPendingProvider(provider);
              setCopilotPreflightOpen(true);
              return;
            }
            setPendingProvider(provider);
          }}
          providers={providers}
        />
      )}

      {pendingProvider && targetProvider && !copilotPreflightOpen && (
        <Modal
          onClose={() => setPendingProvider(null)}
          title="切换 AI 服务"
        >
          <p>将从：</p>
          <p className="switch-provider-name">{currentProvider.name}</p>
          <p>切换到：</p>
          <p className="switch-provider-name">{targetProvider.name}</p>
          <p>切换后，ChatGPT 的新请求将使用新的 AI 服务。</p>
          <div className="modal-actions">
            <Button
              className="secondary"
              onClick={() => setPendingProvider(null)}
              type="button"
            >
              取消
            </Button>
            <Button
              onClick={() => {
                if (pendingProvider === "custom-api") {
                  void activateCustomApi();
                } else {
                  const target = pendingProvider === "bridge-cloud"
                    ? "REMOTE"
                    : "LOCAL";
                  setPendingProvider(null);
                  void switchService(target);
                }
              }}
              type="button"
            >
              切换
            </Button>
          </div>
        </Modal>
      )}

      {copilotPreflightOpen && (
        <Modal
          onClose={() => {
            setCopilotPreflightOpen(false);
            setPendingProvider(null);
          }}
          title="使用你的 GitHub Copilot"
        >
          <p>当前设备尚未连接 GitHub Copilot。</p>
          <p>你是否已经订阅 GitHub Copilot？</p>
          <div className="modal-actions">
            <Button
              className="secondary"
              onClick={() => {
                setCopilotPreflightOpen(false);
                setPendingProvider(null);
                setServicesOpen(true);
              }}
              type="button"
            >
              我还没有
            </Button>
            <Button
              onClick={() => {
                setCopilotPreflightOpen(false);
                setPendingProvider(null);
                setActivateLocalAfterLogin(true);
                void startLocalLogin();
              }}
              type="button"
            >
              我已订阅
            </Button>
          </div>
        </Modal>
      )}

      {customApiOpen && (
        <Modal
          onClose={() => {
            setCustomApiOpen(false);
            setCustomApiKey("");
          }}
          title="连接我的 API"
        >
          <p>
            当前 Server Contract 支持经过服务端验证和加密存储的 DeepSeek
            API Key。Desktop 不会保存或回显你的 Key。
          </p>
          <div className="cloud-login-fields">
            <label>
              <span>连接名称</span>
              <input
                onChange={(event) => setCustomApiLabel(event.target.value)}
                value={customApiLabel}
              />
            </label>
            <label>
              <span>API Key</span>
              <input
                autoComplete="off"
                onChange={(event) => setCustomApiKey(event.target.value)}
                type="password"
                value={customApiKey}
              />
            </label>
          </div>
          <div className="modal-actions">
            <Button
              className="secondary"
              onClick={() => {
                setCustomApiOpen(false);
                setCustomApiKey("");
              }}
              type="button"
            >
              取消
            </Button>
            <Button
              disabled={busy || customApiKey.length < 8 || !customApiLabel.trim()}
              onClick={() => void activateCustomApi()}
              type="button"
            >
              验证并使用
            </Button>
          </div>
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
          onClose={() => setCloudOpen(false)}
          onLogin={(credentials) => void loginCloud(credentials)}
          onRegister={registerCloud}
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
          onUseLocal={() => void switchService("LOCAL")}
          status={cloud}
        />
      )}

      {loginOpen && (
        <Modal onClose={() => setLoginOpen(false)} title="连接 GitHub Copilot">
          <p>{auth.message}</p>
          <ol className="auth-steps">
            <li className={authStepDone(auth.state, 1) ? "done" : ""}>
              ① 登录 GitHub
            </li>
            <li className={authStepDone(auth.state, 2) ? "done" : ""}>
              ② 完成设备授权
            </li>
            <li className={authStepDone(auth.state, 3) ? "done" : ""}>
              ③ 自动检测 Copilot
            </li>
          </ol>
          {auth.deviceCode && (
            <div className="device-code-actions">
              <code>{auth.deviceCode}</code>
              <Button
                className="secondary compact"
                onClick={() => void navigator.clipboard.writeText(auth.deviceCode!)}
                type="button"
              >
                复制验证码
              </Button>
              {auth.verificationUrl && (
                <Button
                  className="secondary compact"
                  onClick={() =>
                    void window.copilotBridge.openCopilotVerification(
                      auth.verificationUrl!,
                    )}
                  type="button"
                >
                  打开 GitHub 授权
                </Button>
              )}
            </div>
          )}
          {auth.state === "success" && (
            <p className="success-message">✓ GitHub Copilot 已连接</p>
          )}
          {auth.state === "no_subscription" && (
            <div className="auth-warning">
              <strong>GitHub 已连接</strong>
              <p>但当前账号未检测到可用的 GitHub Copilot 订阅。</p>
            </div>
          )}
          <div className="modal-actions">
            <Button
              className="secondary"
              onClick={() => {
                void window.copilotBridge.cancelCopilotLogin();
                setLoginOpen(false);
              }}
              type="button"
            >
              {zhCN.common.cancel}
            </Button>
          </div>
        </Modal>
      )}

      {installOpen && (
        <Modal onClose={() => setInstallOpen(false)} title="安装 ChatGPT">
          <ul className="progress-steps">
            <li>{chatGpt.step === "CHECKING" ? "◌" : "✓"} 检查系统环境</li>
            <li>{chatGpt.step === "INSTALLING" ? "◌" : "○"} 安装 ChatGPT</li>
            <li>{chatGpt.step === "VERIFYING" ? "◌" : "○"} 验证安装</li>
          </ul>
          <p>{chatGpt.message}</p>
          <div className="modal-actions">
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

      {setupOpen && (
        <Modal onClose={() => setSetupOpen(false)} title="设置 Copilot 环境">
          <p>
            Copilot 将使用独立的会话和工作区，不会删除或修改你的原账号数据。
          </p>
          <div className="modal-actions">
            <Button className="secondary" onClick={() => setSetupOpen(false)} type="button">
              {zhCN.common.cancel}
            </Button>
            <Button onClick={() => void prepareBridgeProfile()} type="button">
              创建并继续
            </Button>
          </div>
        </Modal>
      )}

      {progressOpen && (
        <Modal title="正在准备 Copilot">
          <ul className="progress-steps">
            <li>✓ 检查 AI 服务</li>
            <li>✓ 启动 Copilot Bridge</li>
            <li>◌ 准备 ChatGPT</li>
          </ul>
          <p>请稍候…</p>
        </Modal>
      )}

      {profile?.restartRequired && !restartDismissed && (
        <Modal onClose={() => setRestartDismissed(true)} title="应用新的环境">
          <p>
            {profile.pendingProfile === "bridge"
              ? "Copilot 环境已经准备完成。"
              : "原账号环境已经准备完成。"}
          </p>
          <p>Windows 需要重新登录一次，才能让 ChatGPT 使用新的环境。</p>
          <div className="modal-actions">
            <Button
              className="secondary"
              onClick={() => setRestartDismissed(true)}
              type="button"
            >
              {zhCN.common.later}
            </Button>
            <Button
              onClick={() => void window.copilotBridge.restartSystem()}
              type="button"
            >
              重新启动 Windows
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
                : zhCN.product.localService}
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
  if (/DEVICE_REVOKED/i.test(error.message)) return zhCN.account.deviceRevokedMessage;
  if (/SUBSCRIPTION_EXPIRED/i.test(error.message)) {
    return zhCN.account.subscriptionExpiredMessage;
  }
  if (/MONTHLY_QUOTA_EXCEEDED|QUOTA_EXCEEDED/i.test(error.message)) {
    return zhCN.account.quotaExceededMessage;
  }
  if (/fetch failed|ECONNREFUSED|SERVER_UNREACHABLE/i.test(error.message)) {
    return zhCN.account.serverUnreachableMessage;
  }
  return fallback;
}

function authStepDone(state: AuthStatus["state"], step: number): boolean {
  const progress: Record<AuthStatus["state"], number> = {
    idle: 0,
    requesting_code: 0,
    waiting_for_user: 1,
    verifying: 2,
    success: 3,
    no_subscription: 3,
    expired: 1,
    network_error: 0,
    cancelled: 0,
  };
  return progress[state] >= step;
}
