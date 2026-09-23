import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const windowsPowerShell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const officialStoreProductId = "9PLM9XGG6VKS";

export type ChatGptState = "NOT_INSTALLED" | "INSTALLED" | "INSTALLING" | "ERROR";
export type ChatGptInstallStep = "CHECKING" | "INSTALLING" | "WAITING_FOR_STORE" | "VERIFYING";

export interface ChatGptStatus {
  state: ChatGptState;
  message: string;
  packageFullName?: string;
  packageFamilyName?: string;
  version?: string;
  appId?: string;
  step?: ChatGptInstallStep;
}

export class ChatGptManager {
  private installProcess: ChildProcessWithoutNullStreams | null = null;
  private installTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly onDiagnostic: ((message: string) => void) | undefined;

  constructor(onDiagnostic?: (message: string) => void) {
    this.onDiagnostic = onDiagnostic;
  }

  async detect(): Promise<ChatGptStatus> {
    try {
      const { stdout } = await execFileAsync(windowsPowerShell, [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$package = Get-AppxPackage -Name 'OpenAI.Codex' | Select-Object -First 1 Name,PackageFullName,PackageFamilyName,Version,Status; $app = Get-StartApps | Where-Object { $_.Name -eq 'ChatGPT' -and $_.AppID -like 'OpenAI.Codex_*!*' } | Select-Object -First 1 Name,AppID; $registered = Get-ChildItem 'Registry::HKEY_CURRENT_USER\\Software\\Classes\\ActivatableClasses\\Package' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like 'OpenAI.Codex_*' } | ForEach-Object { $_.PSChildName } | Sort-Object { [version](($_ -split '_')[1]) } -Descending | Select-Object -First 1; [pscustomobject]@{ package = $package; app = $app; registered = $registered } | ConvertTo-Json -Compress",
      ]);
      const parsed = JSON.parse(stdout) as {
        package?: {
          PackageFullName?: string;
          PackageFamilyName?: string;
          Version?: string;
          Status?: number;
        };
        app?: { AppID?: string };
        registered?: string;
      };
      this.onDiagnostic?.(
        `ChatGPT detection: package=${Boolean(parsed.package?.PackageFullName)} app=${Boolean(parsed.app?.AppID)} stdoutLength=${String(stdout.length)}`,
      );
      const packageUsable = Boolean(parsed.package?.PackageFullName)
        && (parsed.package?.Status === undefined || parsed.package?.Status === 0);
      const wingetInstalled = packageUsable
        ? true
        : await this.isOfficialStorePackageInstalled();
      const registeredParts = parsed.registered?.split("_");
      const registeredFamily = registeredParts && registeredParts.length >= 4
        ? `${registeredParts[0]}_${registeredParts.at(-1)}`
        : undefined;
      if (wingetInstalled === false) {
        return { state: "NOT_INSTALLED", message: "尚未安装 ChatGPT。" };
      }
      if (!packageUsable && !parsed.app?.AppID && !registeredFamily) {
        return { state: "NOT_INSTALLED", message: "尚未安装 ChatGPT。" };
      }
      const packageFamilyName = parsed.package?.PackageFamilyName ?? registeredFamily;
      const version = parsed.package?.Version;
      const appId = parsed.app?.AppID ?? (packageFamilyName ? `${packageFamilyName}!App` : undefined);
      return {
        state: "INSTALLED",
        message: "已检测到 ChatGPT。",
        ...(parsed.package?.PackageFullName && { packageFullName: parsed.package.PackageFullName }),
        ...(packageFamilyName && { packageFamilyName }),
        ...(version && { version }),
        ...(appId && { appId }),
      };
    } catch (error) {
      this.onDiagnostic?.(
        `ChatGPT detection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        state: "ERROR",
        message: error instanceof Error ? error.message : "无法检测 ChatGPT。",
      };
    }
  }

  install(onStatus: (status: ChatGptStatus) => void, openStore: () => Promise<void>): void {
    if (this.installProcess) {
      throw new Error("ChatGPT 安装已在进行中。");
    }
    onStatus({ state: "INSTALLING", step: "CHECKING", message: "正在检查系统环境…" });
    onStatus({ state: "INSTALLING", step: "INSTALLING", message: "正在通过官方 Microsoft Store 安装…" });
    const child = spawn(
      "winget.exe",
      [
        "install",
        "--id",
        officialStoreProductId,
        "--source",
        "msstore",
        "--accept-source-agreements",
        "--accept-package-agreements",
        "--disable-interactivity",
      ],
      { windowsHide: true, stdio: "pipe" },
    );
    this.installProcess = child;
    this.installTimeout = setTimeout(() => {
      if (this.installProcess !== child) return;
      child.kill();
      this.installProcess = null;
      void openStore();
      onStatus({ state: "INSTALLING", step: "WAITING_FOR_STORE", message: "官方安装未在预期时间内启动，已打开 Microsoft Store。" });
      void this.waitForInstallation(onStatus);
    }, 60_000);
    child.on("error", async () => {
      if (this.installProcess !== child) return;
      this.clearInstallTimeout();
      this.installProcess = null;
      await openStore();
      onStatus({ state: "INSTALLING", step: "WAITING_FOR_STORE", message: "已打开 Microsoft Store，正在等待安装完成…" });
      await this.waitForInstallation(onStatus);
    });
    child.on("exit", async (code) => {
      if (this.installProcess !== child) return;
      this.clearInstallTimeout();
      this.installProcess = null;
      const status = await this.detect();
      if (status.state === "INSTALLED") {
        onStatus({ ...status, step: "VERIFYING", message: "正在验证 ChatGPT 安装…" });
        onStatus(status);
      } else {
        await openStore();
        onStatus({
          state: "INSTALLING",
          step: "WAITING_FOR_STORE",
          message: code === 0
            ? "正在等待 ChatGPT 完成注册…"
            : "已打开 Microsoft Store，请完成官方安装。",
        });
        await this.waitForInstallation(onStatus);
      }
    });
  }

  async launch(): Promise<void> {
    const status = await this.detect();
    if (status.state !== "INSTALLED" || !status.appId) {
      throw new Error("尚未检测到可启动的 ChatGPT。");
    }
    const child = spawn("explorer.exe", [`shell:AppsFolder\\${status.appId}`], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }

  cancelInstall(): void {
    this.clearInstallTimeout();
    const child = this.installProcess;
    this.installProcess = null;
    if (child && child.exitCode === null) {
      child.kill();
    }
  }

  static storeUri(): string {
    return `ms-windows-store://pdp/?ProductId=${officialStoreProductId}`;
  }

  private async waitForInstallation(onStatus: (status: ChatGptStatus) => void): Promise<void> {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await delay(10_000);
      onStatus({ state: "INSTALLING", step: "WAITING_FOR_STORE", message: "正在等待 ChatGPT 完成安装…" });
      const status = await this.detect();
      if (status.state === "INSTALLED") {
        onStatus({ ...status, step: "VERIFYING", message: "正在验证 ChatGPT 安装…" });
        onStatus(status);
        return;
      }
    }
    onStatus({ state: "ERROR", message: "未能在预期时间内检测到 ChatGPT 安装完成。" });
  }

  private async isOfficialStorePackageInstalled(): Promise<boolean | undefined> {
    try {
      await execFileAsync("winget.exe", [
        "list",
        "--id",
        officialStoreProductId,
        "--source",
        "msstore",
        "--accept-source-agreements",
      ]);
      return true;
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return undefined;
      }
      return false;
    }
  }

  private clearInstallTimeout(): void {
    if (this.installTimeout) {
      clearTimeout(this.installTimeout);
      this.installTimeout = null;
    }
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
