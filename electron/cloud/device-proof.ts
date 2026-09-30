import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  type KeyObject,
} from "node:crypto";
import type { WindowsCredentialManager } from "./token-store.js";

interface PublicDeviceJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
}

export interface DeviceKey {
  publicKeyJwk: PublicDeviceJwk;
  sign(method: string, url: string, token: string, body?: BodyInit | null): Headers;
}

export class DeviceKeyStore {
  private readonly credentials: WindowsCredentialManager;
  private readonly target: string;
  private pending: Promise<DeviceKey> | null = null;

  constructor(credentials: WindowsCredentialManager, target: string) {
    this.credentials = credentials;
    this.target = target;
  }

  get(): Promise<DeviceKey> {
    this.pending ??= this.readOrCreate().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }

  private async readOrCreate(): Promise<DeviceKey> {
    const stored = await this.credentials.read(this.target);
    let privateKey: KeyObject;
    if (stored === null) {
      const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
      privateKey = pair.privateKey;
      await this.credentials.write(
        this.target,
        privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      );
    } else {
      privateKey = createPrivateKey(stored);
    }
    if (privateKey.asymmetricKeyType !== "ec" ||
      privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
      throw new Error("Stored Cloud device key is not a P-256 private key.");
    }
    const jwk = createPublicKey(privateKey).export({ format: "jwk" });
    const publicKeyJwk: PublicDeviceJwk = {
      kty: "EC",
      crv: "P-256",
      x: jwk.x!,
      y: jwk.y!,
    };
    return {
      publicKeyJwk,
      sign(method, url, token, body) {
        if (body != null && typeof body !== "string") {
          throw new Error("Cloud signed request body must be a UTF-8 string.");
        }
        const destination = new URL(url);
        const header = Buffer.from(JSON.stringify({
          typ: "dpop+jwt",
          alg: "ES256",
          jwk: publicKeyJwk,
        })).toString("base64url");
        const claims = Buffer.from(JSON.stringify({
          htm: method.toUpperCase(),
          htu: `${destination.origin}${destination.pathname}`,
          iat: Math.floor(Date.now() / 1000),
          jti: randomUUID(),
          ath: digest(token),
          bth: digest(body ?? ""),
        })).toString("base64url");
        const signingInput = `${header}.${claims}`;
        const headers = new Headers();
        headers.set(
          "DPoP",
          `${signingInput}.${sign("sha256", Buffer.from(signingInput), {
            key: privateKey,
            dsaEncoding: "ieee-p1363",
          }).toString("base64url")}`,
        );
        return headers;
      },
    };
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}
