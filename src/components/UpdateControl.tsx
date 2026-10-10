import { useEffect, useState } from 'react';

export function UpdateControl() {
  const [status, setStatus] = useState<{state: string; version?: string; downloaded?: number; total?: number; message?: string}>({ state: 'CURRENT' });
  useEffect(() => {
    if (!window.copilotBridge.getUpdateStatus) return;
    void window.copilotBridge.getUpdateStatus().then(setStatus).catch(() => undefined);
    return window.copilotBridge.onUpdateStatus(setStatus);
  }, []);
  const working = status.state === 'CHECKING' || status.state === 'DOWNLOADING';
  const label = status.state === 'CHECKING' ? '检查升级…' : status.state === 'DOWNLOADING'
    ? `下载 ${status.version} ${status.total ? Math.round((status.downloaded ?? 0) / status.total * 100) + '%' : Math.round((status.downloaded ?? 0) / 1048576) + ' MB'}`
    : status.state === 'READY' ? `安装 ${status.version}` : '检查升级';
  return <div style={{display: 'flex', justifyContent: 'flex-end', padding: '0 18px 8px'}}>
    <button type="button" disabled={working} title={status.message ?? '每次打开自动检查升级'} onClick={() => {
      void window.copilotBridge.checkForUpdates().catch(error => setStatus({state: 'ERROR', message: String(error)}));
    }}>{label}</button>
  </div>;
}
