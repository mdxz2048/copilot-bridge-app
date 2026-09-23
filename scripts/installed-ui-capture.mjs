import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

const executable = process.env.COPILOT_BRIDGE_INSTALLED_EXE
  ?? join(
    process.env.LOCALAPPDATA ?? "",
    "Programs",
    "Copilot Bridge",
    "Copilot Bridge.exe",
  );
const scale = process.env.COPILOT_BRIDGE_UI_SCALE ?? "1";
const userData = process.env.COPILOT_BRIDGE_UI_USER_DATA;
const screenshotLabel =
  process.env.COPILOT_BRIDGE_UI_SCREENSHOT_LABEL ?? "visual";
const outputDirectory = requiredEnvironment(
  "COPILOT_BRIDGE_INSTALLED_E2E_SCREENSHOT_DIR",
);
const debugPort = await findAvailablePort();
const app = spawn(
  executable,
  [
    `--remote-debugging-port=${String(debugPort)}`,
    `--force-device-scale-factor=${scale}`,
    ...(userData ? [`--user-data-dir=${userData}`] : []),
  ],
  { windowsHide: false, stdio: "ignore" },
);

let cdp;
try {
  const target = await waitForRenderer(debugPort);
  cdp = await createCdpClient(target.webSocketDebuggerUrl);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await cdp.evaluate(
      `(() => {
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === '稍后')
          ?.click();
        return true;
      })()`,
    );
    await delay(100);
  }
  const metrics = await cdp.evaluate(
    `(() => {
      const main = document.querySelector('main');
      return {
        bodyOverflow:
          document.body.scrollWidth > document.body.clientWidth
          || document.body.scrollHeight > document.body.clientHeight,
        mainOverflow: main
          ? main.scrollWidth > main.clientWidth
            || main.scrollHeight > main.clientHeight
          : true,
        bodyText: document.body.innerText,
      };
    })()`,
  );
  await mkdir(outputDirectory, { recursive: true });
  const path = join(
    outputDirectory,
    `installed-${screenshotLabel}-${scale.replace(".", "_")}x.png`,
  );
  await cdp.captureScreenshot(path);
  const technicalTerms = [
    "backendMode",
    "Gateway URL",
    "CODEX_HOME",
    "Responses",
    "Tool Bridge",
  ].filter((term) => metrics.bodyText.includes(term));
  const passed = !metrics.bodyOverflow
    && !metrics.mainOverflow
    && technicalTerms.length === 0;
  console.log(JSON.stringify({
    result: passed ? "PASS" : "FAIL",
    scale,
    screenshot: path,
    bodyOverflow: metrics.bodyOverflow,
    mainOverflow: metrics.mainOverflow,
    technicalTerms,
  }, null, 2));
  if (!passed) process.exitCode = 1;
} finally {
  cdp?.close();
  if (app.exitCode === null) app.kill();
  await delay(1_000);
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

async function waitForRenderer(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) =>
          target.type === "page" && target.webSocketDebuggerUrl
        );
        if (page) return page;
      }
    } catch {}
    await delay(250);
  }
  throw new Error("Installed renderer did not expose a CDP target.");
}

function createCdpClient(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("open", () => {
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data));
        if (!message.id) return;
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
      });
      const call = (method, params = {}) => new Promise(
        (resolveCall, rejectCall) => {
          const id = nextId++;
          pending.set(id, { resolve: resolveCall, reject: rejectCall });
          socket.send(JSON.stringify({ id, method, params }));
        },
      );
      resolve({
        async evaluate(expression) {
          const result = await call("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
          });
          if (result.exceptionDetails) {
            throw new Error(
              result.exceptionDetails.exception?.description
                ?? result.exceptionDetails.text,
            );
          }
          return result.result.value;
        },
        async captureScreenshot(path) {
          const result = await call("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: false,
          });
          await writeFile(path, result.data, "base64");
        },
        close() {
          socket.close();
        },
      });
    }, { once: true });
  });
}

function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate a CDP port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
