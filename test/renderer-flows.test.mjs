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
  backendMode: "REMOTE",
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
  delayCloudLogin = false,
  cloudRegistrationOpenError = null,
  accountManagementAvailable = false,
  referral = null,
  referralRegistrationUrl = null,
  profileRestartRequired = false,
  pendingProfile = null,
  failActivateProfile = false,
  failPrepare = false,
  failRestartChatGpt = false,
  failSave = false,
  failSwitch = false,
  activeProfile = "original",
  chatGptState = "INSTALLED",
  failInstallChatGpt = false,
  initialModels = [{ id: "test-model", supportsReasoningEffort: false }],
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
  let resolveCloudLogin;
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
  let chatGptStatusListener;
  let delaySettings = false;
  let resolveSettings;
  let failNextSave = failSave;
  let failNextSwitch = failSwitch;
  dom.window.copilotBridge = {
    getProfileStatus: async () => ({
      activeProfile,
      restartRequired: profileRestartRequired,
      pendingProfile,
    }),
    getBridgeStatus: async () => bridge,
    getSettings: async () => { const captured = settings; if (delaySettings) await new Promise(resolve => { resolveSettings = resolve; }); return captured; },
    getChatGptStatus: async () => ({ state: chatGptState, message: "" }),
    installChatGpt: async () => {
      events.push('installChatGpt');
      if (failInstallChatGpt) throw new Error('安装程序启动失败');
    },
    openChatGptDownload: async () => {
      events.push('openChatGptDownload');
      chatGptState = 'INSTALLING';
      chatGptStatusListener({state:'INSTALLING',step:'INSTALLING',message:'正在下载官方安装包… 25%'});
    },
    cancelChatGptInstall: async () => { events.push('cancelChatGptInstall'); },
    launchChatGpt: async () => { events.push('launchChatGpt'); },
    getModels: async () => initialModels,
    getCloudStatus: async () => cloud,
    getAppVersion: async () => "0.1.0",
    restartChatGpt: async () => {
      events.push("restartChatGpt");
      if (failRestartChatGpt) throw new Error("无法重启 ChatGPT");
      return { activeProfile, restartRequired: false, pendingProfile: null };
    },
    onCopilotLoginStatus: (callback) => {
      loginStatus = callback;
      return () => {};
    },
    onBridgeStatus: () => () => {},
    onProfileStatus: () => () => {},
    onChatGptStatus: callback => { chatGptStatusListener = callback; return () => {}; },
    onCloudStatus: () => () => {},
    startCopilotLogin: async () => {},
    cancelCopilotLogin: async () => {},
    loginCloud: async () => {
      events.push("loginCloud");
      if (nextCloudLoginError) throw new Error(nextCloudLoginError);
      if(delayCloudLogin)await new Promise(resolve=>{resolveCloudLogin=resolve;});
      return { ...cloud, authState: "AUTHENTICATED" };
    },
    openCloudRegistration: async () => {
      events.push("openCloudRegistration");
      if (nextRegistrationOpenError) throw new Error(nextRegistrationOpenError);
    },
    manageCloudAccount: async () => {
      events.push("manageCloudAccount");
    },
    activateProfile: async (target) => {
      events.push(`activate:${target}`);
      if (failActivateProfile) throw new Error("profile activation failed");
      return { activeProfile: target, restartRequired: true, pendingProfile: target };
    },
    prepareBridgeEnvironment: async () => { events.push("prepareBridge"); if(failPrepare)throw Error('prepare failed'); },
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
    async finishCloudLogin() {await act(async()=>{resolveCloudLogin();});},
    setCloudRegistrationOpenError(value) { nextRegistrationOpenError = value; },
    setCopyFailure(value) { copyFails = value; },
    get settings() { return settings; },
    async loginSuccess() {
      await act(async () => loginStatus({ state: "success", message: "已连接" }));
    },
    delayNextRefresh() { delaySettings = true; },
    async finishRefresh() { await act(async () => { resolveSettings?.(); }); },
    async chatGptInstalled() {
      chatGptState = 'INSTALLED';
      await act(async () => chatGptStatusListener({state: 'INSTALLED', message: '已安装 ChatGPT'}));
    },
    setDetectedChatGptState(value) { chatGptState = value; },
    async emitChatGptStatus(status) {
      chatGptState = status.state;
      await act(async () => chatGptStatusListener(status));
    },
    async focusWindow() { await act(async () => dom.window.dispatchEvent(new dom.window.Event('focus'))); },
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

test('Store completion shows verified success then closes without changing Cloud mode',async()=>{
 const app=await mountApp({chatGptState:'NOT_INSTALLED'});
 try{
  await app.click('安装 ChatGPT',true);
  await app.emitChatGptStatus({state:'INSTALLING',step:'WAITING_FOR_STORE',message:'请在商店完成安装'});
  assert.match(app.text,/商店不可用时，会自动从官网下载安装/);
  assert.doesNotMatch(app.text,/下载并校验官方包/);
  await app.chatGptInstalled();assert.match(app.text,/ChatGPT 安装完成/);
  await app.act(async()=>{await new Promise(r=>setTimeout(r,2100))});
  assert.equal(app.document.querySelector('[role="dialog"]'),null);
  assert.match(app.text,/安装完成，可以开启 Cloud/);assert.deepEqual(app.events,['installChatGpt']);
  assert.equal(app.document.querySelector('button[role="switch"]').getAttribute('aria-checked'),'false');
 }finally{await app.dispose();}
});

test('cancelled download does not stop detecting a later Store installation on focus',async()=>{
 const app=await mountApp({chatGptState:'NOT_INSTALLED'});
 try{
  await app.click('安装 ChatGPT',true);
  await app.emitChatGptStatus({state:'ERROR',message:'已取消安装包下载。'});
  app.setDetectedChatGptState('INSTALLED');await app.focusWindow();
  assert.match(app.text,/ChatGPT 安装完成/);await app.click('完成');
  assert.equal(app.document.querySelector('[role="dialog"]'),null);
  assert.doesNotMatch(app.text,/已取消安装包下载/);
  assert.deepEqual(app.events,['installChatGpt']);
 }finally{await app.dispose();}
});

test('postponing installation dismisses onboarding without cancelling downloads or reopening a dialog',async()=>{
 const app=await mountApp({chatGptState:'NOT_INSTALLED'});
 try{
  await app.click('稍后');assert.equal(app.document.querySelector('[role="dialog"]'),null);
  await app.focusWindow();assert.equal(app.document.querySelector('[role="dialog"]'),null);
  assert.deepEqual(app.events,[]);
 }finally{await app.dispose();}
});

test('postponed installation can be viewed again without launching a second installer',async()=>{
 const app=await mountApp({chatGptState:'NOT_INSTALLED'});
 try{
  await app.click('安装 ChatGPT',true);
  await app.emitChatGptStatus({state:'INSTALLING',step:'DOWNLOADING',message:'正在下载官方安装包…'});
  assert.ok(!app.text.includes('下载并安装'));await app.click('稍后');
  await app.click('查看安装进度');assert.ok(app.document.querySelector('[role="dialog"]'));
  assert.deepEqual(app.events,['installChatGpt']);
  await app.emitChatGptStatus({state:'INSTALLING',step:'INSTALLING',message:'Windows 正在安装…'});
  assert.ok(!app.text.includes('取消下载'));await app.click('稍后');assert.deepEqual(app.events,['installChatGpt']);
 }finally{await app.dispose();}
});

test('manual recheck recognizes installed ChatGPT after a failed detector and fresh launch does too',async()=>{
 const app=await mountApp({chatGptState:'ERROR'});
 try{
  app.setDetectedChatGptState('INSTALLED');await app.click('已安装，重新检测');
  assert.equal(app.document.querySelector('[role="dialog"]'),null);assert.deepEqual(app.events,[]);
 }finally{await app.dispose();}
 const reopened=await mountApp({chatGptState:'INSTALLED'});
 try{assert.equal(reopened.document.querySelector('[role="dialog"]'),null);assert.deepEqual(reopened.events,[]);}finally{await reopened.dispose();}
});

test("first run installed defaults to Original without a service selector or configuration mutation", async () => {
  const app=await mountApp();try{assert.equal(app.document.querySelector('[role="dialog"]'),null);assert.doesNotMatch(app.text,/GitHub Copilot|切换 AI 服务|我的 API|本地模型/);assert.deepEqual(app.events,[]);assert.equal(app.document.querySelector('button[role="switch"]').getAttribute('aria-checked'),'false');}finally{await app.dispose();}
});

test("canceling either mode confirmation leaves configuration untouched", async () => {
  for(const activeProfile of ['original','bridge']){const app=await mountApp({activeProfile,initialSettings:{onboardingCompleted:true}});try{await app.clickSelector('button[role="switch"]');assert.match(app.text,activeProfile==='original'?/切换到 Cloud？/:/切换到 ChatGPT 原账号？/);await app.click('取消');assert.deepEqual(app.events,[]);}finally{await app.dispose();}}
});

test("confirmed ON waits for Cloud login then completes only the confirmed Cloud target", async () => {
  const app=await mountApp();try{await app.clickSelector('button[role="switch"]');assert.deepEqual(app.events,[]);await app.click('确认切换');assert.deepEqual(app.events,[]);await app.input('email','test@example.com');await app.input('password','example-password');await app.click('登录',true);assert.deepEqual(app.events,['loginCloud','switch:REMOTE','prepareBridge','activate:bridge','save']);assert.equal(app.settings.onboardingCompleted,true);assert.match(app.text,/现在重启 ChatGPT/);}finally{await app.dispose();}
});

test("authenticated ON still confirms first; failed Cloud activation never prepares or changes profile", async () => {
  const app=await mountApp({initialCloudState:'AUTHENTICATED',failSwitch:true});try{await app.clickSelector('button[role="switch"]');assert.deepEqual(app.events,[]);await app.click('确认切换');assert.deepEqual(app.events,['switch:REMOTE']);assert.equal(app.settings.onboardingCompleted,false);assert.match(app.text,/Cloud 连接切换失败/);}finally{await app.dispose();}
});

test("confirmed OFF restores Original when Cloud is offline without switching transport or requesting login", async () => {
  const app=await mountApp({activeProfile:'bridge',initialCloudState:'SIGNED_OUT',cloudServiceStatus:'UNAVAILABLE',initialSettings:{onboardingCompleted:true}});try{await app.clickSelector('button[role="switch"]');await app.click('确认切换');assert.deepEqual(app.events,['activate:original']);assert.match(app.text,/现在重启 ChatGPT/);assert.match(app.text,/原账号配置已恢复/);}finally{await app.dispose();}
});

test("ordinary account login does not switch ChatGPT to Cloud", async () => {
  const app=await mountApp({initialSettings:{onboardingCompleted:true}});try{await app.clickSelector('.account-status-bar');await app.input('email','test@example.com');await app.input('password','example-password');await app.click('登录',true);assert.deepEqual(app.events,['loginCloud']);}finally{await app.dispose();}
});

test("closing confirmed Cloud login clears intent so later account login cannot enable Cloud", async () => {
  const app=await mountApp({initialSettings:{onboardingCompleted:true}});try{await app.clickSelector('button[role="switch"]');await app.click('确认切换');await app.click('关闭');await app.clickSelector('.account-status-bar');await app.input('email','test@example.com');await app.input('password','example-password');await app.click('登录',true);assert.deepEqual(app.events,['loginCloud']);}finally{await app.dispose();}
});

test("closing the account sheet during an in-flight login cancels only the pending mode intent", async()=>{
  const app=await mountApp({delayCloudLogin:true,initialSettings:{onboardingCompleted:true}});try{await app.clickSelector('button[role="switch"]');await app.click('确认切换');await app.input('email','test@example.com');await app.input('password','example-password');await app.click('登录',true);await app.click('关闭');await app.finishCloudLogin();assert.deepEqual(app.events,['loginCloud']);assert.equal(app.document.querySelector('button[role="switch"]').getAttribute('aria-checked'),'false');}finally{await app.dispose();}
});

test("pending gateway configuration asks to reopen ChatGPT without invoking Windows restart", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    profileRestartRequired: true,
    pendingProfile: "bridge",
    activeProfile: "bridge",
  });
  try {
    assert.match(app.text, /已切换到 Copilot Bridge Cloud/);
    assert.match(app.text, /保存工作后即可重启 ChatGPT/);
    await app.click("稍后重启 ChatGPT");
    assert.match(app.text, /Cloud 模式待生效/);
    assert.match(app.text, /重启 ChatGPT/);
    assert.throws(() => app.button("待重新打开 ChatGPT"), /Expected enabled button/);
    assert.doesNotMatch(app.text, /用户头像选择“注销”/);
    assert.deepEqual(app.events, []);
  } finally {
    await app.dispose();
  }
});

