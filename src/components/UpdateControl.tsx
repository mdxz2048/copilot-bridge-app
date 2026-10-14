import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Modal} from './Modal';
import {Button} from './Button';

type UpdateStatus = Awaited<ReturnType<typeof window.copilotBridge.getUpdateStatus>>;

export function UpdateControl() {
  const [status,setStatus]=useState<UpdateStatus>({state:'CURRENT'});
  const [installing,setInstalling]=useState(false);
  const [checkingAction,setCheckingAction]=useState(false);
  const [showDetails,setShowDetails]=useState(false);
  const actionPending=useRef(false);
  useEffect(()=>{
    if(!window.copilotBridge.getUpdateStatus)return;
    let active=true,eventSeen=false;
    const unsubscribe=window.copilotBridge.onUpdateStatus(next=>{eventSeen=true;if(active)setStatus(next);});
    void window.copilotBridge.getUpdateStatus().then(next=>{if(active&&!eventSeen)setStatus(next);}).catch(()=>undefined);
    return()=>{active=false;unsubscribe();};
  },[]);
  const downloading=status.state==='DOWNLOADING';
  const working=status.state==='CHECKING'||downloading||installing||checkingAction;
  const total=status.total;
  const downloaded=status.downloaded;
  const determinate=downloading&&typeof total==='number'&&Number.isFinite(total)&&total>0
    &&typeof downloaded==='number'&&Number.isFinite(downloaded)&&downloaded>=0;
  const percent=determinate?Math.min(100,Math.max(0,downloaded/total*100)):undefined;
  const version=status.version?` ${status.version}`:'';
  const published=status.publishedAt?new Date(status.publishedAt):null;
  const publishedLabel=published&&!Number.isNaN(published.getTime())?published.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'}):null;
  const label=installing?'正在启动安装程序…':status.state==='CHECKING'?'正在检查升级…':downloading
    ?`正在下载${version}${percent!==undefined?` · ${Math.floor(percent)}%`:typeof downloaded==='number'&&downloaded>=0?` · ${(downloaded/1048576).toFixed(1)} MB`:''}`
    :status.state==='READY'?`新版本${version}已下载 · 查看更新说明`
    :status.state==='ERROR'?`升级失败，点击重试${status.message?`：${status.message}`:''}`:'检查升级 · 打开软件时自动检查';
  async function check(){
    if(working||actionPending.current)return;
    actionPending.current=true;setCheckingAction(true);
    try{await window.copilotBridge.checkForUpdates();}
    catch(error){setStatus(previous=>({...previous,state:'ERROR',message:error instanceof Error?error.message:String(error)}));}
    finally{actionPending.current=false;setCheckingAction(false);}
  }
  function activate(){
    setShowDetails(true);
    if(status.state==='CURRENT'||status.state==='ERROR')void check();
  }
  async function install(){
    if(status.state!=='READY'||actionPending.current)return;
    actionPending.current=true;setInstalling(true);
    try{await window.copilotBridge.installUpdate();}
    catch(error){setStatus(previous=>({...previous,state:'ERROR',message:error instanceof Error?error.message:String(error)}));}
    finally{setInstalling(false);actionPending.current=false;}
  }
  return <div className="update-control">
    <button type="button" className={`title-tool-button update-icon-button update-${status.state.toLowerCase()}`} disabled={installing}
      title={label} aria-label={label} onClick={()=>void activate()}>
      <svg className="update-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
        {downloading&&<circle className="update-ring-track" cx="18" cy="18" r="16"/>}
        {downloading&&<circle className={`update-ring-value ${!determinate?'update-ring-unknown':''}`} cx="18" cy="18" r="16"
          pathLength="100" strokeDasharray={downloading&&!determinate?'22 78':'100'} strokeDashoffset={percent!==undefined?100-percent:0}/>}
      </svg>
      <svg className="update-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {status.state==='ERROR'?<><path d="M12 5v9"/><path d="M12 18h.01"/></>:status.state==='READY'||downloading
          ?<><path d="M12 19V5m-4 4 4-4 4 4"/><path d="M5 17v3h14v-3"/></>
          :<><path d="M19 7a8 8 0 0 0-13-1L3 9m0-5v5h5"/><path d="M5 17a8 8 0 0 0 13 1l3-3m0 5v-5h-5"/></>}
      </svg>
      {(downloading||status.state==='READY')&&<span className="update-notification-dot" aria-hidden="true"/>}
    </button>
    {downloading&&<span className="visually-hidden" role="progressbar" aria-label="安装包下载进度" aria-valuemin={percent!==undefined?0:undefined}
      aria-valuemax={percent!==undefined?100:undefined} aria-valuenow={percent!==undefined?Math.floor(percent):undefined} aria-valuetext={label}/>}
    <span className="visually-hidden" role="status" aria-live="polite">{status.state==='READY'?`新版本${version}已下载，点击右上角升级图标查看更新说明后安装。`:status.state==='ERROR'?label:''}</span>
    {showDetails&&createPortal(<Modal title={status.version?`新版本 ${status.version}`:'软件更新'} onClose={installing?undefined:()=>setShowDetails(false)}>
      <div className="update-details">
        {publishedLabel&&<p className="dialog-caption">发布于 {publishedLabel}</p>}
        {status.version&&<>
          <h3>更新内容</h3>
          <p className="update-release-notes">{status.releaseNotes?.trim()||'平台暂未提供本次更新说明。'}</p>
        </>}
        <p className="dialog-status" role="status">{status.state==='CURRENT'?'当前已是最新版本。':label}</p>
        {downloading&&<div className="dialog-download-track" aria-hidden="true"><span className={determinate?'':'indeterminate'} style={determinate?{width:`${percent}%`}:undefined}/></div>}
        {downloading&&<p>安装包在后台下载，关闭此窗口不会中断下载。</p>}
        {status.state==='READY'&&<p className="dialog-caption">安装时将关闭 Bridge 并启动安装程序，请先完成当前任务。</p>}
        <div className="modal-actions">
          <Button type="button" className="dialog-secondary" disabled={installing} onClick={()=>setShowDetails(false)}>{status.state==='READY'||downloading?'稍后':'关闭'}</Button>
          <Button type="button" disabled={working} onClick={()=>void(status.state==='READY'?install():check())}>{installing?'正在启动安装…':status.state==='READY'?'安装更新':downloading?'正在下载…':status.state==='CHECKING'?'正在检查…':status.state==='ERROR'?'重试更新':'检查更新'}</Button>
        </div>
      </div>
    </Modal>,document.body)}
  </div>;
}
