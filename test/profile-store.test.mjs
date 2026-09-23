import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProfileStore } from "../dist-electron/profile-store.js";
import { parseDeviceFlowOutput } from "../dist-electron/copilot-auth.js";
import { SettingsStore } from "../dist-electron/settings-store.js";

class MemoryUserEnvironment {
  value = null;

  async read(name) {
    assert.equal(name, "CODEX_HOME");
    return this.value;
  }

  async write(name, value) {
    assert.equal(name, "CODEX_HOME");
    this.value = value;
  }
}

test("extracts only public device-flow details from official runtime output", () => {
  assert.deepEqual(
    parseDeviceFlowOutput("Open https://github.com/login/device and enter device code: ABCD-EFGH"),
    {
      deviceCode: "ABCD-EFGH",
      verificationUrl: "https://github.com/login/device",
    },
  );
});

test("shows onboarding only for a new settings store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-bridge-settings-"));
  try {
    const path = join(directory, "settings.json");
    const store = new SettingsStore(path);
    assert.equal((await store.read()).onboardingCompleted, false);

    await writeFile(path, JSON.stringify({
      backendMode: "LOCAL",
      autoLaunch: true,
    }), "utf8");
    assert.equal((await store.read()).onboardingCompleted, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("switches profiles through a restart journal without changing profile directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-bridge-profile-store-"));
  try {
    const bridgeHome = join(directory, "bridge-home");
    const originalHome = join(directory, "original-home");
    const environment = new MemoryUserEnvironment();
    const store = new ProfileStore(
      bridgeHome,
      originalHome,
      join(directory, "profile-switch.json"),
      environment,
    );

    assert.deepEqual(await store.getStatus(), {
      activeProfile: "original",
      bridgeHome,
      originalState: "UNINITIALIZED",
      restartRequired: false,
      pendingProfile: null,
      unrestrictedBridgeAccess: true,
    });

    assert.equal((await store.activate("bridge")).restartRequired, true);
    assert.equal(environment.value, bridgeHome);
    assert.equal((await store.acknowledgeRestart()).activeProfile, "bridge");
    assert.equal((await store.getStatus()).restartRequired, false);

    assert.equal((await store.activate("original")).restartRequired, true);
    assert.equal(environment.value, null);
    assert.equal((await store.acknowledgeRestart()).activeProfile, "original");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restores a custom Original CODEX_HOME after using Bridge", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-bridge-custom-original-"));
  try {
    const bridgeHome = join(directory, "bridge-home");
    const originalHome = join(directory, "original-home");
    const environment = new MemoryUserEnvironment();
    environment.value = join(directory, "custom-original-home");
    const store = new ProfileStore(
      bridgeHome,
      originalHome,
      join(directory, "profile-switch.json"),
      environment,
    );

    assert.equal((await store.getStatus()).originalState, "CUSTOM");
    await store.activate("bridge");
    assert.equal(environment.value, bridgeHome);
    await store.acknowledgeRestart();
    await store.activate("original");
    assert.equal(environment.value, join(directory, "custom-original-home"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
