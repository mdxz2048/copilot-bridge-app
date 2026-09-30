import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const bundle = await build({
  entryPoints: ["src/App.tsx"],
  bundle: true,
  format: "cjs",
  jsx: "automatic",
  platform: "node",
  packages: "external",
  write: false,
});
const appModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(import.meta.url),
  appModule,
  appModule.exports,
);
const { App } = appModule.exports;

const settingsTemplate = {
  backendModel: null,
  reasoningEffort: null,
  autoLaunch: true,
  minimizeToTray: true,
  autoBridgeStart: true,
  backendMode: "LOCAL",
  providerConnectionId: null,
  theme: "system",
  onboardingCompleted: false,
};

async function mountApp({
  initialSettings = {},
  initialCloudState = "SIGNED_OUT",
  cloudServiceStatus = "AVAILABLE",
  initialBridgeState = "stopped",
  cloudLoginError = null,
  cloudRegistrationOpenError = null,
  accountManagementAvailable = false,
  referral = null,
  referralRegistrationUrl = null,
  profileRestartRequired = false,
  pendingProfile = null,
  failActivateProfile = false,
  failSave = false,
  failSwitch = false,
  activeProfile = "original",
} = {}) {
  const dom = new JSDOM("<div id='app'></div>", {
    url: "http://localhost/",
  });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: dom.window.navigator,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = React;
  const root = createRoot(dom.window.document.getElementById("app"));
  let settings = { ...settingsTemplate, ...initialSettings };
  let bridge = { state: initialBridgeState, message: "", endpoint: "" };
  const cloud = {
    authState: initialCloudState,
    contractReady: true,
    account: initialCloudState === "AUTHENTICATED" ? "test@example.com" : null,
    accountManagementAvailable,
    subscriptionManagementAvailable: accountManagementAvailable,
    referral,
    referralRegistrationUrl,
    providers: [],
    providerConnections: [],
    devices: [],
    walletTransactions: [],
    usageHistory: [],
    referralHistory: [],
    serviceStatus: cloudServiceStatus,
    updateState: "CURRENT",
    lastError: null,
  };
  const events = [];
  let nextCloudLoginError = cloudLoginError;
  let nextRegistrationOpenError = cloudRegistrationOpenError;
  const copiedCodes = [];
  let copyFails = false;
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (code) => {
        if (copyFails) throw new Error("Clipboard denied");
        copiedCodes.push(code);
      },
    },
  });
  let loginStatus;
  let failNextSave = failSave;
  let failNextSwitch = failSwitch;
  dom.window.copilotBridge = {
    getProfileStatus: async () => ({
      activeProfile,
      restartRequired: profileRestartRequired,
      pendingProfile,
    }),
    getBridgeStatus: async () => bridge,
    getSettings: async () => settings,
    getChatGptStatus: async () => ({ state: "INSTALLED", message: "" }),
    getModels: async () => [{ id: "test-model", supportsReasoningEffort: false }],
    getCloudStatus: async () => cloud,
    getAppVersion: async () => "0.1.0",
    onCopilotLoginStatus: (callback) => {
      loginStatus = callback;
      return () => {};
    },
    onBridgeStatus: () => () => {},
    onProfileStatus: () => () => {},
    onChatGptStatus: () => () => {},
    onCloudStatus: () => () => {},
    startCopilotLogin: async () => {},
    cancelCopilotLogin: async () => {},
    loginCloud: async () => {
      events.push("loginCloud");
      if (nextCloudLoginError) throw new Error(nextCloudLoginError);
      return { ...cloud, authState: "AUTHENTICATED" };
    },
    openCloudRegistration: async () => {
      events.push("openCloudRegistration");
      if (nextRegistrationOpenError) throw new Error(nextRegistrationOpenError);
    },
    manageCloudAccount: async () => {
      events.push("manageCloudAccount");
    },
    activateProfile: async () => {
      events.push("activateProfile");
      if (failActivateProfile) throw new Error("profile activation failed");
      return { activeProfile: "original", restartRequired: true, pendingProfile: "original" };
    },
    updateSettings: async (next) => {
      events.push("save");
      if (failNextSave) {
        failNextSave = false;
        throw new Error("save failed");
      }
      settings = next;
      return settings;
    },
    switchAiService: async (target) => {
      events.push(`switch:${target}`);
      if (failNextSwitch) {
        failNextSwitch = false;
        throw new Error("service unavailable");
      }
      settings = { ...settings, backendMode: target };
      bridge = { state: "ready", message: "", endpoint: "" };
      return {
        settings,
        bridge,
        models: [{ id: "test-model", supportsReasoningEffort: false }],
      };
    },
  };
  await act(async () => root.render(React.createElement(App)));

  function button(text, last = false) {
    const matches = [...dom.window.document.querySelectorAll("button")]
      .filter((item) => item.textContent.trim() === text && !item.disabled);
    const match = last ? matches.at(-1) : matches[0];
    assert.ok(match, `Expected enabled button: ${text}`);
    return match;
  }
  async function click(text, last = false) {
    await act(async () => {
      const element = button(text, last);
      element.focus();
      element.click();
    });
  }
  async function clickSelector(selector) {
    const element = dom.window.document.querySelector(selector);
    assert.ok(element, `Expected element: ${selector}`);
    await act(async () => {
      element.focus();
      element.click();
    });
  }
  async function key(key, options = {}) {
    await act(async () => {
      dom.window.document.activeElement.dispatchEvent(
        new dom.window.KeyboardEvent("keydown", {
          key, bubbles: true, cancelable: true, ...options,
        }),
      );
    });
  }
  async function input(type, value) {
    const element = dom.window.document.querySelector(`input[type="${type}"]`);
    assert.ok(element, `Expected ${type} input`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")
        .set.call(element, value);
      element.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  }
  return {
    act,
    click,
    clickSelector,
    key,
    input,
    button,
    events,
    copiedCodes,
    get text() { return dom.window.document.body.textContent; },
    get document() { return dom.window.document; },
    get theme() { return dom.window.document.documentElement.dataset.theme ?? null; },
    setCloudLoginError(value) { nextCloudLoginError = value; },
    setCloudRegistrationOpenError(value) { nextRegistrationOpenError = value; },
    setCopyFailure(value) { copyFails = value; },
    get settings() { return settings; },
    async loginSuccess() {
      await act(async () => loginStatus({ state: "success", message: "已连接" }));
    },
    async dispose() {
      await act(async () => root.unmount());
      dom.window.close();
      Object.assign(globalThis, previous);
      if (previousNavigator) {
        Object.defineProperty(globalThis, "navigator", previousNavigator);
      } else {
        delete globalThis.navigator;
      }
    },
  };
}

