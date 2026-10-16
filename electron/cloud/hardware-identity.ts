import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { platform } from 'node:os';

export interface HardwareIdentity { uuid?: unknown; cpu?: unknown; mac?: unknown }
const exec = promisify(execFile);
let pending: Promise<HardwareIdentity> | undefined;
export function readHardwareIdentity(): Promise<HardwareIdentity> {
  pending ??= collect().catch(error => { pending=undefined; throw error; });
  return pending;
}
async function collect(): Promise<HardwareIdentity> {
  if(platform()!=='win32')throw new Error('此平台暂不支持硬件设备号。');
  const script = `$ErrorActionPreference='Stop'; $u=(Get-CimInstance Win32_ComputerSystemProduct).UUID; $c=@(Get-CimInstance Win32_Processor | ForEach-Object {$_.ProcessorId}); $m=@(); try {$m=@(Get-CimInstance -Namespace root/StandardCimv2 -ClassName MSFT_NetAdapter | Where-Object {$_.HardwareInterface -and -not $_.Virtual -and $_.NotUserRemovable} | ForEach-Object {$_.PermanentAddress})} catch {}; @{uuid=$u;cpu=$c;mac=$m} | ConvertTo-Json -Compress`;
  const result=await exec(join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),
    ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
    {windowsHide:true,timeout:12000,maxBuffer:128*1024,encoding:'utf8'});
  return JSON.parse(result.stdout.replace(/^\uFEFF/,'')) as HardwareIdentity;
}
const normalized=(v:unknown)=>typeof v==='string'?v.trim().toLowerCase().replace(/[^0-9a-f]/g,''):'';
const usable=(v:string)=>v.length>0&&!/^0+$/.test(v)&&!/^f+$/.test(v);
export function hardwareDeviceId(raw: HardwareIdentity): string {
  const uuid=normalized(raw.uuid);
  const cpu=[...new Set((Array.isArray(raw.cpu)?raw.cpu:[raw.cpu]).map(normalized).filter(v=>v.length>=8&&usable(v)))].sort();
  const mac=[...new Set((Array.isArray(raw.mac)?raw.mac:[raw.mac]).map(normalized)
    .filter(v=>v.length===12&&usable(v)&&(parseInt(v.slice(0,2),16)&3)===0))].sort();
  // SMBIOS UUID and CPU do not change with hostnames, OS updates, VPNs or adapter order.
  // Permanent built-in NIC addresses are used only when no usable SMBIOS UUID exists.
  const canonical=uuid.length===32&&usable(uuid)?{version:'hardware-v1',uuid,cpu}:{version:'hardware-v1',cpu,mac};
  if(!('uuid' in canonical)&&(!cpu.length||!mac.length))throw new Error('无法读取足够的硬件信息生成设备号，请重试。');
  const name=createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  // RFC UUIDv5 over an application namespace and the hardware digest; not an auth secret.
  const bytes=createHash('sha1').update(Buffer.from('8af5ef7c082d55b1903bb92383c5ff29','hex')).update(name).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
  const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
