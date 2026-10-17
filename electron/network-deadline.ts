/** Bounded waiting for headers, body progress and the whole operation. */
export class NetworkTimeoutError extends Error {
  readonly phase: 'connect' | 'idle' | 'total';
  constructor(label: string, phase: 'connect' | 'idle' | 'total') {
    super(`${label}${phase === 'idle' ? '长时间没有收到数据' : '等待超时'}，网络可能不稳定，请检查网络后重试。`);
    this.name = 'NetworkTimeoutError';this.phase=phase;
  }
}
export function networkDeadline(options: {label:string;connectMs?:number;idleMs?:number;totalMs:number;signal?:AbortSignal}) {
  const controller = new AbortController();
  let connection: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined;
  const abort = (phase:'connect'|'idle'|'total') => controller.abort(new NetworkTimeoutError(options.label, phase));
  const inherited = () => controller.abort(options.signal?.reason);
  if(options.signal?.aborted) inherited(); else options.signal?.addEventListener('abort', inherited, {once:true});
  const total = setTimeout(() => abort('total'), options.totalMs);
  if(options.connectMs) connection = setTimeout(() => abort('connect'), options.connectMs);
  const progress = () => { clearTimeout(idle); if(options.idleMs&&!controller.signal.aborted)idle=setTimeout(()=>abort('idle'),options.idleMs); };
  return {
    signal: controller.signal,
    headersReceived(){clearTimeout(connection);progress();}, progress,
    async run<T>(operation:()=>Promise<T>):Promise<T>{
      controller.signal.throwIfAborted();
      let listener:()=>void = ()=>{};
      const cancelled = new Promise<never>((_resolve,reject)=>{listener=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',listener,{once:true});});
      try{return await Promise.race([Promise.resolve().then(operation),cancelled]);}
      finally{controller.signal.removeEventListener('abort',listener);}
    },
    dispose(){if(!controller.signal.aborted)controller.abort(new DOMException('操作已结束','AbortError'));clearTimeout(total);clearTimeout(connection);clearTimeout(idle);options.signal?.removeEventListener('abort',inherited);},
  };
}