test("first-run Local completes only after login and service readiness", async () => {
  const app = await mountApp();
  try {
    await app.click("连接 GitHub Copilot");
    assert.equal(app.settings.onboardingCompleted, false);
    assert.deepEqual(app.events, []);
    await app.loginSuccess();
    assert.deepEqual(app.events, ["switch:LOCAL", "save"]);
    assert.equal(app.settings.onboardingCompleted, true);
  } finally {
    await app.dispose();
  }
});

test("first-run Cloud uses the freshly authenticated status before switching", async () => {
  const app = await mountApp();
  try {
    await app.click("登录并使用");
    assert.equal(app.settings.onboardingCompleted, false);
    await app.input("email", "test@example.com");
    await app.input("password", "example-password");
    await app.click("登录", true);
    assert.deepEqual(app.events, ["loginCloud", "switch:REMOTE", "save"]);
    assert.equal(app.settings.onboardingCompleted, true);
  } finally {
    await app.dispose();
  }
});

test("first-run Cloud already selected still waits for account authentication", async () => {
  const app = await mountApp({
    initialSettings: { backendMode: "REMOTE" },
    initialBridgeState: "ready",
  });
  try {
    await app.click("登录并使用");
    assert.equal(app.settings.onboardingCompleted, false);
    await app.input("email", "test@example.com");
    await app.input("password", "example-password");
    await app.click("登录", true);
    assert.deepEqual(app.events, ["loginCloud", "save"]);
    assert.equal(app.settings.onboardingCompleted, true);
  } finally {
    await app.dispose();
  }
});

test("a failed onboarding save leaves the choice retryable", async () => {
  const app = await mountApp({ failSave: true });
  try {
    await app.click("连接 GitHub Copilot");
    await app.loginSuccess();
    assert.equal(app.settings.onboardingCompleted, false);
    await app.click("连接 GitHub Copilot");
    assert.equal(app.settings.onboardingCompleted, true);
    assert.deepEqual(app.events, ["switch:LOCAL", "save", "save"]);
  } finally {
    await app.dispose();
  }
});

