import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { hostname, platform, release } from "node:os";
import { dirname } from "node:path";
import { hardwareDeviceId, readHardwareIdentity, type HardwareIdentity } from './hardware-identity.js';

export interface DeviceIdentity {
  legacyDeviceId?: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

interface PersistedDeviceIdentity {
  deviceId: string;
  identityVersion?: 'hardware-v1';
  legacyDeviceId?: string;
}

export class DeviceIdentityStore {
  private pending: Promise<DeviceIdentity> | null = null;
  private readonly path: string;
  private readonly appVersion: string;
  private readonly hardware:()=>Promise<HardwareIdentity>;

  constructor(path: string, appVersion: string, hardware:()=>Promise<HardwareIdentity> = readHardwareIdentity) {
    this.hardware=hardware;
    this.path = path;
    this.appVersion = appVersion;
  }

  get(): Promise<DeviceIdentity> {
    this.pending ??= this.readOrCreate().catch(error=>{this.pending=null;throw error;});
    return this.pending;
  }

  private async readOrCreate(): Promise<DeviceIdentity> {
    const persisted = await this.read();
    let deviceId:string;
    try { deviceId=hardwareDeviceId(await this.hardware()); }
    catch {
      if(!persisted)throw new Error('暂时无法读取硬件设备号，请稍后重试。');
      deviceId=persisted.deviceId;
    }
    const legacyDeviceId = persisted?.deviceId!==deviceId ? (persisted?.identityVersion==='hardware-v1'?undefined:persisted?.deviceId) : persisted?.legacyDeviceId;
    if (!persisted || persisted.deviceId!==deviceId) await this.write({deviceId,identityVersion:'hardware-v1',...(legacyDeviceId?{legacyDeviceId}:{})});
    return {
      deviceId,
      ...(legacyDeviceId?{legacyDeviceId}:{}),
      deviceName: hostname(),
      platform: platform(),
      osVersion: release(),
      appVersion: this.appVersion,
    };
  }

  private async read(): Promise<PersistedDeviceIdentity | null> {
    try {
      const parsed = JSON.parse(
        await readFile(this.path, "utf8"),
      ) as Partial<PersistedDeviceIdentity>;
      if (!isUuid(parsed.deviceId)) {
        throw new Error("Persisted Cloud device identity is invalid.");
      }
      if(parsed.legacyDeviceId!==undefined&&!isUuid(parsed.legacyDeviceId))throw new Error('Invalid legacy device identity.');
      return { deviceId: parsed.deviceId,identityVersion:parsed.identityVersion,legacyDeviceId:parsed.legacyDeviceId };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private async write(identity: PersistedDeviceIdentity): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify(identity, null, 2)}\n`,
      "utf8",
    );
    await rename(temporary, this.path);
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
