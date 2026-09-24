import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type AuthState =
  | "idle"
  | "requesting_code"
  | "waiting_for_user"
  | "verifying"
  | "success"
  | "no_subscription"
  | "expired"
  | "network_error"
  | "cancelled";

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

export function authStatusForExit(
  code: number | null,
  output: string,
): AuthStatus {
  if (code === 0) {
    return { state: "success", message: "GitHub Copilot 已连接。" };
  }
  if (/expired/i.test(output)) {
    return {
      state: "expired",
      message: "设备验证码已过期，请重新开始。",
    };
  }
  return {
    state: "network_error",
    message: "GitHub Copilot 登录未完成。",
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
    this.onStatus({
      state: "requesting_code",
      message: "正在向 GitHub 请求设备验证码…",
    });
    this.process = spawn(this.runtimePath, ["login"], {
      windowsHide: true,
      stdio: "pipe",
    });
    this.process.stdout.on("data", (chunk: Buffer) => this.consumeOutput(chunk.toString()));
    this.process.stderr.on("data", (chunk: Buffer) => this.consumeOutput(chunk.toString()));
    this.process.on("error", (error) => {
      this.process = null;
      this.onStatus({ state: "network_error", message: error.message });
    });
    this.process.on("exit", (code) => {
      this.process = null;
      if (code === 0) {
        this.onStatus({
          state: "verifying",
          message: "GitHub 已授权，正在检测 Copilot 订阅…",
        });
      }
      this.onStatus(authStatusForExit(code, this.output));
    });
  }

  cancel(): void {
    this.process?.kill();
    this.onStatus({ state: "cancelled", message: "已取消 GitHub Copilot 登录。" });
  }

  private consumeOutput(chunk: string): void {
    this.output += chunk;
    const parsed = parseDeviceFlowOutput(this.output);
    if (parsed.verificationUrl && !this.verificationUrlOpened) {
      this.verificationUrlOpened = true;
      void this.openBrowser(parsed.verificationUrl);
    }
    this.onStatus({
      state: parsed.deviceCode ? "waiting_for_user" : "requesting_code",
      ...parsed,
      message: parsed.deviceCode
        ? "请在 GitHub 授权页面输入设备验证码。"
        : "正在等待 GitHub 返回设备验证码。",
    });
  }
}