test("failed service activation does not complete onboarding", async () => {
  const app = await mountApp({ failSwitch: true });
  try {
    await app.click("连接 GitHub Copilot");
    await app.loginSuccess();
    assert.equal(app.settings.onboardingCompleted, false);
    assert.deepEqual(app.events, ["switch:LOCAL"]);
    await app.click("连接 GitHub Copilot");
    await app.loginSuccess();
    assert.deepEqual(app.events, ["switch:LOCAL", "switch:LOCAL", "save"]);
    assert.equal(app.settings.onboardingCompleted, true);
  } finally {
    await app.dispose();
  }
});

test("an existing Cloud selection is not considered ready during maintenance", async () => {
  const app = await mountApp({
    initialSettings: { backendMode: "REMOTE" },
    initialCloudState: "AUTHENTICATED",
    cloudServiceStatus: "MAINTENANCE",
    initialBridgeState: "ready",
    failSwitch: true,
  });
  try {
    await app.click("登录并使用");
    assert.deepEqual(app.events, ["switch:REMOTE"]);
    assert.equal(app.settings.onboardingCompleted, false);
  } finally {
    await app.dispose();
  }
});

test("cancelled first-run login returns to the service choice", async () => {
  const app = await mountApp();
  try {
    await app.click("连接 GitHub Copilot");
    await app.click("取消");
    assert.ok(app.button("连接 GitHub Copilot"));
    assert.equal(app.settings.onboardingCompleted, false);
    assert.deepEqual(app.events, []);
  } finally {
    await app.dispose();
  }
});

test("preflight Local login switches the selected service after success", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true, backendMode: "REMOTE" },
    initialCloudState: "AUTHENTICATED",
    activeProfile: "bridge",
  });
  try {
    await app.click("切换 AI 服务");
    await app.click("选择");
    await app.click("我已订阅");
    await app.loginSuccess();
    assert.deepEqual(app.events, ["switch:LOCAL"]);
    assert.equal(app.settings.backendMode, "LOCAL");
  } finally {
    await app.dispose();
  }
});

test("pending Windows environment gives manual sign-out guidance without invoking restart", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    profileRestartRequired: true,
    pendingProfile: "bridge",
    activeProfile: "bridge",
  });
  try {
    assert.match(app.text, /尚未在当前 Windows 会话生效/);
    assert.match(app.text, /用户头像选择“注销”/);
    await app.click("我知道了，稍后手动注销");
    assert.match(app.text, /Copilot 环境待生效/);
    assert.match(app.text, /待环境生效/);
    assert.throws(() => app.button("待重新登录 Windows"), /Expected enabled button/);
    assert.doesNotMatch(app.text, /重新启动 Windows/);
    assert.deepEqual(app.events, []);
  } finally {
    await app.dispose();
  }
});

test("returning to the original profile remains pending until Windows sign-out", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    profileRestartRequired: true,
    pendingProfile: "original",
  });
  try {
    await app.click("我知道了，稍后手动注销");
    assert.match(app.text, /原账号环境待生效/);
    assert.match(app.text, /当前 ChatGPT 可能仍使用旧环境/);
    assert.throws(() => app.button("待重新登录 Windows"), /Expected enabled button/);
  } finally {
    await app.dispose();
  }
});

test("failed environment switch reports the failure", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    activeProfile: "bridge",
    failActivateProfile: true,
  });
  try {
    await app.clickSelector('button[role="switch"]');
    assert.match(app.text, /ChatGPT 环境切换失败/);
    assert.deepEqual(app.events, ["activateProfile"]);
  } finally {
    await app.dispose();
  }
});

