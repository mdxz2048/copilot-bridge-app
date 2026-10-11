import {useEffect,useRef,useState} from 'react';

type UpdateStatus = Awaited<ReturnType<typeof window.copilotBridge.getUpdateStatus>>;

export function UpdateControl() {
  const [status,setStatus]=useState<UpdateStatus>({state:'CURRENT'});
  const [installing,setInstalling]=useState(false);
  const actionPending=useRef(false);
  useEffect(()=>{
    if(!window.copilotBridge.getUpdateStatus)return;
    let active=true,eventSeen=false;
    const unsubscribe=window.copilotBridge.onUpdateStatus(next=>{eventSeen=true;if(active)setStatus(next);});
    void window.copilotBridge.getUpdateStatus().then(next=>{if(active&&!eventSeen)setStatus(next);}).catch(()=>undefined);
    return()=>{active=false;unsubscribe();};
  },[]);
  const downloading=status.state==='DOWNLOADING';
  const working=status.state==='CHECKING'||downloading||installing;
  const total=status.total;
  const downloaded=status.downloaded;
  const determinate=downloading&&typeof total==='number'&&Number.isFinite(total)&&total>0
    &&typeof downloaded==='number'&&Number.isFinite(downloaded)&&downloaded>=0;
  const percent=determinate?Math.min(100,Math.max(0,downloaded/total*100)):undefined;
  const version=status.version?` ${status.version}`:'';
  const label=installing?'正在启动安装程序…':status.state==='CHECKING'?'正在检查升级…':downloading
    ?`正在下载${version}${percent!==undefined?` · ${Math.floor(percent)}%`:typeof downloaded==='number'&&downloaded>=0?` · ${(downloaded/1048576).toFixed(1)} MB`:''}`
    :status.state==='READY'?`安装${version} · 已下载，点击立即安装`
    :status.state==='ERROR'?`升级失败，点击重试${status.message?`：${status.message}`:''}`:'检查升级 · 打开软件时自动检查';
  async function activate(){
    if(working||actionPending.current)return;
    actionPending.current=true;
    try{
      if(status.state==='READY'){setInstalling(true);await window.copilotBridge.installUpdate();}
      else await window.copilotBridge.checkForUpdates();
    }catch(error){setStatus({state:'ERROR',message:error instanceof Error?error.message:String(error)});}
    finally{setInstalling(false);actionPending.current=false;}
  }
  return <div className="update-control">
    <button type="button" className={`update-icon-button update-${status.state.toLowerCase()}`} disabled={working}
      title={label} aria-label={label} onClick={()=>void activate()}>
      <svg className="update-progress-ring" viewBox="0 0 36 36" aria-hidden="true">
        {downloading&&<circle className="update-ring-track" cx="18" cy="18" r="16"/>}
        {(downloading||status.state==='READY')&&<circle className={`update-ring-value ${downloading&&!determinate?'update-ring-unknown':''}`} cx="18" cy="18" r="16"
          pathLength="100" strokeDasharray={downloading&&!determinate?'22 78':'100'} strokeDashoffset={percent!==undefined?100-percent:0}/>}
      </svg>
      <svg className="update-symbol" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {status.state==='ERROR'?<><path d="M12 5v9"/><path d="M12 18h.01"/></>:status.state==='READY'||downloading
          ?<><path d="M12 4v11m-4-4 4 4 4-4"/><path d="M5 16v4h14v-4"/></>
          :<><path d="M19 7a8 8 0 0 0-13-1L3 9m0-5v5h5"/><path d="M5 17a8 8 0 0 0 13 1l3-3m0 5v-5h-5"/></>}
      </svg>
    </button>
    {downloading&&<span className="visually-hidden" role="progressbar" aria-label="安装包下载进度" aria-valuemin={percent!==undefined?0:undefined}
      aria-valuemax={percent!==undefined?100:undefined} aria-valuenow={percent!==undefined?Math.floor(percent):undefined} aria-valuetext={label}/>}
    <span className="visually-hidden" role="status" aria-live="polite">{status.state==='READY'?`新版本${version}已下载，点击右上角升级图标立即安装。`:status.state==='ERROR'?label:''}</span>
  </div>;
}
