import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type ProfileId = "original" | "bridge";
export type OriginalProfileState = "UNINITIALIZED" | "READY" | "CUSTOM";

export interface ProfileStatus {
  activeProfile: ProfileId;
  bridgeHome: string;
  originalState: OriginalProfileState;
  restartRequired: boolean;
  pendingProfile: ProfileId | null;
  unrestrictedBridgeAccess: boolean;
}

interface SwitchJournal {
  id: string;
  intendedProfile: ProfileId;
  previousUserCodexHome: string | null;
  createdAtUtc: string;
}

interface OriginalEnvironment {
  codexHome: string | null;
}

export interface UserEnvironment {
  read(name: string): Promise<string | null>;
  write(name: string, value: string | null): Promise<void>;
}

export class ProfileStore {
  private readonly bridgeHome: string;
  private readonly statePath: string;
  private readonly environment: UserEnvironment;
  private readonly originalHome: string;
  private readonly originalEnvironmentPath: string;

  constructor(
    bridgeHome: string,
    originalHome: string,
    statePath: string,
    environment: UserEnvironment,
  ) {
    this.bridgeHome = bridgeHome;
    this.originalHome = originalHome;
    this.statePath = statePath;
    this.originalEnvironmentPath = join(dirname(statePath), "original-environment.json");
    this.environment = environment;
  }

  async getStatus(): Promise<ProfileStatus> {
    const value = await this.environment.read("CODEX_HOME");
    const journal = await this.readJournal();
    const originalEnvironment = await this.readOriginalEnvironment();
    return {
      activeProfile: value === this.bridgeHome ? "bridge" : "original",
      bridgeHome: this.bridgeHome,
      originalState: originalEnvironment.codexHome || (value && value !== this.bridgeHome)
        ? "CUSTOM"
        : (await directoryExists(this.originalHome) ? "READY" : "UNINITIALIZED"),
      restartRequired: journal !== null,
      pendingProfile: journal?.intendedProfile ?? null,
      unrestrictedBridgeAccess: true,
    };
  }

  async activate(target: ProfileId): Promise<ProfileStatus> {
    const current = await this.environment.read("CODEX_HOME");
    if (target === "bridge" && current !== this.bridgeHome) {
      await this.writeOriginalEnvironment({ codexHome: current });
    }
    const originalEnvironment = await this.readOriginalEnvironment();
    const intendedValue = target === "bridge"
      ? this.bridgeHome
      : originalEnvironment.codexHome;

    if (current === intendedValue) {
      return this.getStatus();
    }

    await this.writeJournal({
      id: randomUUID(),
      intendedProfile: target,
      previousUserCodexHome: current,
      createdAtUtc: new Date().toISOString(),
    });
    await this.environment.write("CODEX_HOME", intendedValue);
    return this.getStatus();
  }

  async acknowledgeRestart(): Promise<ProfileStatus> {
    const journal = await this.readJournal();
    if (!journal) return this.getStatus();

    const actual = await this.environment.read("CODEX_HOME");
    const expected = journal.intendedProfile === "bridge" ? this.bridgeHome : null;
    if (actual !== expected) {
      throw new Error("The persisted CODEX_HOME value does not match the requested profile.");
    }

    await this.clearJournal();
    return this.getStatus();
  }

  async completeIfEnvironmentApplied(effectiveCodexHome: string | undefined): Promise<ProfileStatus> {
    const journal = await this.readJournal();
    if (!journal) return this.getStatus();
    const expected = journal.intendedProfile === "bridge" ? this.bridgeHome : undefined;
    if (effectiveCodexHome !== expected) return this.getStatus();
    await this.clearJournal();
    return this.getStatus();
  }

  private async readJournal(): Promise<SwitchJournal | null> {
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as SwitchJournal;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  private async readOriginalEnvironment(): Promise<OriginalEnvironment> {
    try {
      const parsed = JSON.parse(
        await readFile(this.originalEnvironmentPath, "utf8"),
      ) as Partial<OriginalEnvironment>;
      return { codexHome: typeof parsed.codexHome === "string" ? parsed.codexHome : null };
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { codexHome: null };
      }
      throw error;
    }
  }

  private async writeOriginalEnvironment(environment: OriginalEnvironment): Promise<void> {
    await mkdir(dirname(this.originalEnvironmentPath), { recursive: true });
    const temporaryPath = `${this.originalEnvironmentPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(environment, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.originalEnvironmentPath);
  }

  private async writeJournal(journal: SwitchJournal): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
    await rename(temporaryPath, this.statePath);
  }

  private async clearJournal(): Promise<void> {
    await rm(this.statePath, { force: true });
  }
}

export function defaultProfileStatePath(appData: string): string {
  return join(appData, "CopilotBridge", "profile-switch.json");
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
