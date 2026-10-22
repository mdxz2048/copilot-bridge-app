import {z} from 'zod';
import {sanitizeFailure,type FailureFeedback} from './failure-feedback.js';

export const SUPPORT_EMAIL='zhipeng2048@gmail.com';
export const SupportIssueSchema=z.object({message:z.string().max(4096),occurredAt:z.iso.datetime(),code:z.string().max(100).optional()}).strict();
export type SupportIssue=z.infer<typeof SupportIssueSchema>;

/** Keep only error metadata in memory; never retain a conversation in a mail draft. */
export class SupportMail {
  private latest?:{owner:string;issue:SupportIssue;requestId?:string;traceId?:string};
  record(report:FailureFeedback){this.latest={owner:report.ownerUserId,issue:{message:report.error.message,code:report.error.code,occurredAt:report.occurredAt},requestId:report.requestId,traceId:report.traceId};}
  draft(userId:string|null,version:string,visibleIssue?:unknown):string {
    const selected=this.latest?.owner===userId?this.latest:undefined;
    const issue=visibleIssue===undefined?selected?.issue:SupportIssueSchema.parse(visibleIssue);
    const message=Buffer.from(String(sanitizeFailure(issue?.message??'暂无错误记录，请在此补充问题描述。',4096).value),'utf8').toString('utf8');
    const safeId=(value?:string)=>value&&/^[A-Za-z0-9_.:-]{1,200}$/.test(value)?value:undefined;
    const fields=[`用户 ID：${userId??'未登录 / 暂不可用'}`,`发生时间：${issue?.occurredAt?new Date(issue.occurredAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'暂无错误记录'}`,`客户端版本：${version}`,`错误码：${safeId(issue?.code)??'未记录'}`];
    if(selected&&!visibleIssue){if(safeId(selected.requestId))fields.push(`请求 ID：${selected.requestId}`);if(safeId(selected.traceId))fields.push(`诊断 ID：${selected.traceId}`);}
    const subject='Copilot Bridge 问题反馈';
    let detail=message;
    const uri=()=>`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fields.join('\r\n')+'\r\n\r\n报错内容：\r\n'+detail)}`;
    // Windows mail handlers can reject long URIs. Keep metadata and trim only
    // error text, always on complete Unicode code points and before URI encoding.
    while(uri().length>1700&&detail.length>32)detail=Array.from(detail).slice(0,-16).join('');
    if(detail!==message)detail+='…（内容已截短）';
    return uri();
  }
}
