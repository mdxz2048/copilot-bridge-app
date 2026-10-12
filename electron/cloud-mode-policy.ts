import type { AppSettings } from "./settings-store.js";

export function requireCloudMode(settings: AppSettings): void {
  if(settings.backendMode!=="REMOTE"||settings.providerConnectionId)throw new Error("Bridge 仅支持 Cloud；请通过开关确认启用 Cloud。");
}
export function requireCloudTarget(target: AppSettings["backendMode"]):void{
  if(target!=="REMOTE")throw new Error("不再支持本地服务选择；关闭开关可恢复 ChatGPT 原账号。");
}

/** Legacy transports remain in the repository, but cannot silently become Cloud. */
export async function migrateCloudMode(settings: AppSettings, dependencies:{
  isBridgeActive():Promise<boolean>;
  restoreOriginal():Promise<unknown>;
  writeSettings(settings:AppSettings):Promise<void>;
}):Promise<AppSettings>{
  if(settings.backendMode==="REMOTE"&&!settings.providerConnectionId)return settings;
  if(await dependencies.isBridgeActive())await dependencies.restoreOriginal();
  const next={...settings,backendMode:"REMOTE" as const,providerConnectionId:null,backendModel:null};
  await dependencies.writeSettings(next);
  return next;
}
