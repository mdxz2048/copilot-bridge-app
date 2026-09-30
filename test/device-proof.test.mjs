import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import test from "node:test";
import { StaticCloudConfigurationProvider } from "../dist-electron/cloud/cloud-config.js";
import { CloudFoundation } from "../dist-electron/cloud/cloud-foundation.js";
import { CLOUD_CONTRACT_VERSION, GatewayV1LoginResponseSchema, LoginResponseSchema } from "../dist-electron/cloud/contract.js";
import { DeviceKeyStore } from "../dist-electron/cloud/device-proof.js";
import { HttpCloudClient } from "../dist-electron/cloud/http-cloud-client.js";
import { CloudTokenSession, WindowsCredentialManagerTokenStore } from "../dist-electron/cloud/token-store.js";

const deviceId = "11111111-1111-4111-8111-111111111111";
const device = {
  deviceId,
  deviceName: "test-device",
  platform: "win32",
  osVersion: "11",
  appVersion: "0.1.0",
};
const user = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "user@example.test",
  role: "USER",
  status: "ACTIVE",
};
const loginResponse = {
  accessToken: "access-1",
  refreshToken: "refresh-1",
  expiresIn: 1800,
  user,
  device: {
    ...device,
    id: "33333333-3333-4333-8333-333333333333",
    userId: user.id,
    status: "ACTIVE",
    activatedAt: "2026-09-29T00:00:00.000Z",
    lastSeenAt: null,
  },
};

class MemoryVault {
  values = new Map();
  async read(target) { return this.values.get(target) ?? null; }
  async write(target, secret) { this.values.set(target, secret); }
  async delete(target) { this.values.delete(target); }
}

const hash = (value) => createHash("sha256").update(value).digest("base64url");

test("keeps the V1 login wire shape distinct from the V2 2.3 contract", () => {
  assert.equal(CLOUD_CONTRACT_VERSION, "2.3.0");
  assert.deepEqual(LoginResponseSchema.parse(loginResponse), GatewayV1LoginResponseSchema.parse(loginResponse));
  assert.equal(LoginResponseSchema.safeParse({
    ...loginResponse,
    device: { ...loginResponse.device, status: "BLOCKED", updatedAt: "2026-09-29T00:00:00.000Z" },
  }).success, false);
});

test("matches the shared DPoP refresh token and body hash fixture", () => {
  const body = JSON.stringify({ refreshToken: "refresh-test-token" });
  assert.equal(body, '{"refreshToken":"refresh-test-token"}');
  assert.equal(hash("refresh-test-token"), "a9NvkD8F1Pm5JZ2kqTM8zBipjvOSo6d6RAV4wkNr6fY");
  assert.equal(hash(body), "PIxtSTgvPbTBy0SAq2rSoquHP0tUn82ga1vDtnQ-89k");
  const claims = JSON.stringify({
    htm: "POST",
    htu: "https://cloud.example.test/api/v1/auth/refresh",
    iat: 1790670000,
    jti: "11111111-1111-4111-8111-111111111111",
    ath: hash("refresh-test-token"),
    bth: hash(body),
  });
  assert.equal(
    Buffer.from(claims).toString("base64url"),
    "eyJodG0iOiJQT1NUIiwiaHR1IjoiaHR0cHM6Ly9jbG91ZC5leGFtcGxlLnRlc3QvYXBpL3YxL2F1dGgvcmVmcmVzaCIsImlhdCI6MTc5MDY3MDAwMCwianRpIjoiMTExMTExMTEtMTExMS00MTExLTgxMTEtMTExMTExMTExMTExIiwiYXRoIjoiYTlOdmtEOEYxUG01Sloya3FUTTh6QmlwanZPU282ZDZSQVY0d2tOcjZmWSIsImJ0aCI6IlBJeHRTVGd2UGJUQnkwU0FxMnJTb3F1SFAwdFVuODJnYTF2RHRuUS04OWsifQ",
  );
});

