import type {
  AppSettings,
  BridgeStatus,
  ProfileStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { Select, SelectRow } from "./Select";
import { Sheet } from "./Sheet";
import { Toggle } from "./Toggle";

interface ProductSettingsSheetProps {
  bridge: BridgeStatus | null;
  profile: ProfileStatus | null;
  settings: AppSettings;
  onClose: () => void;
  onDiagnostics: () => void;
  onManageChatGpt: () => void;
  onRestartBridge: () => void;
  onUpdate: (settings: AppSettings) => void;
}

export function ProductSettingsSheet({
  bridge,
  profile,
  settings,
  onClose,
  onDiagnostics,
  onManageChatGpt,
  onRestartBridge,
  onUpdate,
}: ProductSettingsSheetProps) {
  const copy = zhCN.settings;
  return (
    <Sheet onClose={onClose} title={copy.title}>
      <div className="sheet-header">
        <span>{copy.title}</span>
        <Button className="secondary" onClick={onClose} type="button">
          {copy.close}
        </Button>
      </div>

      <h3>{copy.chatGpt}</h3>
      <div className="settings-row">
        <span>{copy.environment}</span>
        <strong>
          {profile?.activeProfile === "bridge" ? copy.bridge : copy.original}
        </strong>
      </div>
      <div className="settings-row">
        <span>管理 ChatGPT</span>
        <Button className="secondary compact" onClick={onManageChatGpt} type="button">
          打开
        </Button>
      </div>

      <h3>{copy.startupTray}</h3>
      <div className="settings-row">
        <span>{copy.autoLaunch}</span>
        <Toggle
          checked={settings.autoLaunch}
          label={copy.autoLaunch}
          onChange={(autoLaunch) => onUpdate({ ...settings, autoLaunch })}
        />
      </div>
      <div className="settings-row">
        <span>{copy.minimizeToTray}</span>
        <Toggle
          checked={settings.minimizeToTray}
          label={copy.minimizeToTray}
          onChange={(minimizeToTray) =>
            onUpdate({ ...settings, minimizeToTray })}
        />
      </div>
      <div className="settings-row">
        <span>{copy.autoStart}</span>
        <Toggle
          checked={settings.autoBridgeStart}
          label={copy.autoStart}
          onChange={(autoBridgeStart) =>
            onUpdate({ ...settings, autoBridgeStart })}
        />
      </div>

      <h3>外观</h3>
      <SelectRow label={copy.theme}>
        <Select
          label={copy.theme}
          onChange={(theme) => onUpdate({ ...settings, theme })}
          options={[
            { value: "system", label: copy.systemTheme },
            { value: "light", label: copy.lightTheme },
            { value: "dark", label: copy.darkTheme },
          ]}
          value={settings.theme}
        />
      </SelectRow>

      <h3>高级</h3>
      <div className="settings-row">
        <span>Bridge 状态</span>
        <Button className="secondary compact" onClick={onRestartBridge} type="button">
          {bridge?.state === "ready" ? "重新启动" : "尝试启动"}
        </Button>
      </div>
      <div className="settings-row">
        <span>{copy.diagnostics}</span>
        <Button className="secondary compact" onClick={onDiagnostics} type="button">
          查看
        </Button>
      </div>

      <h3>关于</h3>
      <div className="settings-row">
        <span>Copilot Bridge</span>
        <strong>v0.1.0</strong>
      </div>
    </Sheet>
  );
}
