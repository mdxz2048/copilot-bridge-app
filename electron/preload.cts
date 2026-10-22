import type { ProfileId, ProfileStatus } from "./profile-store.js";
import type { AuthStatus } from "./copilot-auth.js";
import type { BridgeModel, BridgeStatus } from "./bridge-manager.js";
import type { AppSettings } from "./settings-store.js";
import type { ChatGptStatus } from "./chatgpt-manager.js";
import type { CloudServiceStatus } from "./cloud/cloud-foundation.js";
import type { UsageSettlementV2 } from "./cloud/contract.js";

interface Diagnostics {
  appVersion: string;
  bridge: BridgeStatus;
  chatGpt: ChatGptStatus;
  profile: ProfileStatus;
  settings: AppSettings;
}

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

// Keep the renderer responsive even if an OS/IPC operation fails to settle.
const operationBudgets: Record<string, [string, number]> = {
  'cloud:login':['登录',60000], 'cloud:refresh':['刷新账号',60000],
  'service:switch':['切换云服务',90000], 'bridge:start':['启动本地连接',60000], 'bridge:restart':['重启本地连接',60000],
  'chatgpt:launch':['打开 ChatGPT',75000], 'chatgpt:restart':['重启 ChatGPT',90000],
  'chatgpt:status':['检测 ChatGPT',20000], 'chatgpt:install':['启动安装',25000],
  'chatgpt:download':['安装官方客户端',20*60000], 'update:check':['检查与下载更新',16*60000],
  'update:install':['启动更新安装程序',30000], 'bridge:models':['获取模型列表',25000],
};
const operationLabels:Record<string,string>={'reward:list':'读取奖励通知','reward:ack':'确认奖励到账','purchase:create':'生成提交二维码','purchase:list':'读取订单记录','purchase:status':'查询提交状态','cloud:status':'读取账号状态','cloud:logout':'退出登录','settings:update':'保存设置','cloud:device-revoke':'移除设备','cloud:device-rename':'重命名设备','cloud:referral-apply':'应用邀请码','profile:activate':'切换连接配置','cloud:manage-account':'打开账户网页','cloud:manage-subscription':'打开充值网页','cloud:open-registration':'打开注册网页','cloud:open-release':'打开下载网页','invite:message':'获取邀请信息'};
const readOnly = new Set(['reward:list','purchase:list','purchase:status','app:version','app:startup-warning','profile:status','bridge:status','bridge:models','cloud:status','settings:get','chatgpt:status','diagnostics:get','update:status','cloud:usage-settlement','invite:message']);
const activeWrites = new Set<string>();
function invoke(channel:string,...args:unknown[]):Promise<any> {
  const [label,budget]=operationBudgets[channel]??[operationLabels[channel]??'读取应用状态',30000];
  const write=!readOnly.has(channel);
  if(write&&activeWrites.has(channel))return Promise.reject(new Error(`${label}仍在处理中，请稍后刷新状态确认结果。`));
  if(write)activeWrites.add(channel);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(`${label}等待超时，网络或系统响应可能不稳定。${write?'操作结果可能已生效，请刷新状态确认后再试。':'请检查网络后重试。'}`)),budget);
    Promise.resolve().then(()=>ipcRenderer.invoke(channel,...args)).then(resolve,reject).finally(()=>{clearTimeout(timer);if(write)activeWrites.delete(channel);});
  });
}