test("matches the server's bearer and empty-body DPoP vectors", () => {
  assert.equal(
    hash("test-token"),
    "TF3Jt3CJBfd_Xl0WMWtd-0JeaMsybc1VqGDpCncHAx4",
  );
  assert.equal(
    hash('{"model":"mock/mock-chat","input":"Hi"}'),
    "OLciEt12i9omEznk-GfwPKda8mX6tCeCxZcJTxbKbWc",
  );
  assert.equal(
    hash(""),
    "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
  );
  const htu = new URL("https://example.test/v1/responses?stream=true");
  assert.equal(`${htu.origin}${htu.pathname}`, "https://example.test/v1/responses");
});

function checkProof(url, init, publicKeyJwk, token, body) {
  const headers = new Headers(init.headers);
  const encoded = headers.get("DPoP");
  assert.ok(encoded);
  const parts = encoded.split(".");
  assert.equal(parts.length, 3);
  const [protectedHeader, payload, signature] = parts;
  const header = JSON.parse(Buffer.from(protectedHeader, "base64url").toString("utf8"));
  assert.deepEqual(header, { typ: "dpop+jwt", alg: "ES256", jwk: publicKeyJwk });
  assert.equal(Buffer.from(signature, "base64url").length, 64);
  const proof = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.deepEqual(Object.keys(proof), ["htm", "htu", "iat", "jti", "ath", "bth"]);
  assert.equal(proof.htm, init.method ?? "GET");
  const destination = new URL(url);
  assert.equal(proof.htu, `${destination.origin}${destination.pathname}`);
  assert.ok(Math.abs(Date.now() / 1000 - proof.iat) < 10);
  assert.match(proof.jti, /^[0-9a-f-]{36}$/);
  assert.equal(proof.ath, hash(token));
  assert.equal(proof.bth, hash(body));
  assert.equal(
    verify("sha256", Buffer.from(`${protectedHeader}.${payload}`), {
      key: createPublicKey({ key: publicKeyJwk, format: "jwk" }),
      dsaEncoding: "ieee-p1363",
    }, Buffer.from(signature, "base64url")),
    true,
  );
  assert.notEqual(proof.ath, hash(`${token}-wrong`));
  assert.notEqual(proof.bth, hash(`${body}-tampered`));
  for (const tampered of [
    { ...proof, ath: hash(`${token}-wrong`) },
    { ...proof, bth: hash(`${body}-tampered`) },
  ]) {
    assert.equal(
      verify("sha256", Buffer.from(`${protectedHeader}.${Buffer.from(JSON.stringify(tampered)).toString("base64url")}`), {
        key: createPublicKey({ key: publicKeyJwk, format: "jwk" }),
        dsaEncoding: "ieee-p1363",
      }, Buffer.from(signature, "base64url")),
      false,
    );
  }
  return proof;
}

