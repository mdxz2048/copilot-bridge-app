import { zhCN } from "../locales/zh-CN";

export function AppTitleBar() {
  return (
    <header className="title-bar">
      <span className="app-mark" aria-hidden="true" />
      <strong>{zhCN.appName}</strong>
      <button aria-label="设置" className="settings-button" type="button">⚙</button>
    </header>
  );
}
