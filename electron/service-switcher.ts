import type {
  BridgeModel,
  BridgeStatus,
} from "./bridge-manager.js";
import type { CloudServiceStatus } from "./cloud/cloud-foundation.js";
import type { AppSettings } from "./settings-store.js";

export interface ServiceSwitchDependencies {
  readSettings(): Promise<AppSettings>;
  writeSettings(settings: AppSettings): Promise<void>;
  refreshCloud(): Promise<CloudServiceStatus>;
  restartBridge(settings: AppSettings): Promise<BridgeStatus>;
  listModels(): Promise<BridgeModel[]>;
}

export interface ServiceSwitchResult {
  settings: AppSettings;
  bridge: BridgeStatus;
  models: BridgeModel[];
}

export async function performServiceSwitch(
  target: AppSettings["backendMode"],
  dependencies: ServiceSwitchDependencies,
): Promise<ServiceSwitchResult> {
  const previous = await dependencies.readSettings();
  if (target === "REMOTE") {
    const cloud = await dependencies.refreshCloud();
    if (cloud.authState !== "AUTHENTICATED") {
      throw new Error("请先登录 Copilot Bridge 云服务。");
    }
  }

  const candidate: AppSettings = {
    ...previous,
    backendMode: target,
    backendModel: null,
    providerConnectionId: null,
  };

  try {
    let bridge = await dependencies.restartBridge(candidate);
    if (bridge.state !== "ready") throw new Error(bridge.message);
    const models = await dependencies.listModels();
    if (models.length === 0) {
      throw new Error("当前 AI 服务没有可用模型。");
    }
    const selectedModel = models.some(
        (model) => model.id === previous.backendModel,
      )
      ? previous.backendModel
      : models[0]!.id;
    const next = { ...candidate, backendModel: selectedModel };

    if (target === "LOCAL" && selectedModel !== candidate.backendModel) {
      bridge = await dependencies.restartBridge(next);
      if (bridge.state !== "ready") throw new Error(bridge.message);
    }

    await dependencies.writeSettings(next);
    return { settings: next, bridge, models };
  } catch (error) {
    const rollback = await dependencies.restartBridge(previous);
    if (rollback.state !== "ready") {
      throw new Error(
        `AI 服务切换失败，且原服务未能恢复：${rollback.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}
