import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { UpdateManager, newerVersion } from '../dist-electron/update-manager.js';
const bytes = Buffer.from('MZ test installer content');
const hash = createHash('sha256').update(bytes).digest('hex');
const release = { version: '0.2.6', platform: 'windows', arch: 'x64', channel: 'stable', downloadUrl: 'https://ai.mddxz.top/api/v1/releases/files/test', sha256: hash };
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'bridge-update-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  let downloads = 0, checks = 0; const statuses = [];
  const manager = new UpdateManager({currentVersion: '0.2.5', baseUrl: 'https://ai.mddxz.top', directory,
    latest: async () => { checks++; return release; }, changed: s => statuses.push(s),
    fetch: async () => { downloads++; return new Response(bytes, {headers: {'content-length': String(bytes.length)}}); }, ...overrides});
  return {manager, directory, statuses, downloads: () => downloads, checks: () => checks};
}
test('downloads automatically, checks hash, coalesces opens and keeps installer for later', async t => {
  const f = await fixture(t);
  await assert.rejects(f.manager.installer());
  const a = f.manager.check(), b = f.manager.check(); assert.equal(a, b);
  assert.equal((await a).state, 'READY'); assert.equal(f.checks(), 1); assert.equal(f.downloads(), 1);
  assert.deepEqual(await readFile(await f.manager.installer()), bytes);
  await f.manager.check(); assert.equal(f.checks(), 2); assert.equal(f.downloads(), 1);
  assert(f.statuses.some(s => s.state === 'DOWNLOADING'));
  await writeFile(await f.manager.installer(), 'tampered');
  await assert.rejects(f.manager.installer(), /校验失败/);
  assert.equal((await f.manager.check()).state, 'READY'); assert.equal(f.downloads(), 2);
});
test('restores cached download after restart and removes older installers/partial files', async t => {
  const f = await fixture(t);
  await writeFile(join(f.directory, 'CopilotBridge-0.2.6.exe'), bytes);
  await writeFile(join(f.directory, 'CopilotBridge-0.2.5.exe'), bytes);
  await writeFile(join(f.directory, 'CopilotBridge-0.2.6.exe.part'), 'partial');
  assert.equal((await f.manager.check()).state, 'READY'); assert.equal(f.downloads(), 0);
  assert.deepEqual(await readdir(f.directory), ['CopilotBridge-0.2.6.exe']);
});
test('rejects corrupt and truncated downloads and cleans partial files', async t => {
  for (const response of [new Response('MZ corrupt'), new Response(bytes, {headers: {'content-length': '999'}}), new Response('invalid executable')]) {
    const f = await fixture(t, {fetch: async () => response});
    assert.equal((await f.manager.check()).state, 'ERROR');
    assert.deepEqual(await readdir(f.directory), []); await assert.rejects(f.manager.installer());
  }
});
test('offline errors do not prevent retry; current/older/beta releases never download', async t => {
  let offline = true;
  const f = await fixture(t, {latest: async () => { if (offline) throw Error('offline'); return null; }});
  assert.equal((await f.manager.check()).state, 'ERROR'); offline = false;
  assert.equal((await f.manager.check()).state, 'CURRENT');
  for (const r of [{...release, version: '0.2.5'}, {...release, version: '0.2.4'}, {...release, channel: 'beta'}]) {
    const x = await fixture(t, {latest: async () => r}); assert.equal((await x.manager.check()).state, 'CURRENT'); assert.equal(x.downloads(), 0);
  }
});
test('rejects untrusted URLs and download size overflow', async t => {
  for (const r of [{...release, downloadUrl: 'http://ai.mddxz.top/test'}, {...release, downloadUrl: 'https://other.example/test'}, {...release, sha256: 'invalid'}]) {
    const f = await fixture(t, {latest: async () => r}); assert.equal((await f.manager.check()).state, 'ERROR'); assert.equal(f.downloads(), 0);
  }
  const f = await fixture(t, {fetch: async () => new Response(bytes, {headers: {'content-length': String(513 * 1024 * 1024)}})});
  assert.equal((await f.manager.check()).state, 'ERROR');
});
test('compares version numbers numerically', () => {
  assert(newerVersion('0.2.10', '0.2.9')); assert(newerVersion('1.0.0', '0.99.99'));
  assert(!newerVersion('0.2.6', '0.2.6')); assert(!newerVersion('0.3.0-beta', '0.2.6'));
});