test("registers persistent vault-backed P-256 JWK and signs refresh, JSON and SSE", async () => {
  const vault = new MemoryVault();
  const keys = new DeviceKeyStore(vault, "device-key");
  const tokens = new CloudTokenSession(
    new WindowsCredentialManagerTokenStore(vault, "refresh-token"),
  );
  let publicKeyJwk;
  const seen = [];
  const client = new HttpCloudClient({
    baseUrl: "https://cloud.example.test",
    tokens,
    devices: { async get() { return device; } },
    deviceKeys: keys,
    fetch: async (input, init) => {
      const url = String(input);
      const body = String(init.body ?? "");
      if (url.endsWith("/api/v1/auth/login")) {
        const login = JSON.parse(body);
        assert.deepEqual({ ...login.device, publicKeyJwk: undefined }, {
          ...device, publicKeyJwk: undefined,
        });
        publicKeyJwk = login.device.publicKeyJwk;
        assert.deepEqual(Object.keys(publicKeyJwk), ["kty", "crv", "x", "y"]);
        assert.equal(new Headers(init.headers).has("DPoP"), false);
        assert.equal(init.redirect, "manual");
        return Response.json(loginResponse);
      }
      const token = url.endsWith("/api/v1/auth/refresh")
        ? JSON.parse(body).refreshToken
        : new Headers(init.headers).get("Authorization").slice(7);
      const proof = checkProof(url, init, publicKeyJwk, token, body);
      seen.push(proof);
      assert.equal(init.redirect, "manual");
      if (url.endsWith("/api/v1/auth/refresh")) {
        return Response.json({
          accessToken: "access-2",
          refreshToken: "refresh-2",
          expiresIn: 1800,
        });
      }
      if (url.endsWith("/api/v1/me")) {
        return Response.json({
          account: { id: user.id, email: user.email, status: "ACTIVE" },
          subscription: null,
          wallet: { balance: 0, unit: "AI_POINT" },
          activeDevices: 1,
        });
      }
      if (url.endsWith("/v1/responses")) {
        assert.equal(new Headers(init.headers).get("X-Device-ID"), deviceId);
        return new Response("data: [DONE]\n\n", {
          headers: { "content-type": "text/event-stream" },
        });
      }
      throw new Error(`Unexpected path ${url}`);
    },
  });

  await client.login({ email: user.email, password: "pass", device });
  assert.equal(vault.values.size, 2);
  assert.ok(vault.values.get("device-key").includes("PRIVATE KEY"));
  assert.deepEqual((await new DeviceKeyStore(vault, "device-key").get()).publicKeyJwk, publicKeyJwk);
  checkProof(
    "https://cloud.example.test/api/v1/me?ignored=yes#fragment",
    { method: "GET", headers: (await keys.get()).sign(
      "GET", "https://cloud.example.test/api/v1/me?ignored=yes#fragment", "access-1",
    ) },
    publicKeyJwk,
    "access-1",
    "",
  );
  await client.refresh();
  await client.getMeV2();
  const transport = await client.createResponse(
    { model: "mock", input: "hello", stream: true },
    { threadId: "thread-1" },
  );
  assert.match(transport.contentType, /event-stream/);
  assert.equal(seen.length, 3);
  assert.equal(new Set(seen.map((proof) => proof.jti)).size, 3);
  assert.equal(seen[0].ath, hash("refresh-1"));
  assert.equal(seen[1].ath, hash("access-2"));
  assert.equal(seen[2].bth, hash(JSON.stringify({
    model: "mock", input: "hello", stream: true,
  })));
});

test("CloudFoundation.login registers the same signed device key, and rejects key mismatch", async () => {
  for (const mismatch of [false, true]) {
    const vault = new MemoryVault();
    const keys = new DeviceKeyStore(vault, "device-key");
    const tokens = new CloudTokenSession(
      new WindowsCredentialManagerTokenStore(vault, "refresh-token"),
    );
    let loginKey;
    let registrationCalls = 0;
    let accountCalls = 0;
    const client = new HttpCloudClient({
      baseUrl: "https://cloud.example.test",
      tokens,
      devices: { async get() { return device; } },
      deviceKeys: keys,
      fetch: async (input, init) => {
        const url = String(input);
        if (url.endsWith("/auth/login")) {
          loginKey = JSON.parse(init.body).device.publicKeyJwk;
          return Response.json(loginResponse);
        }
        assert.ok(url.endsWith("/devices/register"), `unexpected endpoint: ${url}`);
        registrationCalls++;
        const body = String(init.body);
        const payload = JSON.parse(body);
        assert.deepEqual(Object.keys(payload), [
          "deviceId", "deviceName", "platform", "osVersion", "appVersion", "publicKeyJwk",
        ]);
        assert.deepEqual(payload.publicKeyJwk, loginKey);
        checkProof(url, init, loginKey, "access-1", body);
        const expectedKey = mismatch
          ? (await new DeviceKeyStore(new MemoryVault(), "other-device-key").get()).publicKeyJwk
          : loginKey;
        if (JSON.stringify(payload.publicKeyJwk) !== JSON.stringify(expectedKey)) {
          return Response.json({ error: {
            code: "FORBIDDEN", message: "Device key mismatch", requestId: "request-1",
          } }, { status: 403 });
        }
        return Response.json({ device: loginResponse.device });
      },
    });
    client.getMeV2 = async () => {
      accountCalls++;
      return {
        account: { id: user.id, email: user.email, status: "ACTIVE" },
        subscription: null,
        wallet: { balance: 0, unit: "AI_POINT" },
        activeDevices: 1,
      };
    };
    client.listDevicesV2 = async () => [];
    client.listWalletTransactions = async () => [];
    client.getUsageV2 = async () => null;
    client.getUsageHistory = async () => [];
    client.getReferralSummary = async () => null;
    client.getReferralHistory = async () => [];
    client.listProviderConnections = async () => [];
    client.listProviders = async () => [];
    client.getClientConfig = async () => ({
      features: {}, minimumVersion: "0.1.0", latestVersion: "0.1.0",
    });
    client.getLatestRelease = async () => ({ release: null });
    const foundation = new CloudFoundation(
      client,
      new StaticCloudConfigurationProvider({
        contractStatus: "READY", runtimeMode: "TEST",
        gatewayBaseUrl: "https://cloud.example.test",
        accountManagementUrl: null, subscriptionManagementUrl: null,
      }),
      { async get() { return device; } },
      "0.1.0",
    );
    if (mismatch) {
      await assert.rejects(
        foundation.login({ email: user.email, password: "pass" }),
        (error) => error.code === "FORBIDDEN" && error.httpStatus === 403,
      );
      assert.equal(accountCalls, 0, "key rejection must prevent account loading");
    } else {
      const status = await foundation.login({ email: user.email, password: "pass" });
      assert.equal(status.authState, "AUTHENTICATED");
      assert.equal(status.account, user.email);
      assert.equal(accountCalls, 1);
    }
    assert.equal(registrationCalls, 1);
  }
});

