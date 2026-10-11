/** Do not close the user's official client until its selected Bridge endpoint is ready. */
export async function prepareOfficialClientConnection(deps: {
  getProfile():Promise<{activeProfile:"bridge"|"original"}>;
  startBridge():Promise<{state:string;message:string}>;
}):Promise<void> {
  if((await deps.getProfile()).activeProfile!=="bridge")return;
  const bridge=await deps.startBridge();
  if(bridge.state!=="ready")throw new Error(`Bridge 尚未就绪，请稍后重试重启 ChatGPT：${bridge.message}`);
}

export async function restartOfficialClientForProfile<T>(deps: {
  prepare():Promise<void>;
  restart():Promise<void>;
  acknowledge():Promise<T>;
}):Promise<T> {
  await deps.prepare();
  await deps.restart();
  return deps.acknowledge();
}
