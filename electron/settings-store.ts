import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface AppSettings {
  backendModel: string | null;
  reasoningEffort: ReasoningEffort | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  backendModel: null,
  reasoningEffort: null,
};

export class SettingsStore {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
  }

  async read(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as Partial<AppSettings>;
      return {
        backendModel: typeof parsed.backendModel === "string" ? parsed.backendModel : null,
        reasoningEffort: isReasoningEffort(parsed.reasoningEffort) ? parsed.reasoningEffort : null,
      };
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { ...DEFAULT_SETTINGS };
      }
      throw error;
    }
  }

  async write(next: AppSettings): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporary, this.path);
  }
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh";
}
