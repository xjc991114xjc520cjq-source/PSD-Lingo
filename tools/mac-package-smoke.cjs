const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 console.log('Starting packaged Mac smoke');
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Apple Silicon required');
 const dist=path.resolve(__dirname,'../work/mac-dist'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-mac-smoke-'));
 process.env.SPARKIT_KEYCHAIN_TEST_NAMESPACE='smoke-'+Date.now();
 const isolatedCodexHome=path.join(profile,'codex-home');await fs.mkdir(isolatedCodexHome);
 process.env.CODEX_HOME=isolatedCodexHome;
 await fs.mkdir(dist,{recursive:true});
 const installedApp=process.env.SPARKIT_MAC_SMOKE_APP||path.join(dist,'Sparkit.app');
 const executable=path.join(installedApp,'Contents/MacOS/Sparkit'),args=['--user-data-dir='+profile,'--remote-debugging-port=0'];
 const offline=process.env.SPARKIT_MAC_SMOKE_OFFLINE==='1';
 if(offline)args.push('--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>');
 const child=spawn(executable,args,{stdio:['ignore','pipe','pipe']});
 let log='',exit;child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);child.on('exit',code=>exit=code);
 const report={installedApp,offline,chromiumProxyBlocked:offline,platform:process.platform,arch:process.arch,rendererPassed:false,nativeHardware:'not-tested',adobe:'requires-user-Mac'};
 const watchdog=setTimeout(()=>{console.error('Packaged Mac smoke timed out');child.kill('SIGTERM');process.exit(1);},120000);
 await fs.writeFile(path.join(dist,'smoke-report.json'),JSON.stringify(report,null,2));
 try{
  const {invokeDeviceService}=require('../services/device-service.cjs'),helperRoot=path.join(installedApp,'Contents/Resources/app');
  const call=request=>invokeDeviceService(null,request,{root:helperRoot,timeoutMs:15000});
  console.log('Checking native helper');
  report.capabilities=await call({op:'capabilities'});
  const plain=Buffer.from('Mac packaged Keychain roundtrip 中文').toString('base64');
  const encrypted=await call({op:'protect',value:plain});
  if((await call({op:'unprotect',value:encrypted.value})).value!==plain)throw Error('Packaged Keychain roundtrip failed');
  report.keychainPassed=true;
  if(report.capabilities.secureEnclave){
   const crypto=require('node:crypto'),a=await call({op:'identity'}),b=await call({op:'identity'});
   if(a.spki!==b.spki)throw Error('Identity changed across helper restarts');
   const signed=await call({op:'sign',value:plain});
   if(!crypto.verify('sha256',Buffer.from(plain,'base64'),{key:crypto.createPublicKey({key:Buffer.from(a.spki,'base64'),format:'der',type:'spki'}),dsaEncoding:'ieee-p1363'},Buffer.from(signed.signature,'base64')))throw Error('Native signature invalid');
   report.nativeHardware='passed';
  }else report.nativeHardware='Secure Enclave unavailable on cloud runner; user Mac required';
  console.log('Checking bundled Codex');
  const codexHome=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-embedded-codex-'));
  const codexExecutable=path.join(helperRoot,'bin/codex/bin/codex');
  const cli=new(require('../services/codex-app-session.cjs').CodexAppSession)({executable:codexExecutable,env:{...process.env,CODEX_HOME:codexHome}});
  try{
   await cli.initialize();const account=await cli.request('account/read',{refreshToken:false});
   await cli.request('config/read',{includeLayers:false});
   const opened=await cli.request('thread/start',{cwd:codexHome,approvalPolicy:'never',sandbox:'read-only',dynamicTools:require('../services/agent-native-provider.cjs').tools(),config:{'features.shell_tool':false,'features.multi_agent':false,'features.apps':false,web_search:'disabled'}});
   if(!opened.thread?.id||path.resolve(opened.thread.cwd)!==path.resolve(codexHome))throw Error('Embedded Codex task directory mismatch');
   const login=await cli.request('account/login/start',{type:'chatgpt'});const auth=new URL(login.authUrl);
   if(auth.protocol!=='https:'||!['auth.openai.com','auth0.openai.com','chatgpt.com'].includes(auth.hostname)||!login.loginId)throw Error('Embedded OAuth protocol invalid');
   await cli.request('account/login/cancel',{loginId:login.loginId});
   report.bundledCodex={initialize:true,accountRead:true,signedIn:!!account.account,threadStart:true,dynamicToolSchema:true,loginStart:true,loginCancel:true,modelCalls:0};
  }finally{cli.close();}
  console.log('Checking packaged renderer');
  let port;
  for(let i=0;i<90;i++){if(exit!==undefined)throw Error('App exited before renderer: '+exit);try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}await delay(500);}
  if(!port)throw Error('No renderer debugging endpoint');
  let page;for(let i=0;i<30;i++){page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;await delay(500);}
  if(!page)throw Error('Packaged renderer missing');
  const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const rpc=(method,params)=>new Promise((resolve,reject)=>{const request=++id;const timer=setTimeout(()=>reject(Error('CDP timeout: '+method)),15000);const handler=e=>{const v=JSON.parse(e.data);if(v.id!==request)return;ws.removeEventListener('message',handler);clearTimeout(timer);if(v.error||v.result.exceptionDetails)reject(Error(JSON.stringify(v)));else resolve(v.result);};ws.addEventListener('message',handler);ws.send(JSON.stringify({id:request,method,params}));});
  const evalJS=async expression=>(await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
  try{for(let i=0;i<30;i++){report.renderer=await evalJS(`({title:document.title,ready:document.readyState,booting:!document.documentElement||document.documentElement.classList.contains('spark-booting'),bridge:typeof window.desktop,buttons:document.querySelectorAll('button').length})`);if(report.renderer.ready==='complete'&&!report.renderer.booting&&report.renderer.bridge==='object'&&report.renderer.buttons>10){report.rendererPassed=true;break;}await delay(500);}if(!report.rendererPassed)throw Error('Renderer readiness failed');
   report.embeddedSettings=await evalJS(`(async()=>{const r=await window.desktop.loadCodexSettings();return {ok:r.ok,mode:r.value?.mode,hasBundledExecutable:r.value?.executable?.endsWith('/bin/codex/bin/codex'),loginButtons:['loginCodex','checkCodexLogin','cancelCodexLogin'].every(id=>!!document.getElementById(id)),assistant:!!document.getElementById('agentDialog')};})()`);
   if(!report.embeddedSettings.ok||report.embeddedSettings.mode!=='local'||!report.embeddedSettings.hasBundledExecutable||!report.embeddedSettings.loginButtons||!report.embeddedSettings.assistant)throw Error('Embedded settings/login UI missing');
   await fs.writeFile(path.join(dist,'smoke-renderer.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));
   await evalJS(`document.querySelector('.spark-sidebar [data-route="settings"]').click();true`);
   for(let i=0;i<30;i++){report.loginUi=await evalJS(`({open:document.getElementById('settingsDialog').open,visible:document.getElementById('loginCodex').getBoundingClientRect().width>0})`);if(report.loginUi.open&&report.loginUi.visible)break;await delay(300);}
   if(!report.loginUi.open||!report.loginUi.visible)throw Error('Login controls not visible in settings');
   const loginStatus=await evalJS(`window.desktop.codexLoginStatus()`);if(!loginStatus.ok)throw Error('Packaged account status IPC failed');report.loginUi.statusChecked=true;
   await fs.writeFile(path.join(dist,'smoke-login.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));}finally{ws.close();}
 }finally{clearTimeout(watchdog);child.kill('SIGTERM');await fs.writeFile(path.join(dist,'smoke-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await fs.writeFile(path.join(dist,'smoke-log.txt'),log);for(let i=0;i<20&&exit===undefined;i++)await delay(250);if(exit===undefined)child.kill('SIGKILL');await fs.rm(profile,{recursive:true,force:true,maxRetries:3});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
