import {useState} from 'react';
export function SupportContact({issue}:{issue?:{message:string;occurredAt:string;code?:string}}){
  const [failure,setFailure]=useState('');
  return <span className="support-contact"><a href="mailto:zhipeng2048@gmail.com" title="打开邮件应用，预填用户 ID、发生时间和报错内容" onClick={event=>{event.preventDefault();setFailure('');void window.copilotBridge.composeSupportMail(issue).catch(()=>setFailure('无法打开邮件应用，请复制邮箱联系管理员。'));}}>联系管理员 · zhipeng2048@gmail.com</a>{failure&&<small role="alert">{failure}</small>}</span>;
}
