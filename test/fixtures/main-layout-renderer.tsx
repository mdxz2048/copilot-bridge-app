import {version} from "../../package.json";
import {createRoot} from "react-dom/client";
import {App} from "../../src/App";
const root=createRoot(document.getElementById("app")!);
(window as any).renderScenario=(scenario:string,theme:string)=>{
 const cloud:any={authState:scenario==='locked'?'ACCOUNT_LOCKED':scenario==='signed-out'?'SIGNED_OUT':'AUTHENTICATED',contractReady:true,account:scenario==='signed-out'?null:'long-account-address-for-layout@example.com',plan:'Pro',billing:{usedRmb:9.1768,balanceRmb:20.9898},providers:[],providerConnections:[],devices:[],walletTransactions:[],usageHistory:[],referralHistory:[],serviceStatus:'AVAILABLE',updateState:'CURRENT',lastError:null};
 if(scenario==='error')cloud.lastError={message:'云端连接暂时中断，请稍后重试。'.repeat(40),action:'RETRY',retryable:true,requestId:'layout-test-request-id'};
 if(scenario==='balance'){cloud.serviceStatus='BALANCE_REQUIRED';cloud.billing.balanceRmb=-0.1234;cloud.message='余额不足，请充值后重试。';}
 if(scenario==='alert'){cloud.updateState='MAINTENANCE';cloud.serviceStatus='MAINTENANCE';cloud.message='Cloud 正在维护，请稍后重试。';}
 if(scenario==='long'){cloud.plan='Enterprise Long Plan Name';cloud.billing={usedRmb:12345678.1234,balanceRmb:98765432.9876};}
 const settings={backendModel:'gpt-6.1-sol',reasoningEffort:null,reasoningMode:'auto',autoLaunch:true,minimizeToTray:true,autoBridgeStart:true,backendMode:'REMOTE',providerConnectionId:null,theme,onboardingCompleted:true};
 (window as any).copilotBridge={getProfileStatus:async()=>({activeProfile:scenario==='off'?'original':'bridge',restartRequired:false,pendingProfile:null}),getBridgeStatus:async()=>({state:'ready',message:'',endpoint:''}),getSettings:async()=>settings,getChatGptStatus:async()=>({state:'INSTALLED',message:''}),getModels:async()=>[{id:'gpt-6.1-sol',availability:'READY',reasoningModes:['normal','auto','thinking']}],getCloudStatus:async()=>cloud,getAppVersion:async()=>version,getUpdateStatus:async()=>({state:'CURRENT'}),getRewardNotices:async()=>[],onUpdateStatus:()=>()=>{},onBridgeStatus:()=>()=>{},onProfileStatus:()=>()=>{},onChatGptStatus:()=>()=>{},onCloudStatus:()=>()=>{},onModels:()=>()=>{}};
 root.render(<App key={scenario+theme}/>);
};
