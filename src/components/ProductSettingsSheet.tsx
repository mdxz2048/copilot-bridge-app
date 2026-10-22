import type {
  AppSettings,
  BridgeStatus,
  ProfileStatus,
} from "../bridge-api";
import { zhCN } from "../locales/zh-CN";
import { Button } from "./Button";
import { Select } from "./Select";
import { CompactDialog } from "./CompactDialog";
import { Toggle } from "./Toggle";
import {SupportContact} from './SupportContact';

interface ProductSettingsSheetProps {
  bridge: BridgeStatus | null;
  version?:string;
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
  version,
  profile,
  settings,
  onClose,
  onDiagnostics,
  onManageChatGpt,
  onRestartBridge,
  onUpdate,
}: ProductSettingsSheetProps) {
  const copy = zhCN.settings;
  return <CompactDialog title={copy.title} onClose={onClose} className="settings-dialog" footer={<><span className="compact-version">Copilot Bridge · {version?`v${version}`:"正在读取版本…"}</span><Button className="secondary compact" onClick={onClose}>完成</Button></>}>
    <div className="compact-setting-box"><div className="compact-setting-row"><span>ChatGPT 环境</span><div><small>{!profile?"检测中":profile.activeProfile==="bridge"?"Cloud":"原账号"}</small><button type="button" className="text-action" onClick={onManageChatGpt}>管理 ChatGPT ›</button></div></div></div>
    <section className="compact-setting-group"><h3>{copy.startupTray}</h3><div className="compact-setting-box">
      <div className="compact-setting-row"><span>{copy.autoLaunch}</span><Toggle checked={settings.autoLaunch} label={copy.autoLaunch} onChange={autoLaunch=>onUpdate({...settings,autoLaunch})}/></div>
      <div className="compact-setting-row"><span>{copy.minimizeToTray}</span><Toggle checked={settings.minimizeToTray} label={copy.minimizeToTray} onChange={minimizeToTray=>onUpdate({...settings,minimizeToTray})}/></div>
      <div className="compact-setting-row"><span>{copy.autoStart}</span><Toggle checked={settings.autoBridgeStart} label={copy.autoStart} onChange={autoBridgeStart=>onUpdate({...settings,autoBridgeStart})}/></div>
    </div></section>
    <div className="compact-setting-box"><div className="compact-setting-row"><span>{copy.theme}</span><Select label={copy.theme} value={settings.theme} options={[{value:"system",label:copy.systemTheme},{value:"light",label:copy.lightTheme},{value:"dark",label:copy.darkTheme}]} onChange={theme=>onUpdate({...settings,theme})}/></div></div>
    <section className="compact-setting-group"><h3>高级</h3><div className="compact-setting-box"><div className="compact-setting-row"><span>Bridge <small>· {bridge?.state==="ready"?"已运行":bridge?.state==="starting"?"启动中":bridge?.state==="failed"?"需要关注":"未运行"}</small></span><div><button type="button" className="text-action" onClick={onRestartBridge}>{bridge?.state==="ready"?"重新启动":"尝试启动"}</button><button type="button" className="text-action" onClick={()=>{onClose();onDiagnostics();}}>诊断 ›</button></div></div></div></section>
    <SupportContact/>
  </CompactDialog>;
}