test("returning to the original provider remains pending until ChatGPT restart", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    profileRestartRequired: true,
    pendingProfile: "original",
  });
  try {
    await app.click("稍后重启 ChatGPT");
    assert.match(app.text, /自己的 ChatGPT 待生效/);
    assert.match(app.text, /重启 ChatGPT/);
    assert.throws(() => app.button("待重新打开 ChatGPT"), /Expected enabled button/);
    await app.click('重启 ChatGPT');
    assert.ok(app.document.querySelector('[role="dialog"]'));
    assert.doesNotMatch(app.text, /待手动注销|待重新登录 Windows/);
  } finally {
    await app.dispose();
  }
});

test('install action works with the original account and pending profile on a fresh PC', async () => {
  for (const activeProfile of ['original', 'bridge']) {
    const app = await mountApp({ initialSettings: {onboardingCompleted: true}, activeProfile,
      profileRestartRequired: true, pendingProfile: activeProfile, chatGptState: 'NOT_INSTALLED' });
    try {
      assert.equal(app.document.querySelector('[role="dialog"]'), null);
      await app.click('安装 ChatGPT');
      assert.deepEqual(app.events, ['installChatGpt']);
      assert.ok(app.document.querySelector('[role="dialog"]'));
      assert.doesNotMatch(app.text, /待手动注销|待重新登录 Windows/);
    } finally { await app.dispose(); }
  }
});
test('install launch errors are visible and installation in progress cannot start twice', async () => {
  const app = await mountApp({initialSettings: {onboardingCompleted: true}, chatGptState: 'ERROR', failInstallChatGpt: true});
  try { await app.click('安装 ChatGPT'); assert.match(app.text, /安装程序启动失败/); }
  finally { await app.dispose(); }
  const running = await mountApp({initialSettings: {onboardingCompleted: true}, chatGptState: 'INSTALLING'});
  try { await running.click('查看安装进度'); assert.ok(running.document.querySelector('[role="dialog"]')); assert.deepEqual(running.events, []); }
  finally { await running.dispose(); }
});
test('Bridge switch stays disabled until ChatGPT installation is detected', async () => {
  const app = await mountApp({initialSettings: {onboardingCompleted: true}, chatGptState: 'NOT_INSTALLED'});
  try {
    const toggle = app.document.querySelector('button[role="switch"]'); assert.ok(toggle.disabled);
    await app.clickSelector('button[role="switch"]'); assert.deepEqual(app.events, []);
    assert.match(app.text, /请先安装 ChatGPT/);
    await app.chatGptInstalled(); assert.equal(toggle.disabled, false);
    await app.clickSelector('button[role="switch"]'); assert.ok(app.document.querySelector('[role="dialog"]'));
  } finally { await app.dispose(); }
});
test('first run requires ChatGPT installation before offering AI services', async () => {
  const app = await mountApp({chatGptState: 'NOT_INSTALLED'});
  try {
    assert.match(app.document.querySelector('[role="dialog"]').textContent, /先安装 ChatGPT/);
    assert.doesNotMatch(app.document.querySelector('[role="dialog"]').textContent, /使用云服务/);
    await app.chatGptInstalled(); assert.equal(app.document.querySelector('[role="dialog"]'), null);
    assert.equal(app.document.querySelector('button[role="switch"]').disabled, false);
  } finally { await app.dispose(); }
});

