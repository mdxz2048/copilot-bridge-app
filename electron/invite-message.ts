export function inviteMessage(baseUrl: string, code: string) {
  const base=new URL(baseUrl);
  if(base.protocol!=="https:"||base.username||base.password||!code)throw new Error("暂时无法生成邀请链接，请登录后重试。");
  const downloadUrl=new URL("/api/v1/releases/download",base).toString();
  const referral=new URL("/register",base);referral.searchParams.set("ref",code);
  const referralUrl=referral.toString();
  return {downloadUrl,referralUrl,message:`我在用 Copilot Bridge，在原生 ChatGPT 客户端里就能聊天、写代码和处理本地任务。无需配置网络代理，还可以自由选择国产模型或 GPT 模型。\n\n下载 Bridge：${downloadUrl}\n通过我的邀请注册：${referralUrl}`};
}
