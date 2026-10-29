import {useEffect,useRef,useState} from 'react';
import type {FeedbackInput,FeedbackList} from '../../electron/cloud/account-features';
const statuses={OPEN:'待处理',IN_PROGRESS:'处理中',RESOLVED:'已处理'};
const kinds={FEATURE:'功能建议',ISSUE:'问题反馈',OTHER:'其他意见'};
export function AccountFeedback({onBack}:{onBack:()=>void}){
  const [view,setView]=useState<'form'|'history'|'success'>('form'),[kind,setKind]=useState<FeedbackInput['kind']>('FEATURE'),[title,setTitle]=useState(''),[content,setContent]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[submitted,setSubmitted]=useState('');
  const id=useRef(crypto.randomUUID()),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  async function submit(){if(busy||!title.trim()||content.trim().length<5)return;setBusy(true);setError('');
    try{const result=await window.copilotBridge.submitFeedback({clientId:id.current,kind,title,content});if(live.current){setSubmitted(result.feedback.id);setView('success');setTitle('');setContent('');id.current=crypto.randomUUID();}}
    catch(e){if(live.current)setError((e as Error).message);}finally{if(live.current)setBusy(false);}
  }
  const edit=()=>{id.current=crypto.randomUUID();setError('');};
  return <div className="detail-view account-feedback"><div className="account-feature-toolbar"><button className="text-action" disabled={busy} onClick={onBack}>‹ 返回账户</button><button className="text-action" disabled={busy} onClick={()=>{setError('');setView(view==='history'?'form':'history');}}>{view==='history'?'写反馈':'我的反馈'}</button></div>
    {view==='history'?<FeedbackHistory/>:view==='success'?<div className="account-feedback-success" role="status"><span aria-hidden="true">✓</span><h3>反馈已收到</h3><p>管理员可在后台查看。你可以在“我的反馈”查看处理状态。</p><small>编号 {submitted.slice(0,8)}</small><button className="button secondary compact" onClick={()=>setView('history')}>查看我的反馈</button></div>:<form onSubmit={event=>{event.preventDefault();void submit();}} className="account-feedback-form">
      <p className="detail-caption">告诉我们你想要的功能，或遇到的问题。</p><label>反馈类型<select value={kind} disabled={busy} onChange={e=>{edit();setKind(e.target.value as FeedbackInput['kind']);}}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>标题 <small>{title.length}/80</small><input required maxLength={80} placeholder="用一句话说明你的想法" value={title} disabled={busy} onChange={e=>{edit();setTitle(e.target.value);}}/></label>
      <label>详细描述 <small>{content.length}/3000</small><textarea required minLength={5} maxLength={3000} rows={5} placeholder="请描述使用场景、期望，或问题出现的步骤（至少 5 字）" value={content} disabled={busy} onChange={e=>{edit();setContent(e.target.value);}}/></label>
      <p className="detail-caption">仅提交你填写的内容，不自动附加聊天或文档。请勿填写密码、密钥等敏感信息。</p>
      {error&&<p className="account-feature-error" role="alert">{error}</p>}<button className="button compact" type="submit" disabled={busy||!title.trim()||content.trim().length<5}>{busy?'正在提交…':'提交反馈'}</button>
    </form>}
  </div>;
}
function FeedbackHistory(){
  const [page,setPage]=useState(1),[revision,setRevision]=useState(0),[result,setResult]=useState<FeedbackList|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{let active=true;setLoading(true);setError('');void window.copilotBridge.listFeedback(page).then(value=>{if(active)setResult(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[page,revision]);
  return <><div className="account-feature-toolbar"><h3>我的反馈</h3><button className="text-action" disabled={loading} onClick={()=>setRevision(v=>v+1)}>刷新</button></div>{error?<p role="alert">{error} <button onClick={()=>setRevision(v=>v+1)}>重试</button></p>:loading?<p role="status">正在读取反馈…</p>:result&&<><div className="account-feedback-list">{result.data.map(row=><details key={row.id}><summary><span><b>{row.title}</b><small>{kinds[row.kind]} · {new Date(row.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}</small></span><span className="account-feedback-badge" data-status={row.status}>{statuses[row.status]}</span></summary><p>{row.content}</p><small>编号 {row.id.slice(0,8)}</small></details>)}{result.total===0&&<p className="empty-detail">还没有反馈，期待你的想法。</p>}</div><div className="account-feature-pagination"><span>{result.total} 条 · 第 {page} 页</span><div><button disabled={page<=1} onClick={()=>setPage(v=>v-1)}>上一页</button><button disabled={page*result.pageSize>=result.total} onClick={()=>setPage(v=>v+1)}>下一页</button></div></div></>}</>;
}
