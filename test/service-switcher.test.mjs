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
    refreshCloud: async () => ({
      authState: "AUTHENTICATED",
      serviceStatus: "AVAILABLE",
      message: "Cloud 服务已连接。",
    }),
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
      refreshCloud: async () => ({
        authState: "AUTHENTICATED",
        serviceStatus: "AVAILABLE",
        message: "Cloud 服务已连接。",
      }),
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

test("does not start Remote mode during maintenance or a required update", async () => {
  let restarts = 0;
  await assert.rejects(
    performServiceSwitch("REMOTE", {
      readSettings: async () => previous,
      writeSettings: async () => assert.fail("settings must not be written"),
      refreshCloud: async () => ({
        authState: "AUTHENTICATED",
        serviceStatus: "MAINTENANCE",
        message: "云服务正在维护，请稍后再试。",
      }),
      restartBridge: async () => {
        restarts += 1;
        return {
          state: "ready",
          message: "unexpected",
          endpoint: "http://127.0.0.1:8787",
        };
      },
      listModels: async () => [],
    }),
    /正在维护/,
  );
  assert.equal(restarts, 0);
});
