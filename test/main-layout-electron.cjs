const { app, BrowserWindow } = require('electron');
const { writeFileSync, mkdirSync } = require('node:fs');
const path = require('node:path');
app.disableHardwareAcceleration();
const dpr = process.env.UI_SCALE || '1';
const output = path.join(process.env.UI_CAPTURE_DIR, 'captures-' + dpr);
mkdirSync(output, { recursive: true });
const pause = () => new Promise(resolve => setTimeout(resolve, 120));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900, height: 700, useContentSize: true, show: false,
    webPreferences: { contextIsolation: false, nodeIntegration: false, backgroundThrottling: false },
  });
  await win.loadFile(process.env.UI_FIXTURE_HTML);
  win.webContents.debugger.attach("1.3");
  await win.webContents.debugger.sendCommand("DOM.enable");
  await win.webContents.debugger.sendCommand("CSS.enable");
  const results = [];
  const interactions = [];
  const capture = async label => writeFileSync(path.join(output, label + '.png'), (await win.webContents.capturePage()).toPNG());
  for (const size of [[900, 700], [720, 520]]) {
    for (const theme of ['light', 'dark']) {
      for (const scenario of (process.env.UI_CAPTURE_SCENARIOS??'off,cloud,error,locked,balance,alert,signed-out,long').split(',')) {
        win.setContentSize(...size);
        await win.webContents.executeJavaScript(`renderScenario(${JSON.stringify(scenario)},${JSON.stringify(theme)})`);
        await pause();
        const metrics = await win.webContents.executeJavaScript(`(() => {
          const content = document.querySelector('.app-content');
          const footer = document.querySelector('.status-bar').getBoundingClientRect();
          const main = document.querySelector('main');
          return {
            viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
            content: [content.clientHeight, content.scrollHeight], main: [main.clientHeight, main.scrollHeight],
            overflow: [...document.querySelectorAll('.app-content button,.app-content .account-metric,.app-content .service-state')]
              .filter(element => {
                const box = element.getBoundingClientRect();
                return box.top < 48 || box.bottom > footer.top || box.left < 0 || box.right > innerWidth
                  || element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
              }).map(element => ({text: element.textContent, rect: element.getBoundingClientRect().toJSON()})),
          };
        })()`);
        const label = `${size.join('x')}-${theme}-${scenario}`;
        await capture(label);
        results.push({ label, ...metrics });
        if (scenario === 'cloud') {
          // Hidden windows at high DPI do not reliably hit-test synthetic mouse moves.
          // Force the actual renderer CSS state to verify the real hover rule deterministically.
          const {root} = await win.webContents.debugger.sendCommand('DOM.getDocument');
          const {nodeId} = await win.webContents.debugger.sendCommand('DOM.querySelector',{nodeId:root.nodeId,selector:'.account-topup-link'});
          await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:['hover']});
          await pause();
          const colors = await win.webContents.executeJavaScript(`(() => {
            const e=document.querySelector('.account-topup-link'),s=getComputedStyle(e);
            const canvas=document.createElement('canvas'),c=canvas.getContext('2d');
            const ancestors=[];for(let node=e;node;node=node.parentElement)ancestors.unshift(node);
            function rgb(color){c.fillStyle='#fff';c.fillRect(0,0,1,1);for(const node of ancestors){c.fillStyle=getComputedStyle(node).backgroundColor;c.fillRect(0,0,1,1);}if(color){c.fillStyle=color;c.fillRect(0,0,1,1);}return [...c.getImageData(0,0,1,1).data].slice(0,3);}
            function luminance(color){return rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
            const a=luminance(s.color),b=luminance(null);
            return {hovered:e.matches(':hover'),foreground:s.color,background:s.backgroundColor,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
          })()`);
          await capture(label+'-recharge-hover');
          interactions.push({label:label+'-hover',...colors,passed:colors.hovered&&colors.contrast>=4.5});
          await win.webContents.executeJavaScript(`document.querySelector('.account-topup-link').focus()`);
          await capture(label+'-recharge-focus');
          await win.webContents.executeJavaScript(`document.querySelector('.account-topup-link').disabled=true`);
          await capture(label+'-recharge-disabled');
          await win.webContents.debugger.sendCommand('CSS.forcePseudoState',{nodeId,forcedPseudoClasses:[]});
        }
        if (scenario === 'error') {
          await win.webContents.executeJavaScript(`{const e=document.querySelector('.service-detail-link');e.focus();e.click();}`);
          await pause();
          const detail = await win.webContents.executeJavaScript(`(() => {const d=document.querySelector('.service-error-dialog');return {fullMessage:d.textContent.includes('云端连接暂时中断，请稍后重试。'.repeat(40)),requestId:d.textContent.includes('layout-test-request-id'),focused:d.contains(document.activeElement)};})()`);
          await capture(label+'-detail');
          win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
          win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
          await pause();
          const restored = await win.webContents.executeJavaScript(`!document.querySelector('.service-error-dialog') && document.activeElement===document.querySelector('.service-detail-link')`);
          interactions.push({label:label+'-detail',...detail,restored,passed:Object.values(detail).every(Boolean)&&restored});
        }
      }
    }
  }
  writeFileSync(path.join(output, 'metrics.json'), JSON.stringify({layouts:results,interactions}, null, 2));
  const failed = results.filter(r => r.content[0] !== r.content[1] || r.main[0] !== r.main[1] || r.overflow.length);
  const failedInteractions = interactions.filter(r => !r.passed);
  console.log(JSON.stringify({scale:dpr,cases:results.length,interactions:interactions.length,failed,failedInteractions}));
  win.destroy();
  app.exit(failed.length || failedInteractions.length ? 1 : 0);
}).catch(error => { console.error(error); app.exit(1); });
