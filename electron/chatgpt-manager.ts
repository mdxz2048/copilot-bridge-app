import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";
import { chatGptRestartCommand, chatGptRestartError } from "./chatgpt-restart.js";
import { installOfficialClient } from "./official-client-installer.js";

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
  downloadAvailable?: boolean;
}

type CommandExecutor = (file: string, args: string[], options?: { timeout?: number; windowsHide?: boolean }) => Promise<{ stdout: string; stderr: string }>;
interface ManagerOptions { execute?: CommandExecutor; spawnInstaller?: () => ChildProcessWithoutNullStreams; installationPollMs?: number; installationAttempts?: number; installerTimeoutMs?: number; offlineFetch?: typeof fetch }

export class ChatGptManager {
  private installProcess: ChildProcessWithoutNullStreams | null = null;
  private installTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly onDiagnostic: ((message: string) => void) | undefined;
  private readonly execute: CommandExecutor;
  private readonly options: ManagerOptions;
  private installAttempt = 0;
  private installing = false;
  private offlineInstalling = false;
  private offlineAbort: AbortController | undefined;
  private offlineSystemInstall = false;

  constructor(onDiagnostic?: (message: string) => void, options: ManagerOptions = {}) {
    this.onDiagnostic = onDiagnostic;
    this.options = options;
    this.execute = options.execute ?? (async (file, args, settings) => execFileAsync(file, args, { ...settings, encoding: "utf8", windowsHide: true }));
  }