test("website registration followed by subscription-required login keeps guidance and website entry visible", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    cloudLoginError: "SUBSCRIPTION_REQUIRED",
    accountManagementAvailable: true,
  });
  try {
    await app.clickSelector(".account-status-bar");
    await app.click("去网站注册");
    assert.deepEqual(app.events, ["openCloudRegistration"]);
    await app.input("email", "new@example.com");
    await app.input("password", "TwelveChars!");
    await app.click("登录", true);
    assert.match(app.text, /Cloud 套餐未开通/);
    assert.match(app.text, /测试占位，不收款、不会自动开通/);
    assert.doesNotMatch(app.text, /登录失败，请检查账号信息/);
    await app.click("打开网站账户中心查看开通说明");
    await app.click("关闭");
    await app.clickSelector(".account-status-bar");
    assert.match(app.text, /Cloud 套餐未开通/);
    await app.input("email", "new@example.com");
    await app.input("password", "TwelveChars!");
    assert.deepEqual(app.events, ["openCloudRegistration", "loginCloud", "manageCloudAccount"]);
    app.setCloudLoginError(null);
    await app.clickSelector(".cloud-login-fields > button");
    assert.doesNotMatch(app.text, /网站二维码仅为测试占位/);
    assert.equal(app.settings.backendMode, "REMOTE");
    assert.deepEqual(app.events, [
      "openCloudRegistration", "loginCloud", "manageCloudAccount",
      "loginCloud", "switch:REMOTE",
    ]);
  } finally {
    await app.dispose();
  }
});

test("website registration failure is visible and remains retryable", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    accountManagementAvailable: true,
    cloudRegistrationOpenError: "No trusted registration URL",
  });
  try {
    await app.clickSelector(".account-status-bar");
    await app.click("去网站注册");
    assert.match(app.text, /无法打开网站注册页面，请联系管理员/);
    app.setCloudRegistrationOpenError(null);
    await app.click("去网站注册");
    assert.deepEqual(app.events, ["openCloudRegistration", "openCloudRegistration"]);
  } finally {
    await app.dispose();
  }
});

test("TEST Cloud with no trusted site explains why registration cannot open", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
  });
  try {
    await app.clickSelector(".account-status-bar");
    assert.match(app.text, /当前环境未配置网站注册地址，请联系管理员/);
    assert.doesNotMatch(app.text, /去网站注册/);
    assert.deepEqual(app.events, []);
  } finally {
    await app.dispose();
  }
});

test("subscription-required login in TEST mode explains missing site URL and remains retryable", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    cloudLoginError: "SUBSCRIPTION_REQUIRED",
  });
  try {
    await app.clickSelector(".account-status-bar");
    await app.input("email", "new@example.com");
    await app.input("password", "TwelveChars!");
    await app.click("登录", true);
    assert.match(app.text, /当前环境未配置网站入口，请联系管理员开通后重试/);
    await app.clickSelector(".cloud-login-fields > button");
    assert.deepEqual(app.events, ["loginCloud", "loginCloud"]);
    assert.doesNotMatch(app.text, /打开网站账户中心查看开通说明/);
  } finally {
    await app.dispose();
  }
});

test("referral code copy reports success and failure without implying immediate rewards", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    initialCloudState: "AUTHENTICATED",
    referral: { code: "INVITE123", registered: 1, rewarded: 0, pointsEarned: 0 },
  });
  try {
    await app.clickSelector(".account-status-bar");
    await app.clickSelector(".account-link-row:nth-of-type(2)");
    assert.match(app.text, /注册仅记录邀请，不即时发奖/);
    assert.match(app.text, /测试占位二维码和单纯的人工开通不代表已付款/);
    assert.match(app.text, /未配置可信的网站邀请链接/);
    assert.throws(() => app.button("复制邀请链接"), /Expected enabled button/);
    await app.click("复制邀请码");
    assert.match(app.text, /邀请码已复制/);
    assert.deepEqual(app.copiedCodes, ["INVITE123"]);
    app.setCopyFailure(true);
    await app.click("复制邀请码");
    assert.match(app.text, /复制失败，请手动选中上方邀请码复制/);
    assert.deepEqual(app.copiedCodes, ["INVITE123"]);
  } finally {
    await app.dispose();
  }
});

test("copies the trusted registration link and reports clipboard failures", async () => {
  const link = "https://ai.mddxz.top/register?ref=INVITE123";
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    initialCloudState: "AUTHENTICATED",
    referral: { code: "INVITE123", registered: 0, rewarded: 0, pointsEarned: 0 },
    referralRegistrationUrl: link,
  });
  try {
    await app.clickSelector(".account-status-bar");
    await app.clickSelector(".account-link-row:nth-of-type(2)");
    assert.match(app.text, /https:\/\/ai\.mddxz\.top\/register\?ref=INVITE123/);
    await app.click("复制邀请链接");
    assert.match(app.text, /邀请链接已复制/);
    assert.deepEqual(app.copiedCodes, [link]);
    app.setCopyFailure(true);
    await app.click("复制邀请链接");
    assert.match(app.text, /邀请链接复制失败，请手动选中上方邀请链接复制/);
    assert.deepEqual(app.copiedCodes, [link]);
    await app.click("复制邀请码");
    assert.match(app.text, /邀请码复制失败/);
  } finally {
    await app.dispose();
  }
});

