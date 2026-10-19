import { ZodError } from "zod";
import { CloudError } from "./cloud-error.js";
import { sanitizeFailure } from "./failure-feedback.js";

const messages:Record<string,string>={
  INSUFFICIENT_POINTS:"余额不足，请打开 Copilot Bridge，点击「充值」，到账后重试。",
  AUTH_REQUIRED:"尚未登录，请先在 Copilot Bridge 登录。",UNAUTHORIZED:"登录已失效，请在 Copilot Bridge 重新登录。",TOKEN_EXPIRED:"登录已过期，请在 Copilot Bridge 重新登录。",
  DEVICE_REVOKED:"当前设备已被移除，请重新登录。",ACCOUNT_DISABLED:"账号已被停用，请联系管理员。",
  GATEWAY_TIMEOUT:"模型服务响应超时，本次请求已中断，请稍后重试。",SERVER_UNREACHABLE:"网络连接不稳定，无法连接平台，请检查网络后重试。",
  STREAM_DISCONNECTED:"模型回复尚未完成，连接已断开，请检查网络后重试。",
  PROVIDER_RATE_LIMITED:"模型服务请求过多，暂时无法响应，请稍后重试。",RATE_LIMITED:"请求过于频繁，请稍后重试。",
  PROVIDER_BALANCE_EXHAUSTED:"模型上游额度不足，请联系管理员处理。",PROVIDER_AUTH_REQUIRED:"模型上游授权失效，请联系管理员处理。",
  PROVIDER_UNAVAILABLE:"模型上游服务暂时不可用，请稍后重试。",MODEL_UNAVAILABLE:"当前模型暂时不可用，请稍后重试或切换模型。",
  PAYLOAD_TOO_LARGE:"本次内容超过容量限制，请减少附件或会话内容后重试。",
  INVALID_SERVER_RESPONSE:"模型返回的数据格式异常，本次请求无法继续，请重试。",
  VALIDATION_ERROR:"请求参数不符合要求，本次请求无法继续。",INVALID_REQUEST:"请求格式不正确，请重试。",
  RESPONSE_FAILED:"模型处理失败，本次请求已中断，请重试。",RESPONSE_INCOMPLETE:"模型回复未完成，请重试或缩小本次任务。",
  max_output_tokens:"本次回复达到模型输出长度限制，回复未完成，请让模型继续或缩小任务。",
  content_filter:"本次回复被模型内容审核中止，请调整请求内容。",
  insufficient_quota:"模型上游额度不足，请联系管理员处理。",invalid_api_key:"模型上游授权失效，请联系管理员处理。",
  rate_limit_exceeded:"模型服务请求过多，暂时无法响应，请稍后重试。",server_error:"模型上游服务内部错误，请稍后重试。",
};

/** Public failures are Chinese and bounded. Original errors remain in encrypted diagnostics. */
export function publicResponseError(error:unknown):{code:string;message:string;type:string;requestId:string|undefined} {
  const data=error&&typeof error==="object"?error as {code?:unknown;message?:unknown;requestId?:string}:{};
  const code=error instanceof ZodError?"INVALID_REQUEST":typeof data.code==="string"?data.code:"INTERNAL_ERROR";
  const chinese=typeof data.message==="string"&&/[\u3400-\u9fff]/.test(data.message)?String(sanitizeFailure(data.message,2048).value).slice(0,700):undefined;
  return {code,message:messages[code]&&code!=="INVALID_SERVER_RESPONSE"&&code!=="PAYLOAD_TOO_LARGE"&&code!=="VALIDATION_ERROR"?messages[code]:chinese??messages[code]??`本次请求失败（${code.replace(/[^\w.-]/g,"").slice(0,80)}），请重试；若持续出现，请联系管理员。`,type:code==="INSUFFICIENT_POINTS"?"insufficient_quota":error instanceof CloudError&&(error.httpStatus??500)<500?"invalid_request_error":"server_error",requestId:data.requestId};
}

export function upstreamResponseFailure(payload:unknown,kind:string):CloudError {
  const event=payload&&typeof payload==="object"?payload as Record<string,unknown>:{};
  const response=event.response&&typeof event.response==="object"?event.response as Record<string,unknown>:{};
  const detail=(response.error??event.error??event) as Record<string,unknown>;
  const incomplete=response.incomplete_details as Record<string,unknown>|undefined;
  const code=kind==="response.incomplete"?String(incomplete?.reason??"RESPONSE_INCOMPLETE"):typeof detail.code==="string"?detail.code:"RESPONSE_FAILED";
  const reason=publicResponseError({code,message:detail.message}).message;
  return new CloudError(code,reason,{httpStatus:502,responseBody:{upstreamFailure:payload}});
}
