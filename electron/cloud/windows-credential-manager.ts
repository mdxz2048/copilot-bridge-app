import { spawn } from "node:child_process";
import type { WindowsCredentialManager } from "./token-store.js";

const CREDENTIAL_SCRIPT = String.raw`
$ErrorActionPreference = "Stop"
[void][Windows.Security.Credentials.PasswordVault,Windows.Security.Credentials,ContentType=WindowsRuntime]
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$vault = [Windows.Security.Credentials.PasswordVault]::new()
function Test-CredentialNotFound($exception) {
  $current = $exception
  while ($null -ne $current) {
    if ($current.HResult -eq -2147023728) { return $true }
    $current = $current.InnerException
  }
  return $false
}
switch ($request.operation) {
  "read" {
    try {
      $credential = $vault.Retrieve($request.target, "CopilotBridge")
      $credential.RetrievePassword()
      [Console]::Out.Write($credential.Password)
    } catch [System.Runtime.InteropServices.COMException] {
      if (Test-CredentialNotFound $_.Exception) { exit 0 }
      throw
    } catch [System.Management.Automation.MethodInvocationException] {
      if (Test-CredentialNotFound $_.Exception) { exit 0 }
      throw
    }
  }
  "write" {
    try {
      $existing = $vault.Retrieve($request.target, "CopilotBridge")
      $vault.Remove($existing)
    } catch [System.Runtime.InteropServices.COMException] {
      if (-not (Test-CredentialNotFound $_.Exception)) { throw }
    } catch [System.Management.Automation.MethodInvocationException] {
      if (-not (Test-CredentialNotFound $_.Exception)) { throw }
    }
    $vault.Add([Windows.Security.Credentials.PasswordCredential]::new(
      $request.target,
      "CopilotBridge",
      $request.secret
    ))
  }
  "delete" {
    try {
      $existing = $vault.Retrieve($request.target, "CopilotBridge")
      $vault.Remove($existing)
    } catch [System.Runtime.InteropServices.COMException] {
      if (-not (Test-CredentialNotFound $_.Exception)) { throw }
    } catch [System.Management.Automation.MethodInvocationException] {
      if (-not (Test-CredentialNotFound $_.Exception)) { throw }
    }
  }
  default { throw "Unknown credential operation" }
}
`;

export class WindowsPasswordVaultCredentialManager
  implements WindowsCredentialManager
{
  async read(target: string): Promise<string | null> {
    const output = await invokeCredentialManager({ operation: "read", target });
    return output || null;
  }

  async write(target: string, secret: string): Promise<void> {
    await invokeCredentialManager({ operation: "write", target, secret });
  }

  async delete(target: string): Promise<void> {
    await invokeCredentialManager({ operation: "delete", target });
  }
}

function invokeCredentialManager(request: {
  operation: "read" | "write" | "delete";
  target: string;
  secret?: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(CREDENTIAL_SCRIPT, "utf16le").toString(
      "base64",
    );
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encoded,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let settled=false;
    const finish=(error:Error|null,output='')=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(output);};
    const timer=setTimeout(()=>{child.kill();finish(new Error('读取或保存登录凭据等待超时，系统响应可能不稳定，请稍后重试。'));},15000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", error=>finish(error));
    child.stdin.once("error",()=>finish(new Error("无法连接系统登录凭据服务，请稍后重试。")));
    child.once("exit", (code) => {
      if (code === 0) {
        finish(null,stdout);
        return;
      }
      finish(
        new Error(
          `Windows Credential Manager operation failed: ${stderr.trim() || `exit ${String(code)}`}`,
        ),
      );
    });
    child.stdin.end(JSON.stringify(request));
  });
}
