import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Modal} from './Modal';
import {Button} from './Button';
import {createPortal} from 'react-dom';
export type BroadcastItem={id:string;text:string;action:'INVITE'|'NONE'};
export function BroadcastNotice({items,suppressed,inviteAction}:{items:BroadcastItem[];suppressed:boolean;inviteAction:ReactNode}){
 const [index,setIndex]=useState(0),[hover,setHover]=useState(false),[focus,setFocus]=useState(false),[hidden,setHidden]=useState(document.hidden),[reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false),[detail,setDetail]=useState<BroadcastItem|null>(null);
 const region=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!hover)return;const pointer=(event:PointerEvent)=>{if(!region.current?.contains(event.target as Node))setHover(false);};document.addEventListener("pointermove",pointer);return()=>document.removeEventListener("pointermove",pointer);},[hover]);
 const key=items.map(item=>item.id+item.text).join('|');
 useEffect(()=>{setIndex(0);setDetail(current=>current&&items.some(n=>n.id===current.id&&n.text===current.text)?current:null);},[key]);
 useEffect(()=>{if(suppressed){setHover(false);setFocus(false);setDetail(null);}},[suppressed]);
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media?.matches??false),visibility=()=>setHidden(document.hidden);media?.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);return()=>{media?.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};},[]);
 useEffect(()=>{if(suppressed||hover||focus||hidden||reduced||detail||items.length<2)return;const timer=setInterval(()=>setIndex(n=>(n+1)%items.length),10000);return()=>clearInterval(timer);},[suppressed,hover,focus,hidden,reduced,detail,key,items.length]);
 const item=items[index%Math.max(1,items.length)];if(suppressed||!item)return null;
 return <><div ref={region} className="broadcast-region" aria-label="活动与站内通知" onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} onFocus={()=>setFocus(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocus(false);}}>
 <svg className="broadcast-icon" aria-hidden="true" viewBox="0 0 20 20" fill="none"><path d="M3 7h14v4H3zM5 11v6h10v-6M10 7v10M10 7C4 7 4 2.5 6.8 3c1.7.3 3.2 4 3.2 4Zm0 0c6 0 6-4.5 3.2-4-1.7.3-3.2 4-3.2 4Z"/></svg>
 <button key={item.id} type="button" className="broadcast-message" title={item.text} onClick={()=>setDetail(item)}>{item.text}</button>
 {item.action==='INVITE'&&inviteAction}
 {items.length>1&&<button type="button" className="broadcast-next" aria-label="下一条通知" onClick={()=>setIndex(n=>(n+1)%items.length)}>›</button>}
 </div>{detail&&createPortal(<Modal title={detail.action==='INVITE'?'邀请活动':'站内通知'} onClose={()=>setDetail(null)}><p className="broadcast-detail">{detail.text}</p><div className="modal-actions"><Button className="dialog-secondary" onClick={()=>setDetail(null)}>关闭</Button></div></Modal>,document.body)}</>;
}
