import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type AuthState = "idle" | "starting" | "waiting" | "completed" | "failed";

export interface AuthStatus {
  state: AuthState;
  deviceCode?: string;
  verificationUrl?: string;
  message: string;
}

export type AuthStatusHandler = (status: AuthStatus) => void;

export function resolvePackagedRuntime(
  resourcesPath: string,
  configuredPath: string | undefined,
): string {
  const runtimePath = configuredPath ?? join(resourcesPath, "copilot-runtime", "copilot.exe");
  if (!existsSync(runtimePath)) {
    throw new Error(
      "The official GitHub Copilot runtime is unavailable. Reinstall Copilot Bridge or configure its packaged runtime.",
    );
  }
  return runtimePath;
}

export function parseDeviceFlowOutput(output: string): Pick<AuthStatus, "deviceCode" | "verificationUrl"> {
  const verificationUrl = output.match(/https:\/\/[^\s"'<>]+/i)?.[0];
  const deviceCode = output.match(/(?:device\s*code|code)\s*(?::|is)?\s*([A-Z0-9]{4,}(?:-[A-Z0-9]{2,})*)/i)?.[1];
  return {
    ...(deviceCode && { deviceCode }),
    ...(verificationUrl && { verificationUrl }),
  };
}

export class CopilotAuthController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private output = "";
  private verificationUrlOpened = false;
  private readonly runtimePath: string;
  private readonly onStatus: AuthStatusHandler;
  private readonly openBrowser: (url: string) => Promise<void>;

  constructor(
    runtimePath: string,
    onStatus: AuthStatusHandler,
    openBrowser: (url: string) => Promise<void>,
  ) {
    this.runtimePath = runtimePath;
    this.onStatus = onStatus;
    this.openBrowser = openBrowser;
  }

  start(): void {
    if (this.process) {
      throw new Error("GitHub Copilot sign-in is already in progress.");
    }

    this.output = "";
    this.verificationUrlOpened = false;
    this.onStatus({ state: "starting", message: "Starting GitHub Copilot sign-in..." });
    this.process = spawn(this.runtimePath, ["login"], {
      windowsHide: true,
      stdio: "pipe",
    });
    this.process.stdout.on("data", (chunk: Buffer) => this.consumeOutput(chunk.toString()));
    this.process.stderr.on("data", (chunk: Buffer) => this.consumeOutput(chunk.toString()));
    this.process.on("error", (error) => {
      this.process = null;
      this.onStatus({ state: "failed", message: error.message });
    });
    this.process.on("exit", (code) => {
      this.process = null;
      this.onStatus(
        code === 0
          ? { state: "completed", message: "GitHub Copilot sign-in completed." }
          : { state: "failed", message: "GitHub Copilot sign-in did not complete." },
      );
    });
  }

  cancel(): void {
    this.process?.kill();
  }

  private consumeOutput(chunk: string): void {
    this.output += chunk;
    const parsed = parseDeviceFlowOutput(this.output);
    if (parsed.verificationUrl && !this.verificationUrlOpened) {
      this.verificationUrlOpened = true;
      void this.openBrowser(parsed.verificationUrl);
    }
    this.onStatus({
      state: "waiting",
      ...parsed,
      message: parsed.deviceCode
        ? "Enter the displayed device code in your browser to authorize Copilot Bridge."
        : "Waiting for the official GitHub Copilot sign-in flow.",
    });
  }
}
