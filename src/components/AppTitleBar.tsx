import { zhCN } from "../locales/zh-CN";

export function AppTitleBar({ onSettings }: { onSettings(): void }) {
  return (
    <header className="title-bar">
      <span className="app-mark" aria-hidden="true" />
      <strong>{zhCN.appName}</strong>
      <button aria-label="设置" className="settings-button" onClick={onSettings} type="button">⚙</button>
    </header>
  );
}