  async detect(): Promise<ChatGptStatus> {
    try {
      const { stdout } = await this.execute(windowsPowerShell, [
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

  install(onStatus: (status: ChatGptStatus) => void, openStore: () => Promise<void>, openDownload?: () => Promise<void>): void {
    if (this.installing) {
      throw new Error("ChatGPT 安装已在进行中。");
    }
    this.installing = true;
    const attempt = ++this.installAttempt;
    onStatus({ state: "INSTALLING", step: "CHECKING", message: "正在检查系统环境…" });
    onStatus({ state: "INSTALLING", step: "INSTALLING", message: "正在通过官方 Microsoft Store 安装…" });
    const child = this.options.spawnInstaller?.() ?? spawn(
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
    // winget progress output can fill a pipe and block installation if it is not drained.
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    this.installProcess = child;
    this.installTimeout = setTimeout(() => {
      if (this.installProcess !== child) return;
      child.kill();
      this.installProcess = null;
      this.clearInstallTimeout();
      void this.storeFallback(onStatus, openStore, openDownload, attempt);
    }, this.options.installerTimeoutMs ?? 60_000);
    child.on("error", async () => {
      if (this.installProcess !== child) return;
      this.clearInstallTimeout();
      this.installProcess = null;
      await this.storeFallback(onStatus, openStore, openDownload, attempt);
    });
    child.on("exit", async (code) => {
      if (this.installProcess !== child) return;
      this.clearInstallTimeout();
      this.installProcess = null;
      const status = await this.detect();
      if (status.state === "INSTALLED") {
        this.installing = false;
        onStatus({ ...status, step: "VERIFYING", message: "正在验证 ChatGPT 安装…" });
        onStatus(status);
      } else {
        this.onDiagnostic?.(`Official installer exited: ${String(code)}`);
        await this.storeFallback(onStatus, openStore, openDownload, attempt);
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

  async installOffline(directory: string, onStatus: (status: ChatGptStatus) => void): Promise<void> {
    if(this.offlineInstalling) throw new Error("官方安装包正在下载或安装，请稍候。");
    // Take over a Store watcher, but never terminate any official client process.
    this.cancelInstall();
    this.offlineInstalling=true;this.installing=true;this.offlineAbort=new AbortController();
    try {
      const existing=await this.detect();
      if(existing.state==="INSTALLED"){onStatus(existing);return;}
      await installOfficialClient(directory,{execute:this.execute,fetch:this.options.offlineFetch,signal:this.offlineAbort.signal,installationStarted:()=>{this.offlineSystemInstall=true;},progress:message=>onStatus({state:"INSTALLING",step:"INSTALLING",message})});
      onStatus({state:"INSTALLING",step:"VERIFYING",message:"正在确认 ChatGPT 安装结果…"});
      const status=await this.detect();
      if(status.state!=="INSTALLED")throw new Error("安装已执行，但尚未检测到 ChatGPT 注册成功。请检查 Windows 安装策略后重试。");
      onStatus(status);
    } catch(error) {
      const detail=this.offlineAbort?.signal.aborted ? "已取消安装包下载。" : error instanceof Error ? error.message : "Windows 安装操作失败。";
      const message=detail.startsWith("Command failed:")?"离线安装未完成。请允许管理员授权，并检查 Windows 应用安装策略；可重试下载安装。":detail;
      this.onDiagnostic?.("Official offline installation failed");
      onStatus({state:"ERROR",downloadAvailable:true,message});
    } finally {this.offlineInstalling=false;this.installing=false;this.offlineAbort=undefined;this.offlineSystemInstall=false;}
  }

  async restart(): Promise<void> {
    const status = await this.detect();
    if (status.state !== "INSTALLED" || !status.appId) throw new Error("尚未检测到可重启的 ChatGPT。");
    this.onDiagnostic?.("ChatGPT restart requested; Bridge remains running");
    try {
      await this.execute(windowsPowerShell, chatGptRestartCommand(process.pid, status.appId), { timeout: 30000, windowsHide: true });
    } catch (error) {
      const message = chatGptRestartError(error);
      this.onDiagnostic?.(message);
      throw new Error(message);
    }
    await this.launch();
    this.onDiagnostic?.("ChatGPT restart launch completed");
  }

  cancelInstall(): boolean {
    // Windows owns the elevated deployment once it starts. Do not pretend to cancel it.
    if(this.offlineSystemInstall)return false;
    this.offlineAbort?.abort();
    this.installing = false;
    this.installAttempt++;
    this.clearInstallTimeout();
    const child = this.installProcess;
    this.installProcess = null;
    if (child && child.exitCode === null) {
      child.kill();
    }
    return true;
  }

  static storeUri(): string {
    return `ms-windows-store://pdp/?ProductId=${officialStoreProductId}`;
  }

  static downloadPageUri(): string { return "https://ai.mddxz.top/download#chatgpt"; }

  private async storeFallback(onStatus: (status: ChatGptStatus) => void, openStore: () => Promise<void>, openDownload: (() => Promise<void>) | undefined, attempt: number): Promise<void> {
    if (attempt !== this.installAttempt) return;
    try {
      await openStore();
      if (attempt !== this.installAttempt) return;
      onStatus({ state: "INSTALLING", step: "WAITING_FOR_STORE", downloadAvailable: true, message: "已打开 Microsoft Store；商店无法连接时，可以点击“下载安装包”离线安装。" });
      await this.waitForInstallation(onStatus, openDownload, attempt);
    } catch {
      await this.downloadFallback(onStatus, openDownload, attempt);
    }
  }

  private async downloadFallback(onStatus: (status: ChatGptStatus) => void, openDownload: (() => Promise<void>) | undefined, attempt: number): Promise<void> {
    if (attempt !== this.installAttempt) return;
    this.installing = false;
    if (openDownload) try { await openDownload(); } catch { /* The visible button permits a later retry. */ }
    if (attempt !== this.installAttempt) return;
    onStatus({ state: "ERROR", downloadAvailable: true, message: "Microsoft Store 未能完成安装。请点击“下载安装包”，使用官网提供的官方离线安装包。" });
  }

  private async waitForInstallation(onStatus: (status: ChatGptStatus) => void, openDownload: (() => Promise<void>) | undefined, installAttempt: number): Promise<void> {
    for (let attempt = 0; attempt < (this.options.installationAttempts ?? 18); attempt += 1) {
      await delay(this.options.installationPollMs ?? 5_000);
      if (installAttempt !== this.installAttempt) return;
      onStatus({ state: "INSTALLING", step: "WAITING_FOR_STORE", downloadAvailable: true, message: "正在等待 ChatGPT 安装；商店不可用时可以下载安装包。" });
      const status = await this.detect();
      if (installAttempt !== this.installAttempt) return;
      if (status.state === "INSTALLED") {
        this.installing = false;
        onStatus({ ...status, step: "VERIFYING", message: "正在验证 ChatGPT 安装…" });
        onStatus(status);
        return;
      }
    }
    await this.downloadFallback(onStatus, openDownload, installAttempt);
  }

  private async isOfficialStorePackageInstalled(): Promise<boolean | undefined> {
    try {
      await this.execute("winget.exe", [
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
