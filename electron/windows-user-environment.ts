import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UserEnvironment } from "./profile-store.js";

const execFileAsync = promisify(execFile);
const registryPath = "HKCU\\Environment";

export class WindowsUserEnvironment implements UserEnvironment {
  async read(name: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("reg.exe", [
        "query",
        registryPath,
        "/v",
        name,
      ]);
      const match = stdout.match(new RegExp(`${name}\\s+REG_\\w+\\s+(.*)\\r?$`, "m"));
      return match?.[1]?.trim() || null;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === 1) {
        return null;
      }
      throw error;
    }
  }

  async write(name: string, value: string | null): Promise<void> {
    if (value === null) {
      try {
        await execFileAsync("reg.exe", ["delete", registryPath, "/v", name, "/f"]);
      } catch (error: unknown) {
        if (!(error instanceof Error && "code" in error && error.code === 1)) {
          throw error;
        }
      }
      return;
    }
    await execFileAsync("reg.exe", [
      "add",
      registryPath,
      "/v",
      name,
      "/t",
      "REG_SZ",
      "/d",
      value,
      "/f",
    ]);
  }
}
