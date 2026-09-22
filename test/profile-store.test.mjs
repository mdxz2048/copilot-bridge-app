import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ProfileStore } from "../dist-electron/profile-store.js";
import { parseDeviceFlowOutput } from "../dist-electron/copilot-auth.js";

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

test("switches profiles through a restart journal without changing profile directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "copilot-bridge-profile-store-"));
  try {
    const bridgeHome = join(directory, "bridge-home");
    const environment = new MemoryUserEnvironment();
    const store = new ProfileStore(
      bridgeHome,
      join(directory, "profile-switch.json"),
      environment,
    );

    assert.deepEqual(await store.getStatus(), {
      activeProfile: "original",
      bridgeHome,
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