test("concurrent expired requests share one signed token rotation and retry with the new token", async () => {
  const vault = new MemoryVault();
  const keys = new DeviceKeyStore(vault, "device-key");
  const tokens = new CloudTokenSession(
    new WindowsCredentialManagerTokenStore(vault, "refresh-token"),
  );
  await tokens.rotate({ accessToken: "access-1", refreshToken: "refresh-1" });
  const publicKey = (await keys.get()).publicKeyJwk;
  let refreshCalls = 0;
  let releaseRefresh;
  const waitingForRefresh = new Promise((resolve) => { releaseRefresh = resolve; });
  let signalRefresh;
  const refreshStarted = new Promise((resolve) => { signalRefresh = resolve; });
  let oldRequests = 0;
  let signalOldRequests;
  const bothOldRequests = new Promise((resolve) => { signalOldRequests = resolve; });
  const client = new HttpCloudClient({
    baseUrl: "https://cloud.example.test",
    tokens,
    devices: { async get() { return device; } },
    deviceKeys: keys,
    fetch: async (input, init) => {
      const url = String(input);
      const headers = new Headers(init.headers);
      const token = url.endsWith("/auth/refresh")
        ? JSON.parse(init.body).refreshToken
        : headers.get("Authorization").slice(7);
      checkProof(url, init, publicKey, token, String(init.body ?? ""));
      if (url.endsWith("/auth/refresh")) {
        refreshCalls++;
        signalRefresh();
        await waitingForRefresh;
        return Response.json({
          accessToken: `access-${refreshCalls + 1}`,
          refreshToken: `refresh-${refreshCalls + 1}`,
          expiresIn: 1800,
        });
      }
      if (token === "access-1") {
        if (++oldRequests === 2) signalOldRequests();
        return Response.json({ error: {
          code: "TOKEN_EXPIRED", message: "Expired", requestId: "request-1",
        } }, { status: 401 });
      }
      return Response.json({
        account: { id: user.id, email: user.email, status: "ACTIVE" },
        subscription: null,
        wallet: { balance: 0, unit: "AI_POINT" },
        activeDevices: 1,
      });
    },
  });
  const requests = [client.getMeV2(), client.getMeV2()];
  await Promise.all([refreshStarted, bothOldRequests]);
  releaseRefresh();
  const results = await Promise.all(requests);
  assert.equal(results.length, 2);
  assert.equal(refreshCalls, 1);
  assert.equal(await tokens.readRefreshToken(), "refresh-2");
  await client.refresh();
  assert.equal(refreshCalls, 2);
  assert.equal(await tokens.readRefreshToken(), "refresh-3");
});