contextBridge.exposeInMainWorld("copilotBridge", {
  composeSupportMail:(issue?:{message:string;occurredAt:string;code?:string}):Promise<void>=>invoke('support:compose',issue),
  getRewardNotices:()=>invoke('reward:list'),
  acknowledgeReward:(id:string)=>invoke('reward:ack',id),
  createPurchaseTicket:()=>invoke('purchase:create'),
  listPurchaseClaims:(page:number,status:string)=>invoke('purchase:list',page,status),
  getPurchaseTicketStatus:(id:string)=>invoke('purchase:status',id),
  getStartupWarning: (): Promise<string|null> => invoke('app:startup-warning'),
  getAppVersion: (): Promise<string> => invoke("app:version"),
  getProfileStatus: (): Promise<ProfileStatus> => invoke("profile:status"),
  activateProfile: (target: ProfileId): Promise<ProfileStatus> =>
    invoke("profile:activate", target),
  acknowledgeRestart: (): Promise<ProfileStatus> =>
    invoke("profile:acknowledge-restart"),
  prepareBridgeEnvironment: (): Promise<void> => invoke("profile:prepare-bridge"),
  restartSystem: (): Promise<void> => invoke("system:restart"),
  startCopilotLogin: (): Promise<void> => invoke("oauth:start"),
  cancelCopilotLogin: (): Promise<void> => invoke("oauth:cancel"),
  openCopilotVerification: (url: string): Promise<void> =>
    invoke("oauth:open-verification", url),
  onCopilotLoginStatus: (handler: (status: AuthStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AuthStatus) => handler(status);
    ipcRenderer.on("oauth:status", listener);
    return () => ipcRenderer.removeListener("oauth:status", listener);
  },
  getBridgeStatus: (): Promise<BridgeStatus> => invoke("bridge:status"),
  startBridge: (): Promise<BridgeStatus> => invoke("bridge:start"),
  restartBridge: (): Promise<BridgeStatus> => invoke("bridge:restart"),
  getModels: (): Promise<BridgeModel[]> => invoke("bridge:models"),
  switchAiService: (
    target: AppSettings["backendMode"],
  ): Promise<{
    settings: AppSettings;
    bridge: BridgeStatus;
    models: BridgeModel[];
  }> => invoke("service:switch", target),
  getCloudStatus: (): Promise<CloudServiceStatus> =>
    invoke("cloud:status"),
  openCloudRegistration: (): Promise<void> =>
    invoke("cloud:open-registration"),
  loginCloud: (
    credentials: { email: string; password: string; replaceDeviceId?: string; remember?: boolean },
  ): Promise<CloudServiceStatus> =>
    invoke("cloud:login", credentials),
  listSavedLogins: (): Promise<Array<{ email: string; lastUsedAt: number }>> => invoke('cloud:saved-logins'),
  getSavedLogin: (email: string): Promise<{ email: string; password: string } | null> => invoke('cloud:saved-login', email),
  forgetSavedLogin: (email: string): Promise<void> => invoke('cloud:forget-login', email),
  onCredentialWarning: (handler: (message: string) => void): (() => void) => {
    const listener = (_event: unknown, message: string) => handler(message);
    ipcRenderer.on('cloud:credential-warning', listener);
    return () => ipcRenderer.removeListener('cloud:credential-warning', listener);
  },
  logoutCloud: (): Promise<CloudServiceStatus> =>
    invoke("cloud:logout"),
  refreshCloud: (): Promise<CloudServiceStatus> =>
    invoke("cloud:refresh"),
  manageCloudAccount: (): Promise<void> =>
    invoke("cloud:manage-account"),
  manageCloudSubscription: (): Promise<void> =>
    invoke("cloud:manage-subscription"),
  openCloudRelease: (): Promise<void> =>
    invoke("cloud:open-release"),
  getInviteMessage: () => invoke('invite:message'),
  getUpdateStatus: () => invoke('update:status'),
  checkForUpdates: (): Promise<void> => invoke('update:check'),
  installUpdate: (): Promise<void> => invoke('update:install'),
  onUpdateStatus: (handler: (status: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown) => handler(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  revokeCloudDevice: (id: string): Promise<CloudServiceStatus> =>
    invoke("cloud:device-revoke", id),
  renameCloudDevice: (
    request: { id: string; deviceName: string },
  ): Promise<CloudServiceStatus> =>
    invoke("cloud:device-rename", request),
  applyReferral: (code: string): Promise<CloudServiceStatus> =>
    invoke("cloud:referral-apply", code),
  getCloudUsageSettlement: (
    responseId: string,
  ): Promise<UsageSettlementV2> =>
    invoke("cloud:usage-settlement", responseId),
  connectCloudProvider: (
    request: { providerId: string; label: string; apiKey: string },
  ) => invoke("cloud:provider-connect", request),
  disconnectCloudProvider: (id: string): Promise<CloudServiceStatus> =>
    invoke("cloud:provider-disconnect", id),
  activateCloudProvider: (id: string) =>
    invoke("cloud:provider-activate", id),
  onCloudStatus: (
    handler: (status: CloudServiceStatus) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: CloudServiceStatus,
    ) => handler(status);
    ipcRenderer.on("cloud:status", listener);
    return () => ipcRenderer.removeListener("cloud:status", listener);
  },
  getSettings: (): Promise<AppSettings> => invoke("settings:get"),
  updateSettings: (settings: AppSettings): Promise<AppSettings> =>
    invoke("settings:update", settings),
  onBridgeStatus: (handler: (status: BridgeStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: BridgeStatus) => handler(status);
    ipcRenderer.on("bridge:status", listener);
    return () => ipcRenderer.removeListener("bridge:status", listener);
  },
  onModels: (handler: (models: BridgeModel[]) => void): (() => void) => {
    const listener=(_event:Electron.IpcRendererEvent,models:BridgeModel[])=>handler(models);
    ipcRenderer.on("bridge:models",listener);
    return ()=>ipcRenderer.removeListener("bridge:models",listener);
  },
  onProfileStatus: (handler: (status: ProfileStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ProfileStatus) => handler(status);
    ipcRenderer.on("profile:status", listener);
    return () => ipcRenderer.removeListener("profile:status", listener);
  },
  getChatGptStatus: (): Promise<ChatGptStatus> => invoke("chatgpt:status"),
  installChatGpt: (): Promise<void> => invoke("chatgpt:install"),
  openChatGptDownload: (): Promise<void> => invoke("chatgpt:download"),
  cancelChatGptInstall: (): Promise<void> => invoke("chatgpt:install-cancel"),
  launchChatGpt: (): Promise<void> => invoke("chatgpt:launch"),
  restartChatGpt: (): Promise<ProfileStatus> => invoke("chatgpt:restart"),
  getDiagnostics: (): Promise<Diagnostics> => invoke("diagnostics:get"),
  onChatGptStatus: (handler: (status: ChatGptStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ChatGptStatus) => handler(status);
    ipcRenderer.on("chatgpt:status", listener);
    return () => ipcRenderer.removeListener("chatgpt:status", listener);
  },
});
