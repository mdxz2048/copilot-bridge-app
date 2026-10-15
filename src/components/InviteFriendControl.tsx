import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Modal} from './Modal';
import {Button} from './Button';

type InviteMessage={message:string;downloadUrl:string;referralUrl?:string};

export function InviteFriendControl({compact=false}:{compact?:boolean}){
  const [open,setOpen]=useState(false);
  const [invite,setInvite]=useState<InviteMessage|null>(null);
  const [loading,setLoading]=useState(false);
  const [copying,setCopying]=useState(false);
  const [copied,setCopied]=useState(false);
  const [error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>()=>{generation.current++;},[]);
  async function load(){
    const current=++generation.current;
    setLoading(true);setError('');setInvite(null);setCopied(false);
    try{
      const result=await window.copilotBridge.getInviteMessage();
      if(current!==generation.current)return;
      if(!result.message?.trim()||!result.downloadUrl)throw Error('暂时无法生成邀请内容，请重试。');
      setInvite(result);
    }catch(failure){if(current===generation.current)setError(failure instanceof Error?failure.message:'暂时无法生成邀请内容，请重试。');}
    finally{if(current===generation.current)setLoading(false);}
  }
  function close(){generation.current++;setOpen(false);setLoading(false);setCopying(false);}
  async function copy(){
    if(!invite||copying)return;
    const current=generation.current;setCopying(true);setCopied(false);setError('');
    try{await navigator.clipboard.writeText(invite.message);if(current===generation.current)setCopied(true);}
    catch{if(current===generation.current)setError('复制失败，请选中上方邀请内容，手动复制。');}
    finally{if(current===generation.current)setCopying(false);}
  }
  return <>
    <Button type="button" className={compact?"broadcast-invite":undefined} onClick={()=>{setOpen(true);void load();}}>{compact?"去邀请":"邀请好友"}</Button>
    {open&&createPortal(<Modal title="邀请好友" onClose={close}><div className="invite-details">
      <p>原生 ChatGPT 体验，无需自行配置网络代理。<br/>自由选择账号已开通的国产或 GPT 模型。</p>
      {loading?<p className="dialog-status" role="status">正在获取最新下载地址…</p>:invite&&<>
        <label className="invite-label" htmlFor="bridge-invite-message">把这段内容发送给朋友</label>
        <textarea id="bridge-invite-message" className="invite-message" readOnly value={invite.message} rows={8}/>
        <p className="dialog-caption invite-url">下载地址：{invite.downloadUrl}</p>
      </>}
      {error&&<p className="dialog-error" role="alert">{error}</p>}
      {copied&&<p className="dialog-success" role="status">已复制，可以粘贴发送给朋友。</p>}
      <div className="modal-actions"><Button type="button" className="dialog-secondary" onClick={close}>关闭</Button>
        {!invite&&!loading?<Button type="button" onClick={()=>void load()}>重试</Button>:<Button type="button" disabled={loading||copying||!invite} onClick={()=>void copy()}>{copying?'正在复制…':copied?'再次复制':'复制邀请内容'}</Button>}
      </div>
    </div></Modal>,document.body)}
  </>;
}
