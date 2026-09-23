import { createHash } from "node:crypto";

export interface TokenStore {
  readRefreshToken(): Promise<string | null>;
  writeRefreshToken(token: string): Promise<void>;
  deleteRefreshToken(): Promise<void>;
}

export interface WindowsCredentialManager {
  read(target: string): Promise<string | null>;
  write(target: string, secret: string): Promise<void>;
  delete(target: string): Promise<void>;
}

export class WindowsCredentialManagerTokenStore implements TokenStore {
  private readonly credentials: WindowsCredentialManager;
  private readonly target: string;

  constructor(
    credentials: WindowsCredentialManager,
    target = "CopilotBridge.Cloud.RefreshToken",
  ) {
    this.credentials = credentials;
    this.target = target;
  }

  readRefreshToken(): Promise<string | null> {
    return this.credentials.read(this.target);
  }

  writeRefreshToken(token: string): Promise<void> {
    if (!token) throw new Error("Refresh token cannot be empty.");
    return this.credentials.write(this.target, token);
  }

  deleteRefreshToken(): Promise<void> {
    return this.credentials.delete(this.target);
  }
}

export function cloudCredentialTarget(
  baseUrl: string,
  userDataPath: string,
): string {
  const host = new URL(baseUrl).host;
  const profile = createHash("sha256")
    .update(userDataPath.toLowerCase())
    .digest("hex")
    .slice(0, 16);
  return `CopilotBridge.Cloud.RefreshToken.${host}.${profile}`;
}

export interface RotatedTokens {
  accessToken: string;
  refreshToken: string;
}

export class CloudTokenSession {
  private accessToken: string | null = null;
  private readonly refreshTokens: TokenStore;

  constructor(refreshTokens: TokenStore) {
    this.refreshTokens = refreshTokens;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  readRefreshToken(): Promise<string | null> {
    return this.refreshTokens.readRefreshToken();
  }

  async rotate(tokens: RotatedTokens): Promise<void> {
    if (!tokens.accessToken || !tokens.refreshToken) {
      throw new Error("Rotated access and refresh tokens are required.");
    }
    await this.refreshTokens.writeRefreshToken(tokens.refreshToken);
    this.accessToken = tokens.accessToken;
  }

  async clear(): Promise<void> {
    this.accessToken = null;
    await this.refreshTokens.deleteRefreshToken();
  }
}
