const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Apple Silicon required');
 const dist=path.resolve(__dirname,'../work/mac-dist'),profile=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-mac-smoke-'));
 const child=spawn(path.join(dist,'Sparkit.app/Contents/MacOS/Sparkit'),['--user-data-dir='+profile,'--remote-debugging-port=0'],{stdio:['ignore','pipe','pipe']});
 let log='',exit;child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v);child.on('exit',code=>exit=code);
 const report={platform:process.platform,arch:process.arch,rendererPassed:false,nativeHardware:'not-tested',adobe:'requires-user-Mac'};
 try{
  const {invokeDeviceService}=require('../services/device-service.cjs'),helperRoot=path.join(dist,'Sparkit.app/Contents/Resources/app');
  const call=request=>invokeDeviceService(null,request,{root:helperRoot,timeoutMs:15000});
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
  let port;
  for(let i=0;i<90;i++){if(exit!==undefined)throw Error('App exited before renderer: '+exit);try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}await delay(500);}
  if(!port)throw Error('No renderer debugging endpoint');
  let page;for(let i=0;i<30;i++){page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;await delay(500);}
  if(!page)throw Error('Packaged renderer missing');
  const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let id=0;const rpc=(method,params)=>new Promise((resolve,reject)=>{const request=++id;const handler=e=>{const v=JSON.parse(e.data);if(v.id!==request)return;ws.removeEventListener('message',handler);if(v.error||v.result.exceptionDetails)reject(Error(JSON.stringify(v)));else resolve(v.result);};ws.addEventListener('message',handler);ws.send(JSON.stringify({id:request,method,params}));});
  const evalJS=async expression=>(await rpc('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
  try{for(let i=0;i<30;i++){report.renderer=await evalJS(`({title:document.title,ready:document.readyState,booting:!document.documentElement||document.documentElement.classList.contains('spark-booting'),bridge:typeof window.desktop,buttons:document.querySelectorAll('button').length})`);if(report.renderer.ready==='complete'&&!report.renderer.booting&&report.renderer.bridge==='object'&&report.renderer.buttons>10){report.rendererPassed=true;break;}await delay(500);}if(!report.rendererPassed)throw Error('Renderer readiness failed');await fs.writeFile(path.join(dist,'smoke-renderer.png'),Buffer.from((await rpc('Page.captureScreenshot',{format:'png'})).data,'base64'));}finally{ws.close();}
 }finally{child.kill('SIGTERM');await fs.writeFile(path.join(dist,'smoke-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await fs.writeFile(path.join(dist,'smoke-log.txt'),log);for(let i=0;i<20&&exit===undefined;i++)await delay(250);if(exit===undefined)child.kill('SIGKILL');await fs.rm(profile,{recursive:true,force:true,maxRetries:3});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
