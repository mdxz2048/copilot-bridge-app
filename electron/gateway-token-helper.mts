import { WindowsPasswordVaultCredentialManager } from "./cloud/windows-credential-manager.js";

// A command-backed Codex credential helper. Never reports credentials in errors.
const target = process.argv[2];
if (!target?.startsWith("CopilotBridge.LocalGateway.")) process.exit(1);
try {
  const token = await new WindowsPasswordVaultCredentialManager().read(target);
  if (!token) process.exit(1);
  process.stdout.write(token);
} catch { process.stderr.write("Bridge local credential unavailable\n"); process.exit(1); }
