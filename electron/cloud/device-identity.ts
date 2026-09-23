import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { hostname, platform, release } from "node:os";
import { dirname } from "node:path";

export interface DeviceIdentity {
  deviceId: string;
  deviceName: string;
  platform: string;
  osVersion: string;
  appVersion: string;
}

interface PersistedDeviceIdentity {
  deviceId: string;
}

export class DeviceIdentityStore {
  private pending: Promise<DeviceIdentity> | null = null;
  private readonly path: string;
  private readonly appVersion: string;

  constructor(path: string, appVersion: string) {
    this.path = path;
    this.appVersion = appVersion;
  }

  get(): Promise<DeviceIdentity> {
    this.pending ??= this.readOrCreate();
    return this.pending;
  }

  private async readOrCreate(): Promise<DeviceIdentity> {
    const persisted = await this.read();
    const deviceId = persisted?.deviceId ?? randomUUID();
    if (!persisted) await this.write({ deviceId });
    return {
      deviceId,
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
      return { deviceId: parsed.deviceId };
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
