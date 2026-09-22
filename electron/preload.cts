import type { ProfileId, ProfileStatus } from "./profile-store.js";
import type { AuthStatus } from "./copilot-auth.js";
import type { BridgeModel, BridgeStatus } from "./bridge-manager.js";
import type { AppSettings } from "./settings-store.js";

const { contextBridge, ipcRenderer } = require("electron") as typeof import("electron");

contextBridge.exposeInMainWorld("copilotBridge", {
  getProfileStatus: (): Promise<ProfileStatus> => ipcRenderer.invoke("profile:status"),
  activateProfile: (target: ProfileId): Promise<ProfileStatus> =>
    ipcRenderer.invoke("profile:activate", target),
  acknowledgeRestart: (): Promise<ProfileStatus> =>
    ipcRenderer.invoke("profile:acknowledge-restart"),
  prepareBridgeEnvironment: (): Promise<void> => ipcRenderer.invoke("profile:prepare-bridge"),
  restartSystem: (): Promise<void> => ipcRenderer.invoke("system:restart"),
  startCopilotLogin: (): Promise<void> => ipcRenderer.invoke("oauth:start"),
  cancelCopilotLogin: (): Promise<void> => ipcRenderer.invoke("oauth:cancel"),
  onCopilotLoginStatus: (handler: (status: AuthStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AuthStatus) => handler(status);
    ipcRenderer.on("oauth:status", listener);
    return () => ipcRenderer.removeListener("oauth:status", listener);
  },
  getBridgeStatus: (): Promise<BridgeStatus> => ipcRenderer.invoke("bridge:status"),
  startBridge: (): Promise<BridgeStatus> => ipcRenderer.invoke("bridge:start"),
  restartBridge: (): Promise<BridgeStatus> => ipcRenderer.invoke("bridge:restart"),
  getModels: (): Promise<BridgeModel[]> => ipcRenderer.invoke("bridge:models"),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: AppSettings): Promise<AppSettings> =>
    ipcRenderer.invoke("settings:update", settings),
  onBridgeStatus: (handler: (status: BridgeStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: BridgeStatus) => handler(status);
    ipcRenderer.on("bridge:status", listener);
    return () => ipcRenderer.removeListener("bridge:status", listener);
  },
  onProfileStatus: (handler: (status: ProfileStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: ProfileStatus) => handler(status);
    ipcRenderer.on("profile:status", listener);
    return () => ipcRenderer.removeListener("profile:status", listener);
  },
});
