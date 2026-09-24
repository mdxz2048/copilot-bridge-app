import assert from "node:assert/strict";
import test from "node:test";
import { performServiceSwitch } from "../dist-electron/service-switcher.js";

const previous = {
  backendModel: "gpt-5.6-terra",
  reasoningEffort: "high",
  autoLaunch: true,
  minimizeToTray: true,
  autoBridgeStart: true,
  backendMode: "LOCAL",
  providerConnectionId: null,
  theme: "system",
  onboardingCompleted: true,
};

test("switches services only after health and model validation", async () => {
  const writes = [];
  const restarts = [];
  const result = await performServiceSwitch("REMOTE", {
    readSettings: async () => previous,
    writeSettings: async (settings) => writes.push(settings),
    refreshCloud: async () => ({ authState: "AUTHENTICATED" }),
    restartBridge: async (settings) => {
      restarts.push(settings);
      return {
        state: "ready",
        message: "Cloud Bridge 正常",
        endpoint: "http://127.0.0.1:8787",
      };
    },
    listModels: async () => [{
      id: "mock/mock-chat",
      supportsReasoningEffort: false,
    }],
  });

  assert.equal(result.settings.backendMode, "REMOTE");
  assert.equal(result.settings.backendModel, "mock/mock-chat");
  assert.equal(writes.length, 1);
  assert.equal(restarts.length, 1);
});

test("rolls back without persisting a failed service switch", async () => {
  const writes = [];
  const restarts = [];
  await assert.rejects(
    performServiceSwitch("REMOTE", {
      readSettings: async () => previous,
      writeSettings: async (settings) => writes.push(settings),
      refreshCloud: async () => ({ authState: "AUTHENTICATED" }),
      restartBridge: async (settings) => {
        restarts.push(settings);
        return restarts.length === 1
          ? {
              state: "failed",
              message: "Cloud 服务不可用",
              endpoint: "http://127.0.0.1:8787",
            }
          : {
              state: "ready",
              message: "Copilot Bridge 正常",
              endpoint: "http://127.0.0.1:8787",
            };
      },
      listModels: async () => [],
    }),
    /Cloud 服务不可用/,
  );

  assert.equal(writes.length, 0);
  assert.equal(restarts.length, 2);
  assert.equal(restarts[1].backendMode, "LOCAL");
  assert.equal(restarts[1].backendModel, "gpt-5.6-terra");
});
