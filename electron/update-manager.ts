import { networkDeadline } from './network-deadline.js';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, rename, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface UpdateRelease { version: string; downloadUrl: string; sha256: string; platform: string; arch: string; channel: string; releaseNotes?: string | null; publishedAt?: string | null }
export interface UpdateStatus { state: 'CURRENT' | 'CHECKING' | 'DOWNLOADING' | 'READY' | 'ERROR'; version?: string; downloaded?: number; total?: number; message?: string; releaseNotes?: string | null; publishedAt?: string | null }
interface UpdateOptions {
  currentVersion: string; baseUrl: string; directory: string;
  latest(): Promise<UpdateRelease | null>;
  changed(status: UpdateStatus): void;
  fetch?: typeof fetch;
  networkTimeouts?: {connectMs:number;idleMs:number;totalMs:number};
}
export function newerVersion(next: string, current: string): boolean {
  if (!/^\d+\.\d+\.\d+$/.test(next) || !/^\d+\.\d+\.\d+$/.test(current)) return false;
  const a = next.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
async function digest(path: string): Promise<string> {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export class UpdateManager {
  status: UpdateStatus = { state: 'CURRENT' };
  private pending: Promise<UpdateStatus> | null = null;
  private ready: { path: string; release: UpdateRelease } | null = null;
  private options: UpdateOptions;
  constructor(options: UpdateOptions) { this.options = options; }
  private emit(status: UpdateStatus) { this.status = status; this.options.changed(status); }
  check(): Promise<UpdateStatus> {
    if (this.pending) return this.pending;
    this.pending = this.run().catch(error => {
      this.ready = null;
      this.emit({ ...this.status, state: 'ERROR', message: error instanceof TypeError ? '更新连接失败，网络可能不稳定，请检查网络后重试。' : error instanceof Error ? error.message : '更新暂时失败，请稍后重试。' });
      return this.status;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
  private async run(): Promise<UpdateStatus> {
    this.emit({ state: 'CHECKING' });
    const checkDeadline=networkDeadline({label:'检查更新',totalMs:this.options.networkTimeouts?.connectMs??15000});
    let release:UpdateRelease|null;
    try{release=await checkDeadline.run(()=>this.options.latest());}finally{checkDeadline.dispose();}
    if (!release || release.channel !== 'stable' || release.platform !== 'windows' || release.arch !== 'x64' || !newerVersion(release.version, this.options.currentVersion)) {
      this.ready = null; this.emit({ state: 'CURRENT' }); return this.status;
    }
    const url = new URL(release.downloadUrl), base = new URL(this.options.baseUrl);
    if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || !/^[a-f0-9]{64}$/i.test(release.sha256)) throw new Error('升级信息校验失败。');
    await mkdir(this.options.directory, { recursive: true });
    const details = { version: release.version, releaseNotes: release.releaseNotes, publishedAt: release.publishedAt };
    const path = join(this.options.directory, `CopilotBridge-${release.version}.exe`);
    const temporary = path + '.part';
    // Keep only the offered installer; abandoned downloads cannot accumulate.
    for (const name of await readdir(this.options.directory)) {
      if (/^CopilotBridge-\d+\.\d+\.\d+\.exe(?:\.part)?$/.test(name) && name !== `CopilotBridge-${release.version}.exe`) await unlink(join(this.options.directory, name));
    }
    let cached = false;
    try { cached = (await digest(path)).toLowerCase() === release.sha256.toLowerCase(); } catch { /* Cache may not exist. */ }
    if (!cached) {
      await unlink(path).catch((e: NodeJS.ErrnoException) => { if (e.code !== 'ENOENT') throw e; });
      this.emit({ state: 'DOWNLOADING', ...details, downloaded: 0 });
      const deadline=networkDeadline({label:'下载更新安装包',connectMs:15000,idleMs:60000,totalMs:15*60000,...this.options.networkTimeouts});
      try {
      const response = await deadline.run(()=>(this.options.fetch ?? fetch)(url, { redirect: 'error', signal: deadline.signal }));
      deadline.headersReceived();
      if (!response.ok || !response.body) throw new Error(`安装包下载失败 (${response.status})。`);
      const length = response.headers.get('content-length'), total = length ? Number(length) : undefined;
      const limit = 512 * 1024 * 1024;
      if (total !== undefined && (!Number.isSafeInteger(total) || total < 2 || total > limit)) throw new Error('安装包大小无效。');
      let downloaded = 0, lastProgress = 0;
      const hash = createHash('sha256'); let signature = Buffer.alloc(0);
      const file = await open(temporary, 'wx', 0o600);
      const reader=response.body.getReader();
      try {
        this.emit({ state: 'DOWNLOADING', ...details, downloaded, total });
        for (;;) {
          const chunk=await deadline.run(()=>reader.read());if(chunk.done)break;deadline.progress();
          const bytes = Buffer.from(chunk.value); downloaded += bytes.length;
          if (downloaded > limit) throw new Error('安装包超过大小限制。');
          if (signature.length < 2) signature = Buffer.concat([signature, bytes.subarray(0, 2 - signature.length)]);
          hash.update(bytes);
          let offset = 0;
          while (offset < bytes.length) { const written = await file.write(bytes, offset, bytes.length - offset); if (!written.bytesWritten) throw new Error('写入安装包失败。'); offset += written.bytesWritten; }
          if (Date.now() - lastProgress > 300) { this.emit({ state: 'DOWNLOADING', ...details, downloaded, total }); lastProgress = Date.now(); }
        }
        if (signature.toString('ascii') !== 'MZ' || (total !== undefined && total !== downloaded) || hash.digest('hex').toLowerCase() !== release.sha256.toLowerCase()) throw new Error('安装包校验失败，请重新检查升级。');
        await file.sync(); await file.close(); await rename(temporary, path);
      } catch (error) { await file.close().catch(() => undefined); await unlink(temporary).catch(() => undefined); throw error; }
      finally{void reader.cancel().catch(()=>undefined);reader.releaseLock();}
      }finally{deadline.dispose();}
    }
    this.ready = { path, release };
    this.emit({ state: 'READY', ...details }); return this.status;
  }
  async installer(): Promise<string> {
    if (this.status.state !== 'READY' || !this.ready) throw new Error('安装包尚未下载完成。');
    if (await digest(this.ready.path) !== this.ready.release.sha256.toLowerCase()) { this.ready = null; this.emit({ ...this.status, state: 'ERROR', message: '安装包校验失败，请重新下载。' }); throw new Error('安装包校验失败。'); }
    return this.ready.path;
  }
}
