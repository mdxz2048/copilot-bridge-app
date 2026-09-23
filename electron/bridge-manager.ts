import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AppSettings } from "./settings-store.js";
import type { RemoteBridgeServer } from "./cloud/remote-bridge-server.js";

export interface BridgeStatus {
  state: "stopped" | "starting" | "ready" | "failed";
  message: string;
  endpoint: string;
}

export interface BridgeModel {
  id: string;
  supportsReasoningEffort: boolean;
}

export class BridgeManager {
  private process: ChildProcessWithoutNullStreams | null = null;
  private status: BridgeStatus;
  private processOutput = "";
  private readonly userDataPath: string;
  private readonly proxyEntrypoint: string;
  private readonly nodePath: string;
  private readonly runtimePath: string;
  private readonly workingDirectory: string;
  private readonly port: number;
  private readonly remoteBridge: RemoteBridgeServer | null;

  constructor(
    userDataPath: string,
    proxyEntrypoint: string,
    nodePath: string,
    runtimePath: string,
    workingDirectory: string,
    port = 8787,
    remoteBridge: RemoteBridgeServer | null = null,
  ) {
    this.userDataPath = userDataPath;
    this.proxyEntrypoint = proxyEntrypoint;
    this.nodePath = nodePath;
    this.runtimePath = runtimePath;
    this.workingDirectory = workingDirectory;
    this.port = port;
    this.remoteBridge = remoteBridge;
    this.status = {
      state: "stopped",
      message: "Copilot Bridge 未启动",
      endpoint: `http://127.0.0.1:${String(port)}`,
    };
  }

  getStatus(): BridgeStatus {
    return this.status;
  }

  async start(settings: AppSettings): Promise<BridgeStatus> {
    if (settings.backendMode === "REMOTE") {
      if (!this.remoteBridge) {
        this.status = {
          ...this.status,
          state: "failed",
          message: "Cloud Bridge 尚未配置。",
        };
        return this.status;
      }
      if (this.process) await this.stopLocal();
      const remote = await this.remoteBridge.start();
      this.status = { ...remote };
      return this.status;
    }
    if (this.remoteBridge?.getStatus().state !== "stopped") {
      await this.remoteBridge?.stop();
    }
    if (this.process) return this.status;
    this.status = { ...this.status, state: "starting", message: "正在启动 Copilot Bridge…" };
    this.processOutput = "";
    const configPath = await this.writeConfig(settings);
    const environment = {
      ...process.env,
      COPILOT_CLI_PATH: this.runtimePath,
    };
    const child = spawn(
      this.nodePath,
      [
        this.proxyEntrypoint,
        "start",
        "--provider",
        "codex",
        "--port",
        String(this.port),
        "--config",
        configPath,
        "--cwd",
        this.workingDirectory,
        "--log-level",
        "warning",
      ],
      { env: environment, windowsHide: true, stdio: "pipe" },
    );
    this.process = child;
    child.stdout.on("data", (chunk: Buffer) => {
      this.appendProcessOutput(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      this.appendProcessOutput(chunk.toString());
    });
    child.on("exit", (code) => {
      if (this.process !== child) return;
      this.process = null;
      if (this.status.state !== "stopped") {
        this.status = {
          ...this.status,
          state: "failed",
          message: this.failureMessage(`Copilot Bridge 已退出（代码 ${String(code ?? -1)}）`),
        };
      }
    });

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      await delay(300);
      if (await this.isHealthy()) {
        this.status = { ...this.status, state: "ready", message: "Copilot Bridge 正常" };
        return this.status;
      }
      if (!this.process) break;
    }
    await this.stop();
    this.status = { ...this.status, state: "failed", message: this.failureMessage("Copilot Bridge 启动失败") };
    return this.status;
  }

  async stop(): Promise<BridgeStatus> {
    await this.stopLocal();
    await this.remoteBridge?.stop();
    this.status = { ...this.status, state: "stopped", message: "Copilot Bridge 未启动" };
    return this.status;
  }

  private async stopLocal(): Promise<void> {
    const child = this.process;
    this.process = null;
    if (child && child.exitCode === null) {
      child.kill();
      await waitForExit(child, 3_000);
    }
  }

  async restart(settings: AppSettings): Promise<BridgeStatus> {
    await this.stop();
    return this.start(settings);
  }

  async models(): Promise<BridgeModel[]> {
    if (this.remoteBridge?.getStatus().state === "ready") {
      return this.remoteBridge.models();
    }
    if (!(await this.isHealthy())) {
      throw new Error("Copilot Bridge 当前不可用。");
    }
    const response = await fetch(`${this.status.endpoint}/bridge/models`);
    if (!response.ok) throw new Error("无法获取 GitHub Copilot 模型列表。");
    const payload = await response.json() as { data: BridgeModel[] };
    return payload.data;
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.status.endpoint}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async writeConfig(settings: AppSettings): Promise<string> {
    const directory = join(this.userDataPath, "bridge");
    await mkdir(directory, { recursive: true });
    const path = join(directory, "config.json5");
    const backendModel = settings.backendModel ? `backendModel: ${JSON.stringify(settings.backendModel)},` : "";
    const effort = settings.reasoningEffort ? `reasoningEffort: ${JSON.stringify(settings.reasoningEffort)},` : "";
    const config = `{
  codex: { mcpServers: {}, ${backendModel} ${effort} },
  openai: { mcpServers: {} },
  claude: { mcpServers: {} },
  allowedCliTools: [],
  autoApprovePermissions: false,
  bodyLimit: 10,
  requestTimeout: 0,
}
`;
    await writeFile(path, config, "utf8");
    return path;
  }

  private appendProcessOutput(text: string): void {
    this.processOutput = `${this.processOutput}${text}`.slice(-1200);
  }

  private failureMessage(fallback: string): string {
    const message = this.processOutput.replace(/\s+/g, " ").trim();
    return message ? `${fallback}：${message}` : fallback;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForExit(child: ChildProcessWithoutNullStreams, timeoutMilliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMilliseconds);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
