// Separate entry point used only by the explicitly selected local-preview build.
import {app} from 'electron';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const directory=join(app.getPath('appData'),'CopilotBridgeLocalPreview');
app.setName('Copilot Bridge Preview');
app.setPath('userData',directory);
process.argv.push(`--user-data-dir=${directory}`);
process.env.COPILOT_BRIDGE_CLOUD_MODE='DEVELOPMENT';
process.env.COPILOT_BRIDGE_CLOUD_BASE_URL='http://127.0.0.1:3311';
process.env.COPILOT_BRIDGE_ACCOUNT_MANAGEMENT_URL='http://127.0.0.1:3310/dashboard';
process.env.COPILOT_BRIDGE_SUBSCRIPTION_MANAGEMENT_URL='http://127.0.0.1:3310/dashboard';
process.env.CODEX_HOME=join(directory,'codex-home');
await mkdir(directory,{recursive:true});
try{await readFile(join(directory,'settings.json'));}catch(error){
 if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
 await writeFile(join(directory,'settings.json'),JSON.stringify({backendModel:null,reasoningEffort:null,reasoningMode:'auto',autoLaunch:false,minimizeToTray:false,autoBridgeStart:false,backendMode:'REMOTE',providerConnectionId:null,theme:'light',onboardingCompleted:true},null,2));
}
await import('./main.js');