test("JSON response, SSE tool call and tool continuation each carry a fresh signed body", async () => {
  const vault = new MemoryVault();
  const keys = new DeviceKeyStore(vault, "device-key");
  const tokens = new CloudTokenSession(
    new WindowsCredentialManagerTokenStore(vault, "refresh-token"),
  );
  await tokens.rotate({ accessToken: "access-1", refreshToken: "refresh-1" });
  const publicKey = (await keys.get()).publicKeyJwk;
  const bodies = [];
  const ids = [];
  const client = new HttpCloudClient({
    baseUrl: "https://cloud.example.test",
    tokens,
    devices: { async get() { return device; } },
    deviceKeys: keys,
    fetch: async (url, init) => {
      const headers = new Headers(init.headers);
      assert.equal(headers.get("X-Client-Thread-ID"), "thread-1");
      assert.equal(headers.get("X-Device-ID"), deviceId);
      const body = String(init.body);
      ids.push(checkProof(String(url), init, publicKey, "access-1", body).jti);
      bodies.push(JSON.parse(body));
      if (bodies.length === 1) return Response.json({ output: [{ type: "message", content: "Hi" }] });
      if (bodies.length === 2) return new Response(
        'event: response.output_item.added\ndata: {"item":{"type":"function_call","call_id":"call-1"}}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
      return new Response(
        'event: response.completed\ndata: {"response":{"output":[{"type":"message","content":"Done"}]}}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
    },
  });
  const json = await client.createResponse({ model: "mock", input: "Hi" }, { threadId: "thread-1" });
  assert.match(json.contentType, /application\/json/);
  assert.equal((await json.response.json()).output[0].content, "Hi");
  const stream = await client.createResponse({
    model: "mock", input: "Use the tool", stream: true,
    tools: [{ type: "function", name: "read_file", parameters: { type: "object" } }],
  }, { threadId: "thread-1" });
  assert.match(stream.contentType, /event-stream/);
  assert.match(await stream.response.text(), /call-1/);
  const continuation = await client.createResponse({
    model: "mock", input: [{ type: "function_call_output", call_id: "call-1", output: "marker" }],
    stream: true,
  }, { threadId: "thread-1" });
  assert.match(await continuation.response.text(), /response.completed/);
  assert.equal(bodies[2].input[0].output, "marker");
  assert.equal(new Set(ids).size, 3);
});

test("missing or broken vault never allows login, refresh or bearer requests", async () => {
  const broken = {
    async read() { throw new Error("vault inaccessible"); },
    async write() { throw new Error("vault inaccessible"); },
  };
  let calls = 0;
  const tokens = new CloudTokenSession({
    async readRefreshToken() { return "refresh-token"; },
    async writeRefreshToken() {},
    async deleteRefreshToken() {},
  });
  const client = new HttpCloudClient({
    baseUrl: "https://cloud.example.test",
    tokens,
    devices: { async get() { return device; } },
    deviceKeys: new DeviceKeyStore(broken, "missing-vault"),
    fetch: async () => { calls++; return Response.json({}); },
  });
  await assert.rejects(client.login({ email: user.email, password: "pass", device }), /vault inaccessible/);
  await assert.rejects(client.refresh(), /vault inaccessible/);
  await tokens.rotate({ accessToken: "access", refreshToken: "refresh" });
  await assert.rejects(client.getMeV2(), /vault inaccessible/);
  assert.equal(calls, 0);
});

test("failed key persistence and malformed stored keys fail closed", async () => {
  const unableToWrite = new DeviceKeyStore({
    async read() { return null; },
    async write() { throw new Error("credential write failed"); },
  }, "device-key");
  await assert.rejects(unableToWrite.get(), /credential write failed/);
  await assert.rejects(unableToWrite.get(), /credential write failed/);
  const corrupt = new DeviceKeyStore({
    async read() { return "not a private key"; },
  }, "device-key");
  await assert.rejects(corrupt.get());
});

test("concurrent first-run key requests persist a single key", async () => {
  let writes = 0;
  let stored = null;
  const keys = new DeviceKeyStore({
    async read() { return stored; },
    async write(_target, secret) {
      writes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      stored = secret;
    },
  }, "concurrent-device-key");
  const [first, second, third] = await Promise.all([
    keys.get(), keys.get(), keys.get(),
  ]);
  assert.equal(writes, 1);
  assert.equal(first, second);
  assert.equal(second, third);
  assert.ok(stored.includes("PRIVATE KEY"));
});