test("Sheet traps Tab, closes on Escape and restores the account trigger focus", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
  });
  try {
    const trigger = app.document.querySelector(".account-status-bar");
    await app.clickSelector(".account-status-bar");
    const sheet = app.document.querySelector(".sheet");
    assert.equal(sheet.getAttribute("role"), "dialog");
    assert.equal(sheet.getAttribute("aria-modal"), "true");
    const first = sheet.querySelector(".sheet-header button");
    const last = sheet.querySelector('input[type="password"]');
    assert.ok(app.document.activeElement === first);
    await app.key("Tab", { shiftKey: true });
    assert.ok(app.document.activeElement === last);
    await app.key("Tab");
    assert.ok(app.document.activeElement === first);
    await app.key("Escape");
    assert.equal(app.document.querySelector(".sheet"), null);
    assert.ok(app.document.activeElement === trigger);
  } finally {
    await app.dispose();
  }
});

test("Modal traps focus even when Escape is intentionally disabled for first-run choice", async () => {
  const app = await mountApp();
  try {
    const modal = app.document.querySelector(".modal");
    assert.equal(modal.getAttribute("role"), "dialog");
    assert.equal(modal.getAttribute("aria-modal"), "true");
    const options = modal.querySelectorAll(".onboarding-options button");
    assert.ok(app.document.activeElement === options[0]);
    await app.key("Tab", { shiftKey: true });
    assert.ok(app.document.activeElement === options[1]);
    await app.key("Tab");
    assert.ok(app.document.activeElement === options[0]);
    await app.key("Escape");
    assert.equal(app.document.querySelector(".modal"), modal);
    await app.click("连接 GitHub Copilot");
    assert.equal(app.document.querySelector(".modal")?.getAttribute("aria-label"), "连接 GitHub Copilot");
    await app.key("Escape");
    assert.equal(app.document.querySelector(".modal")?.getAttribute("aria-label"), "欢迎使用 Copilot Bridge");
  } finally {
    await app.dispose();
  }
});

test("an escapable Modal restores focus to its still-mounted trigger", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    initialBridgeState: "ready",
  });
  try {
    const trigger = app.document.querySelector('button[role="switch"]');
    await app.clickSelector('button[role="switch"]');
    const modal = app.document.querySelector(".modal");
    assert.equal(modal.getAttribute("aria-label"), "设置 Copilot 环境");
    assert.ok(modal.contains(app.document.activeElement));
    await app.key("Escape");
    assert.equal(app.document.querySelector(".modal"), null);
    assert.ok(app.document.activeElement === trigger);
  } finally {
    await app.dispose();
  }
});

test("theme changes apply immediately, follow system and restore persisted choice", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
  });
  let persisted;
  try {
    assert.equal(app.theme, null);
    await app.clickSelector(".settings-button");
    await app.clickSelector('button[aria-label="主题"]');
    await app.click("深色");
    assert.equal(app.theme, "dark");
    assert.equal(app.settings.theme, "dark");
    await app.clickSelector('button[aria-label="主题"]');
    await app.click("浅色");
    assert.equal(app.theme, "light");
    await app.clickSelector('button[aria-label="主题"]');
    await app.click("跟随系统");
    assert.equal(app.theme, null);
    await app.clickSelector('button[aria-label="主题"]');
    await app.click("深色");
    persisted = { ...app.settings };
  } finally {
    await app.dispose();
  }
  const restarted = await mountApp({ initialSettings: persisted });
  try {
    assert.equal(restarted.theme, "dark");
  } finally {
    await restarted.dispose();
  }
});

test("a failed theme save keeps the current appearance", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true, theme: "light" },
    failSave: true,
  });
  try {
    await app.clickSelector(".settings-button");
    await app.clickSelector('button[aria-label="主题"]');
    await app.click("深色");
    assert.equal(app.theme, "light");
    assert.equal(app.settings.theme, "light");
    assert.match(app.text, /设置未能保存/);
  } finally {
    await app.dispose();
  }
});
