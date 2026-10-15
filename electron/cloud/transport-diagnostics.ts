/** Keep only known runtime codes; never persist socket addresses, URLs or raw causes. */
const codes=new Set(['ENOTFOUND','EAI_AGAIN','ECONNRESET','EPIPE','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_WRONG_VERSION_NUMBER']);
export function transportFailureMessage(error:unknown,elapsedMs:number,callerAborted:boolean,deadlineAborted:boolean):string {
 const found=new Set<string>();let visited=0;
 const visit=(value:unknown,depth=0)=>{if(depth>4||++visited>12||!value||typeof value!=='object')return;const e=value as {code?:unknown;cause?:unknown;errors?:unknown};if(typeof e.code==='string'&&codes.has(e.code))found.add(e.code);visit(e.cause,depth+1);if(Array.isArray(e.errors))for(const child of e.errors.slice(0,4))visit(child,depth+1);};visit(error);
 const list=[...found];
 const kind=callerAborted?'CALLER_CANCELLED':deadlineAborted?'REQUEST_DEADLINE':list.some(c=>['ENOTFOUND','EAI_AGAIN'].includes(c))?'DNS':list.some(c=>/CERT|TLS|SSL|SIGNATURE/.test(c))?'TLS':list.includes('UND_ERR_CONNECT_TIMEOUT')?'CONNECT_TIMEOUT':list.some(c=>['ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(c))?'CONNECTION_RESET':list.some(c=>c.includes('TIMEOUT')||c==='ETIMEDOUT')?'TRANSPORT_TIMEOUT':'NETWORK';
 const text=callerAborted?'请求已取消':deadlineAborted?'请求达到时间上限':kind==='DNS'?'无法解析 Cloud 地址':kind==='TLS'?'与 Cloud 的安全连接失败':kind==='CONNECT_TIMEOUT'?'连接 Cloud 超时':kind==='CONNECTION_RESET'?'与 Cloud 的连接中断':'无法连接 Cloud，请稍后重试';
 return `${text}（${kind}${list.length?'; '+list.join(','):''}; ${Math.max(0,Math.round(elapsedMs))}ms; before_headers）`;
}