test("failed environment switch reports the failure", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    activeProfile: "bridge",
    failActivateProfile: true,
  });
  try {
    await app.clickSelector('button[role="switch"]');
    await app.click("确认切换");
    assert.match(app.text, /原账号连接恢复失败/);
    assert.deepEqual(app.events, ["activate:original"]);
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
      "loginCloud",
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
    await app.clickSelector('button[aria-label="查看邀请记录"]');
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
    await app.clickSelector('button[aria-label="查看邀请记录"]');
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

test("an escapable Modal restores focus to its still-mounted trigger", async () => {
  const app = await mountApp({
    initialSettings: { onboardingCompleted: true },
    initialBridgeState: "ready",
  });
  try {
    const trigger = app.document.querySelector('button[role="switch"]');
    await app.clickSelector('button[role="switch"]');
    const modal = app.document.querySelector(".modal");
    assert.equal(modal.getAttribute("aria-label"), "切换到 Cloud？");
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


test("restart confirmation invokes the app restart and clears pending only after success", async () => {
  const app = await mountApp({initialSettings:{onboardingCompleted:true},profileRestartRequired:true,pendingProfile:"bridge",activeProfile:"bridge"});
  try {
    await app.click("立即重启 ChatGPT");
    assert.deepEqual(app.events,["restartChatGpt"]);
    assert.doesNotMatch(app.text,/现在重启 ChatGPT？/);
  } finally {await app.dispose();}
});

test("failed app restart leaves the configuration pending and allows retry", async () => {
  const app = await mountApp({initialSettings:{onboardingCompleted:true},profileRestartRequired:true,pendingProfile:"original",failRestartChatGpt:true});
  try {
    await app.click("立即重启 ChatGPT");
    assert.match(app.text,/无法重启 ChatGPT/);
    assert.ok(app.button("立即重启 ChatGPT"));
  } finally {await app.dispose();}
});

test('Cloud reasoning uses only advertised modes and persists mode without effort', async () => {
  const app = await mountApp({ initialSettings: { backendMode: 'REMOTE', onboardingCompleted: true, reasoningEffort: 'high' }, initialBridgeState: 'ready', initialCloudState: 'AUTHENTICATED', activeProfile: 'bridge', initialModels: [{ id: 'test-model', supportsReasoningEffort: true, reasoningModes: ['normal','thinking','auto'], defaultReasoningMode: 'auto' }] });
  try {
    assert.ok(!app.text.includes('推理强度'));
    await app.clickSelector('button[aria-label="思考模式"]');
    const modes=[...app.document.querySelectorAll('[role="option"]')];
    assert.deepEqual(modes.map(m=>m.textContent.replace('✓','').trim()),['普通','思考','自动']);
    await app.act(async()=>modes[1].click());
    assert.equal(app.settings.reasoningMode,'thinking');
    assert.equal(app.settings.reasoningEffort,null);
    assert.ok(!app.text.includes('我的 API'));
    assert.ok(!app.text.includes('本地模型'));
  } finally { await app.dispose(); }
});

test('Old Cloud metadata falls back to normal instead of invented effort controls', async () => {
  const app=await mountApp({initialSettings:{backendMode:'REMOTE',onboardingCompleted:true,reasoningMode:'thinking'},initialBridgeState:'ready',initialCloudState:'AUTHENTICATED',activeProfile:'bridge'});
  try {
    await app.clickSelector('button[aria-label="思考模式"]');
    assert.deepEqual([...app.document.querySelectorAll('[role="option"]')].map(m=>m.textContent.replace('✓','').trim()),['普通']);
    assert.ok(!app.text.includes('推理强度'));
  } finally { await app.dispose(); }
});

test('one installation click shows automatic Store fallback progress without channel choices', async () => {
  const app=await mountApp({chatGptState:'NOT_INSTALLED'});
  try {
    assert.deepEqual(app.events,[]);assert.doesNotMatch(app.text,/下载并安装/);
    await app.click('安装 ChatGPT',true);assert.deepEqual(app.events,['installChatGpt']);
    assert.match(app.text,/正在检查 ChatGPT 安装状态/);
    await app.emitChatGptStatus({state:'INSTALLING',step:'WAITING_FOR_STORE',message:'正在通过官方 Microsoft Store 安装…'});
    await app.emitChatGptStatus({state:'INSTALLING',step:'DOWNLOADING',message:'正在下载官方安装包… 25%'});
    assert.match(app.text,/25%/);assert.doesNotMatch(app.text,/下载并安装/);
    assert.equal(app.document.querySelector('button[role="switch"]').disabled,true);
    await app.click('稍后');await app.click('查看安装进度');
    assert.deepEqual(app.events,['installChatGpt']);
  } finally {await app.dispose();}
});

test('failed Cloud preparation or profile write never shows enabled or success; retry remains available',async()=>{
  for(const failure of [{failPrepare:true},{failActivateProfile:true}]){
    const app=await mountApp({initialCloudState:'AUTHENTICATED',initialSettings:{onboardingCompleted:true},...failure});
    try{await app.clickSelector('button[role="switch"]');await app.click('确认切换');assert.match(app.text,/Cloud 连接切换失败/);assert.equal(app.document.querySelector('button[role="switch"]').getAttribute('aria-checked'),'false');assert.doesNotMatch(app.text,/现在重启 ChatGPT/);await app.clickSelector('button[role="switch"]');assert.match(app.text,/切换到 Cloud/);}finally{await app.dispose();}
  }
});

test('failed Original restoration keeps ON and permits another explicit attempt',async()=>{
 const app=await mountApp({activeProfile:'bridge',failActivateProfile:true,initialSettings:{onboardingCompleted:true}});
 try{await app.clickSelector('button[role="switch"]');await app.click('确认切换');assert.equal(app.document.querySelector('button[role="switch"]').getAttribute('aria-checked'),'true');assert.doesNotMatch(app.text,/现在重启 ChatGPT/);await app.clickSelector('button[role="switch"]');assert.match(app.text,/切换到 ChatGPT 原账号/);}finally{await app.dispose();}
});

test('successful switch stays successful when only onboarding marker fails to save',async()=>{
 const app=await mountApp({initialCloudState:'AUTHENTICATED',failSave:true});
 try{await app.clickSelector('button[role="switch"]');await app.click('确认切换');assert.equal(app.document.querySelector('button[role="switch"]').getAttribute('aria-checked'),'true');assert.match(app.text,/现在重启 ChatGPT/);assert.match(app.text,/首次使用记录保存失败/);assert.doesNotMatch(app.text,/连接切换失败/);}finally{await app.dispose();}
});


test("a locked account is visible even when login has not loaded account details", async () => {
  const app = await mountApp({initialCloudState:"ACCOUNT_LOCKED"});
  try { assert.match(app.text, /账号已锁定/); assert.match(app.text, /请联系管理员解锁/); }
  finally { await app.dispose(); }
});


test("late pre-switch refresh cannot undo a single confirmed ON or OFF", async () => {
  for (const activeProfile of ["original", "bridge"]) {
    const app = await mountApp({activeProfile, chatGptState:"NOT_INSTALLED", initialCloudState:"AUTHENTICATED", initialSettings:{onboardingCompleted:true}});
    try {
      app.delayNextRefresh();
      await app.chatGptInstalled();
      await app.clickSelector('button[role="switch"]');
      await app.click("确认切换");
      const target = activeProfile === "original" ? "bridge" : "original";
      assert.equal(app.document.querySelector('button[role="switch"]').getAttribute("aria-checked"), String(target === "bridge"));
      await app.finishRefresh();
      assert.equal(app.document.querySelector('button[role="switch"]').getAttribute("aria-checked"), String(target === "bridge"));
      assert.equal(app.events.filter(event => event === `activate:${target}`).length, 1);
      assert.match(app.text, /现在重启 ChatGPT/);
    } finally { await app.dispose(); }
  }
});


test("Cloud model dropdown hides unready models and switches only to an available model",async()=>{
 const app=await mountApp({activeProfile:'bridge',initialBridgeState:'ready',initialCloudState:'AUTHENTICATED',initialSettings:{onboardingCompleted:true,backendModel:'deepseek/deepseek-flash'},initialModels:[{id:'deepseek/deepseek-flash',availability:'READY',reasoningModes:['normal','auto']},{id:'openai/gpt-6-sol',availability:'READY',reasoningModes:['normal']},{id:'openai/gpt-6-luna',availability:'SETUP_REQUIRED',reasoningModes:['normal']}]});
 try{await app.clickSelector('button[aria-label="模型"]');const options=[...app.document.querySelectorAll('[role="option"]')];assert.equal(options.length,2);assert.ok(!options.some(o=>o.textContent.includes('Luna')));await app.click('GPT-6 Sol');assert.equal(app.settings.backendModel,'openai/gpt-6-sol');assert.equal(app.settings.reasoningMode,'normal');}finally{await app.dispose();}
});

test("an exhausted wallet shows a distinct balance status while preserving the account", async () => {
 const app=await mountApp({activeProfile:"bridge",initialCloudState:"AUTHENTICATED",cloudServiceStatus:"BALANCE_REQUIRED",initialSettings:{onboardingCompleted:true}});
 try {assert.match(app.text,/余额不足/);assert.match(app.text,/查看账户/);assert.doesNotMatch(app.text,/仍可使用|本月额度已用完/);}
 finally {await app.dispose();}
});
