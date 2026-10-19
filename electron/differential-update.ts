import { gunzipSync } from 'node:zlib';
import { open } from 'node:fs/promises';
import { networkDeadline } from './network-deadline.js';

export const INSTALLER_LIMIT = 512 * 1024 * 1024;
const MAP_LIMIT = 2 * 1024 * 1024;
interface Block { offset: number; size: number; checksum: string }
export interface InstallerMap { size: number; blocks: Block[] }
export function parseInstallerMap(bytes: Uint8Array): InstallerMap {
  if (!bytes.length || bytes.length > MAP_LIMIT) throw new Error('差量索引大小无效。');
  const map = JSON.parse(gunzipSync(bytes, { maxOutputLength: 16 * 1024 * 1024 }).toString('utf8'));
  if (map.version !== '2' || !Array.isArray(map.files) || map.files.length !== 1) throw new Error('差量索引格式无效。');
  const file = map.files[0];
  if (file.name !== 'file' || file.offset !== 0 || !Array.isArray(file.sizes) || !Array.isArray(file.checksums)
    || !file.sizes.length || file.sizes.length > 100000 || file.sizes.length !== file.checksums.length) throw new Error('差量索引内容无效。');
  let size = 0;
  const blocks = file.sizes.map((length: unknown, i: number): Block => {
    const checksum = file.checksums[i];
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length <= 0 || length > INSTALLER_LIMIT
      || typeof checksum !== 'string' || !/^[A-Za-z0-9+/]{24}$/.test(checksum)) throw new Error('差量索引块无效。');
    const block = { offset: size, size: length, checksum }; size += length;
    if (size > INSTALLER_LIMIT) throw new Error('差量安装包过大。');
    return block;
  });
  if (size < 2) throw new Error('差量安装包大小无效。');
  return { size, blocks };
}
export interface DiffOperation { source: 'copy' | 'download'; offset: number; size: number; target: number }
export function planDifferential(oldMap: InstallerMap, nextMap: InstallerMap): DiffOperation[] {
  const reusable = new Map(oldMap.blocks.map(block => [`${block.checksum}:${block.size}`, block.offset]));
  const operations: DiffOperation[] = [];
  for (const block of nextMap.blocks) {
    const oldOffset = reusable.get(`${block.checksum}:${block.size}`);
    const source = oldOffset === undefined ? 'download' : 'copy';
    const offset = oldOffset ?? block.offset;
    const last = operations.at(-1);
    if (last && last.source === source && last.offset + last.size === offset && last.target + last.size === block.offset
      && last.size + block.size <= 8 * 1024 * 1024) last.size += block.size;
    else operations.push({ source, offset, size: block.size, target: block.offset });
  }
  return operations;
}
export async function fetchInstallerMap(url: URL, fetcher: typeof fetch, timeouts?: {connectMs:number;idleMs:number;totalMs:number}): Promise<Uint8Array> {
  const bytes = await fetchUpdateBytes(url, fetcher, timeouts); parseInstallerMap(bytes); return bytes;
}
export async function fetchUpdateBytes(url: URL, fetcher: typeof fetch, timeouts?: {connectMs:number;idleMs:number;totalMs:number}): Promise<Uint8Array> {
  const deadline = networkDeadline({ label: '下载差量索引', connectMs: 15000, idleMs: 15000, totalMs: 30000, ...timeouts });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await deadline.run(() => fetcher(url, { redirect: 'error', signal: deadline.signal }));
    deadline.headersReceived();
    if (!response.ok || !response.body) throw new Error('差量索引不可用。');
    const chunks: Uint8Array[] = []; let size = 0;
    reader = response.body.getReader();
    for (;;) {
      const result = await deadline.run(() => reader!.read()); if (result.done) break;
      deadline.progress(); size += result.value.length;
      if (size > MAP_LIMIT) throw new Error('差量索引过大。');
      chunks.push(result.value);
    }
    return Buffer.concat(chunks);
  } finally { if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); } deadline.dispose(); }
}

/** Reconstruct an installer, never execute it. The caller must verify the complete SHA-256. */
export async function reconstructInstaller(options: {
  oldPath: string; temporary: string; url: URL; sha256: string;
  oldMap: InstallerMap; nextMap: InstallerMap; fetcher: typeof fetch;
  progress(downloaded: number, total: number): void;
  timeouts?: {connectMs:number;idleMs:number;totalMs:number};
}): Promise<void> {
  const plan = planDifferential(options.oldMap, options.nextMap);
  const total = plan.filter(item => item.source === 'download').reduce((sum, item) => sum + item.size, 0);
  if (total >= options.nextMap.size * .85) throw new Error('差量收益不足，使用完整安装包。');
  const source = await open(options.oldPath, 'r');
  let target: Awaited<ReturnType<typeof open>> | undefined;
  const deadline = networkDeadline({ label: '下载差量更新', connectMs: 15000, idleMs: 60000, totalMs: 15 * 60000, ...options.timeouts });
  let downloaded = 0;
  try {
    if ((await source.stat()).size !== options.oldMap.size) throw new Error('差量基准大小无效。');
    target = await open(options.temporary, 'wx', 0o600);
    options.progress(0, total);
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (const operation of plan) {
      deadline.signal.throwIfAborted();
      if (operation.source === 'copy') {
        let copied = 0;
        while (copied < operation.size) {
          const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, operation.size - copied), operation.offset + copied);
          if (!bytesRead) throw new Error('差量基准不完整。');
          await writeAll(target, buffer.subarray(0, bytesRead), operation.target + copied); copied += bytesRead;
          deadline.progress();
        }
        continue;
      }
      const end = operation.offset + operation.size - 1;
      const response = await deadline.run(() => options.fetcher(options.url, { redirect: 'error', signal: deadline.signal,
        headers: { Range: `bytes=${operation.offset}-${end}`, 'If-Range': `"${options.sha256}"`, 'Accept-Encoding': 'identity' } }));
      deadline.headersReceived();
      if (response.status !== 206 || !response.body || response.headers.get('content-range') !== `bytes ${operation.offset}-${end}/${options.nextMap.size}`
        || response.headers.get('etag') !== `"${options.sha256}"` || (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity')) {
        void response.body?.cancel().catch(() => undefined); throw new Error('服务器差量响应无效。');
      }
      const reader = response.body.getReader(); let received = 0;
      try {
        for (;;) {
          const result = await deadline.run(() => reader.read()); if (result.done) break;
          deadline.progress();
          if (received + result.value.length > operation.size) throw new Error('差量数据超出范围。');
          await writeAll(target, result.value, operation.target + received);
          received += result.value.length; downloaded += result.value.length;
          options.progress(downloaded, total);
        }
        if (received !== operation.size) throw new Error('差量数据不完整。');
      } finally { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
    }
    await target.sync();
  } finally { deadline.dispose(); await source.close(); await target?.close(); }
}
async function writeAll(file: Awaited<ReturnType<typeof open>>, bytes: Uint8Array, position: number): Promise<void> {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await file.write(bytes, offset, bytes.length - offset, position + offset);
    if (!result.bytesWritten) throw new Error('写入差量安装包失败。');
    offset += result.bytesWritten;
  }
}
