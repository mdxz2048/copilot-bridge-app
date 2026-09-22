import { useEffect, useState } from "react";
import type { AppSettings, AuthStatus, BridgeModel, BridgeStatus, ProfileId, ProfileStatus, ReasoningEffort } from "./bridge-api";
import { AppTitleBar } from "./components/AppTitleBar";
import { Button } from "./components/Button";
import { Modal } from "./components/Modal";
import { Select, SelectRow } from "./components/Select";
import { zhCN as t } from "./locales/zh-CN";

export function App() {
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [models, setModels] = useState<BridgeModel[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ backendModel: null, reasoningEffort: null });
  const [loginOpen, setLoginOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    state: "idle",
    message: "Connect your GitHub Copilot account to use the Bridge.",
  });

  const refresh = async () => {
    setError(null);
    try {
      const [profile, bridge, savedSettings] = await Promise.all([
        window.copilotBridge.getProfileStatus(),
        window.copilotBridge.getBridgeStatus(),
        window.copilotBridge.getSettings(),
      ]);
      setStatus(profile);
      setBridgeStatus(bridge);
      setSettings(savedSettings);
      if (bridge.state === "ready") {
        setModels(await window.copilotBridge.getModels());
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to read profile status.");
    }
  };

  useEffect(() => {
    void refresh();
    const removeAuth = window.copilotBridge.onCopilotLoginStatus((next) => {
      setAuthStatus(next);
      if (next.state === "completed") {
        setLoginOpen(false);
        void refresh();
      }
    });
    const removeBridge = window.copilotBridge.onBridgeStatus((next) => {
      setBridgeStatus(next);
      if (next.state === "ready") void refresh();
    });
    const removeProfile = window.copilotBridge.onProfileStatus(setStatus);
    return () => { removeAuth(); removeBridge(); removeProfile(); };
  }, []);

  const startLogin = async () => {
    setError(null);
    try {
      await window.copilotBridge.startCopilotLogin();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start GitHub Copilot sign-in.");
    }
  };

  const updateSettings = async (next: AppSettings) => {
    setBusy(true);
    try {
      const persisted = await window.copilotBridge.updateSettings(next);
      setSettings(persisted);
      setBridgeStatus(await window.copilotBridge.getBridgeStatus());
      setModels(await window.copilotBridge.getModels());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法更新 Copilot 设置。");
    } finally {
      setBusy(false);
    }
  };

  const switchProfile = async (target: ProfileId) => {
    setBusy(true);
    setProgressOpen(true);
    try {
      const next = await window.copilotBridge.activateProfile(target);
      setStatus(next);
      setProgressOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "环境切换失败。");
      setProgressOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const modelOptions = models.map((model) => ({ value: model.id, label: displayModel(model.id) }));
  const selectedModel = settings.backendModel ?? models[0]?.id ?? "";
  const selected = models.find((model) => model.id === selectedModel);
  const reasoningOptions = [
    { value: "low", label: "低" },
    { value: "medium", label: "中" },
    { value: "high", label: "高" },
    { value: "xhigh", label: "极高" },
  ] as const;

  return (
    <main>
      <AppTitleBar />

      {error && <p className="error" role="alert">{error}</p>}

      <section aria-labelledby="copilot-heading">
        <h2 id="copilot-heading">{t.copilot}</h2>
        <div className="card connection" aria-live="polite">
        <div>
          <p className="state"><span>{bridgeStatus?.state === "ready" ? "●" : "○"}</span> {bridgeStatus?.state === "ready" ? "已连接" : t.disconnected}</p>
          <p>{bridgeStatus?.state === "ready" ? "GitHub Copilot 已准备就绪。" : t.connectHint}</p>
        </div>
        {bridgeStatus?.state === "ready" ? null : (
          <Button onClick={() => { setLoginOpen(true); void startLogin(); }} type="button">{t.connect}</Button>
        )}
        </div>
        {bridgeStatus?.state === "ready" && selectedModel && <div className="card controls">
          <SelectRow label="模型">
            <Select label="模型" onChange={(backendModel) => void updateSettings({ ...settings, backendModel })} options={modelOptions} value={selectedModel} />
          </SelectRow>
          {selected?.supportsReasoningEffort && <SelectRow label="推理强度">
            <Select label="推理强度" onChange={(reasoningEffort) => void updateSettings({ ...settings, reasoningEffort: reasoningEffort as ReasoningEffort })} options={reasoningOptions} value={settings.reasoningEffort ?? "high"} />
          </SelectRow>}
        </div>}
      </section>

      <section aria-labelledby="chatgpt-heading">
        <h2 id="chatgpt-heading">{t.chatgpt}</h2>
        <div className="card environment">
          <p className="state"><span>●</span> {status?.activeProfile === "bridge" ? t.bridge : t.original}</p>
          <p>{status?.activeProfile === "bridge" ? t.bridgeHint : t.originalHint}</p>
          <Button className="primary-action" disabled={busy} onClick={() => {
            if (status?.activeProfile === "bridge") {
              void switchProfile("original");
            } else {
              setSetupOpen(true);
            }
          }} type="button">
            {status?.activeProfile === "bridge" ? t.restoreOriginal : t.switchToBridge}
          </Button>
        </div>
      </section>

      <footer className="status-bar"><span>{bridgeStatus?.state === "ready" ? "●" : "○"}</span> {bridgeStatus?.message ?? t.ready}<button onClick={() => void window.copilotBridge.restartBridge()} type="button">{bridgeStatus?.state === "failed" ? "重新启动 Bridge" : t.details}</button></footer>
      {loginOpen && <Modal title="连接 GitHub Copilot">
        <p>{authStatus.message}</p>
        {authStatus.deviceCode && <code>{authStatus.deviceCode}</code>}
        <div className="modal-actions">
          <Button className="secondary" onClick={() => { void window.copilotBridge.cancelCopilotLogin(); setLoginOpen(false); }} type="button">取消</Button>
        </div>
      </Modal>}
      {setupOpen && <Modal title="设置 Copilot 环境">
        <p>Copilot 将使用独立的会话和工作区，不会删除或修改你的原账号数据。</p>
        <div className="modal-actions">
          <Button className="secondary" onClick={() => setSetupOpen(false)} type="button">取消</Button>
          <Button onClick={() => {
            setSetupOpen(false);
            void window.copilotBridge.prepareBridgeEnvironment().then(() => switchProfile("bridge")).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "无法准备 Copilot 环境。"));
          }} type="button">创建并继续</Button>
        </div>
      </Modal>}
      {progressOpen && <Modal title={status?.pendingProfile === "bridge" ? "正在准备 Copilot" : "正在恢复原账号"}>
        <ul className="progress-steps">
          <li>✓ 检查 GitHub Copilot</li>
          <li>✓ 启动 Copilot Bridge</li>
          <li>◌ 准备 ChatGPT</li>
        </ul>
        <p>请稍候…</p>
      </Modal>}
      {status?.restartRequired && <Modal title="应用新的环境">
        <p>{status.pendingProfile === "bridge" ? "Copilot 环境已经准备完成。" : "原账号环境已经准备完成。"}</p>
        <p>Windows 需要重新启动一次，才能让 ChatGPT 使用新的环境。</p>
        <div className="modal-actions">
          <Button className="secondary" onClick={() => setProgressOpen(false)} type="button">稍后</Button>
          <Button onClick={() => void window.copilotBridge.restartSystem()} type="button">重新启动 Windows</Button>
        </div>
      </Modal>}
    </main>
  );
}

function displayModel(id: string): string {
  return id.replace(/^gpt-/, "GPT-").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
