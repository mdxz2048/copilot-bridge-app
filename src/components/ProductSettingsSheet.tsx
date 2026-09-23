import type {
  AppSettings,
  BridgeModel,
  BridgeStatus,
  CloudServiceStatus,
  ProfileStatus,
  ReasoningEffort,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { displayModel } from "../model-display";
import { Button } from "./Button";
import { Select, SelectRow } from "./Select";
import { Sheet } from "./Sheet";
import { Toggle } from "./Toggle";

interface ProductSettingsSheetProps {
  bridge: BridgeStatus | null;
  cloud: CloudServiceStatus | null;
  models: BridgeModel[];
  profile: ProfileStatus | null;
  settings: AppSettings;
  onClose: () => void;
  onDiagnostics: () => void;
  onOpenAccount: () => void;
  onOpenServices: () => void;
  onRestartBridge: () => void;
  onUpdate: (settings: AppSettings) => void;
}

export function ProductSettingsSheet({
  bridge,
  cloud,
  models,
  profile,
  settings,
  onClose,
  onDiagnostics,
  onOpenAccount,
  onOpenServices,
  onRestartBridge,
  onUpdate,
}: ProductSettingsSheetProps) {
  const copy = zhCN.settings;
  const selectedModel = settings.backendModel ?? models[0]?.id ?? "";
  const selected = models.find((model) => model.id === selectedModel);
  const modelOptions = models.map((model) => ({
    value: model.id,
    label: displayModel(model.id),
  }));
  const reasoningOptions = [
    { value: "low", label: zhCN.common.low },
    { value: "medium", label: zhCN.common.medium },
    { value: "high", label: zhCN.common.high },
    { value: "xhigh", label: zhCN.common.xhigh },
  ] as const;

  return (
    <Sheet onClose={onClose} title={copy.title}>
      <div className="sheet-header">
        <span>{copy.title}</span>
        <Button className="secondary" onClick={onClose} type="button">
          {copy.close}
        </Button>
      </div>

      <h3>{copy.aiService}</h3>
      <div className="settings-row">
        <span>
          {settings.backendMode === "REMOTE"
            ? zhCN.product.cloudService
            : zhCN.product.localService}
        </span>
        <Button className="secondary compact" onClick={onOpenServices} type="button">
          {copy.changeService}
        </Button>
      </div>

      <h3>{copy.accountService}</h3>
      <div className="settings-row">
        <span>
          {cloud?.authState === "AUTHENTICATED"
            ? `${cloud.account ?? ""} · ${cloud.plan ?? ""}`
            : zhCN.account.signedOut}
        </span>
        <Button className="secondary compact" onClick={onOpenAccount} type="button">
          {copy.viewAccount}
        </Button>
      </div>

      <h3>{copy.modelReasoning}</h3>
      {selectedModel && (
        <SelectRow label={copy.model}>
          <Select
            label={copy.model}
            onChange={(backendModel) => onUpdate({ ...settings, backendModel })}
            options={modelOptions}
            value={selectedModel}
          />
        </SelectRow>
      )}
      {selected?.supportsReasoningEffort && (
        <SelectRow label={copy.reasoning}>
          <Select
            label={copy.reasoning}
            onChange={(reasoningEffort) =>
              onUpdate({
                ...settings,
                reasoningEffort: reasoningEffort as ReasoningEffort,
              })}
            options={reasoningOptions}
            value={settings.reasoningEffort ?? "high"}
          />
        </SelectRow>
      )}

      <h3>{copy.chatGpt}</h3>
      <div className="settings-row">
        <span>{copy.environment}</span>
        <strong>
          {profile?.activeProfile === "bridge" ? copy.bridge : copy.original}
        </strong>
      </div>

      <h3>{copy.startupTray}</h3>
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

      <h3>{copy.diagnostics}</h3>
      <div className="settings-row">
        <span>
          {bridge?.state === "ready"
            ? `● ${zhCN.product.serviceNormal}`
            : `○ ${zhCN.product.needsAttention}`}
        </span>
        <div className="inline-actions">
          <Button className="secondary compact" onClick={onRestartBridge} type="button">
            {zhCN.product.restartBridge}
          </Button>
          <Button className="secondary compact" onClick={onDiagnostics} type="button">
            {copy.openDiagnostics}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
