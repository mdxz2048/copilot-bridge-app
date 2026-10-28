import { zhCN } from "../locales/zh-CN";
import { UpdateControl } from "./UpdateControl";

export function AppTitleBar({ onSettings, version }: { onSettings(): void; version?: string }) {
  return (
    <header className="title-bar">
      <span className="app-mark" aria-hidden="true" />
      <strong>{zhCN.appName}</strong>
      <div className="title-bar-tools">
        <UpdateControl currentVersion={version}/>
        <button aria-label="设置" title="设置" className="title-tool-button settings-button" onClick={onSettings} type="button">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m9.5 3-.6 2.3-2 .9-2.2-.6-2.5 4.3 1.6 1.7v2.4l-1.6 1.7 2.5 4.3 2.2-.6 2 .9.6 2.3h5l.6-2.3 2-.9 2.2.6 2.5-4.3-1.6-1.7v-2.4l1.6-1.7-2.5-4.3-2.2.6-2-.9L14.5 3z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </header>
  );
}
