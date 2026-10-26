import {useEffect,useRef,useState} from 'react';
import type {PurchaseClaim} from '../purchase-types';
export type PurchaseNoticeClient={list:()=>Promise<{data:PurchaseClaim[]}>;ack:(id:string,attempt:number)=>Promise<unknown>};
export function PurchaseNotice({client,onReviewed}:{client:PurchaseNoticeClient;onReviewed:()=>void}){
 const [items,setItems]=useState<PurchaseClaim[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const notified=useRef(new Set<string>()),acknowledged=useRef(new Set<string>()),refresh=useRef(onReviewed);refresh.current=onReviewed;
 useEffect(()=>{let active=true,running=false;
  async function load(){if(running||document.hidden)return;running=true;try{const result=await client.list();if(!active)return;const pending=result.data.filter(item=>!acknowledged.current.has(`${item.id}:${item.attempt}`));setItems(pending);let changed=false;for(const item of pending){const key=`${item.id}:${item.attempt}`;if(!notified.current.has(key)){notified.current.add(key);changed=true;}}if(changed)refresh.current();}catch{/* Keep the last notice and retry on reconnect. */}finally{running=false;}}
  void load();const timer=setInterval(()=>void load(),30000);document.addEventListener('visibilitychange',load);window.addEventListener('online',load);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',load);window.removeEventListener('online',load);};
 },[client]);
 const first=items[0];if(!first)return null;
 async function confirm(){if(!first||busy)return;setBusy(true);setError('');try{await client.ack(first.id,first.attempt);acknowledged.current.add(`${first.id}:${first.attempt}`);setItems(list=>list.filter(item=>item.id!==first.id||item.attempt!==first.attempt));}catch{setError('暂时未能确认，请检查网络后重试。');}finally{setBusy(false);}}
 return <section className="purchase-result-notice" aria-label="订单审核结果"><div role="status"><strong>{first.status==='APPROVED'?`订单审核通过，¥${(first.creditedRmb??0).toFixed(2)} 已到账`:'订单审核未通过'}</strong><p>订单号：{first.orderNo}</p>{first.reason&&<p>审核说明：{first.reason}</p>}{error&&<p role="alert">{error}</p>}</div><button type="button" disabled={busy} onClick={()=>void confirm()}>{busy?'正在确认…':'知道了'}</button></section>;
}
