import { useState } from "react";
import type { AppSettings, BridgeStatus, ProfileStatus, CloudServiceStatus } from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { Select } from "./Select";
import { CompactDialog } from "./CompactDialog";
import { Toggle } from "./Toggle";
import { SupportContact } from "./SupportContact";

interface ProductSettingsSheetProps {
  bridge: BridgeStatus | null;
  version?: string;
  profile: ProfileStatus | null;
  cloud?: CloudServiceStatus | null;
  settings: AppSettings;
  onClose: () => void;
  onDiagnostics: () => void;
  onManageChatGpt: () => void;
  onRestartBridge: () => void;
  onAccount: () => void;
  onUpdate: (settings: AppSettings) => void;
}

const paths = {
  basic: <><path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
  account: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  about: <><circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10v.01"/></>,
};

export function ProductSettingsSheet({ bridge, version, profile, cloud, settings, onClose, onDiagnostics, onManageChatGpt, onRestartBridge, onAccount, onUpdate }: ProductSettingsSheetProps) {
  const [tab, setTab] = useState<"basic" | "account" | "about">("basic");
  const copy = zhCN.settings;
  const accountState = cloud?.authState === "ACCOUNT_LOCKED" ? "账号已锁定" : cloud?.authState === "AUTHENTICATED" ? "已登录" : "尚未登录";
  return <CompactDialog title={copy.title} onClose={onClose} className="settings-dialog" footer={<><span className="compact-version">Copilot Bridge · {version ? `v${version}` : "正在读取版本…"}</span><Button className="secondary compact" onClick={onClose}>完成</Button></>}>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置分类">{([["basic", "基础设置"], ["account", "账户"], ["about", "关于"]] as const).map(([id, label]) => <button key={id} type="button" aria-current={tab === id ? "page" : undefined} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none">{paths[id]}</svg>{label}</button>)}</nav>
      <div className="settings-content">
        {tab === "basic" && <>
          <section className="compact-setting-group"><h3>{copy.startupTray}</h3><div className="compact-setting-box">
            <div className="compact-setting-row"><span>{copy.autoLaunch}</span><Toggle checked={settings.autoLaunch} label={copy.autoLaunch} onChange={autoLaunch => onUpdate({ ...settings, autoLaunch })}/></div>
            <div className="compact-setting-row"><span>{copy.minimizeToTray}</span><Toggle checked={settings.minimizeToTray} label={copy.minimizeToTray} onChange={minimizeToTray => onUpdate({ ...settings, minimizeToTray })}/></div>
            <div className="compact-setting-row"><span>{copy.autoStart}</span><Toggle checked={settings.autoBridgeStart} label={copy.autoStart} onChange={autoBridgeStart => onUpdate({ ...settings, autoBridgeStart })}/></div>
          </div></section>
          <section className="compact-setting-group"><h3>{copy.theme}</h3><Select label={copy.theme} value={settings.theme === "dark" ? "dark" : "light"} options={[{ value: "light", label: copy.lightTheme }, { value: "dark", label: copy.darkTheme }]} onChange={theme => onUpdate({ ...settings, theme })}/></section>
          <section className="compact-setting-group"><h3>ChatGPT 环境</h3><div className="compact-setting-row"><small>{!profile ? "检测中" : profile.activeProfile === "bridge" ? "Copilot Bridge Cloud" : "ChatGPT 原账号"}</small><button type="button" className="text-action" onClick={onManageChatGpt}>管理 ChatGPT ›</button></div></section>
        </>}
        {tab === "account" && <>
          <section className="compact-setting-group"><h3>Cloud 账户</h3><p className="settings-account-email">{cloud?.account ?? "登录后查看余额、套餐与设备。"}</p><div className="compact-setting-row"><small>{accountState}</small><button type="button" className="text-action" onClick={onAccount}>{cloud?.account ? "我的账户 ›" : "登录 Cloud ›"}</button></div></section>
          <p className="settings-caption">账户、设备与邀请入口均在账户页。可用模型与余额以服务端实时数据为准。</p>
        </>}
        {tab === "about" && <>
          <section className="compact-setting-group"><h3>Copilot Bridge</h3><p className="settings-caption">{version ? `版本 v${version}` : "正在读取版本…"}<br/>连接官方客户端与 Cloud 模型。</p></section>
          <section className="compact-setting-group"><h3>高级</h3><div className="compact-setting-box"><div className="compact-setting-row"><span>Bridge <small>· {bridge?.state === "ready" ? "已运行" : bridge?.state === "starting" ? "启动中" : bridge?.state === "failed" ? "需要关注" : "未运行"}</small></span><button type="button" className="text-action" onClick={onRestartBridge}>{bridge?.state === "ready" ? "重新启动" : "尝试启动"}</button></div><div className="compact-setting-row"><span>诊断信息</span><button type="button" className="text-action" onClick={onDiagnostics}>查看诊断 ›</button></div></div></section>
          <p className="settings-caption">使用右上角升级按钮查看软件更新与平台更新说明。</p><SupportContact/>
        </>}
      </div>
    </div>
  </CompactDialog>;
}
