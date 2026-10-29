const {build}=require('./package.json');
module.exports={
 ...build,
 appId:'com.copilotbridge.desktop.preview',
 productName:'Copilot Bridge Preview',
 electronDist:'node_modules/electron/dist',
 extraMetadata:{name:'copilot-bridge-preview',main:'dist-electron/preview-main.js'},
 artifactName:'Copilot Bridge Preview Setup ${version}.${ext}',
 directories:{...build.directories,output:'release-local-preview'},
 win:{...build.win,executableName:'Copilot Bridge Preview'},
 nsis:{...build.nsis,shortcutName:'Copilot Bridge 本地预览',perMachine:false,runAfterFinish:false},
};
