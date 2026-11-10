// First-paint regression: hold the real renderer bundle, then release or fail it.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.env.SPARKIT_STARTUP_ROOT||path.resolve(__dirname,'..'),out='D:/PSD-Lingo/work/startup-first-paint';app.setPath('userData',out+'/profile');
const safe=value=>({ok:true,value});for(const [name,value] of Object.entries({'load-codex-settings':{},'service-ready':true,'layout-memory-status':{},'status':{active:true,authorization:{active:true},updates:{}},'agent-state':null}))ipcMain.handle(name,()=>safe(value));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let exit=0;const evidence=[];try{await fs.mkdir(out,{recursive:true});for(const fail of [false,true]){
 const win=new BrowserWindow({show:false,width:1400,height:960,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false,partition:'startup-'+fail+'-'+Date.now()}});try{
 let release,requested;const held=new Promise(r=>requested=r);win.webContents.session.webRequest.onBeforeRequest({urls:['file://*/*bundle.js']},(details,callback)=>{release=callback;requested();});win.webContents.debugger.attach('1.3');const evaluate=async expression=>(await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 const loading=win.loadFile(path.join(root,'renderer/index.html'));await held;await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const before=await evaluate(`(()=>{const cover=document.getElementById('sparkBootCover'),shell=document.querySelector('.shell');return {booting:document.documentElement.classList.contains('spark-booting'),cover:!!cover,top:document.elementFromPoint(innerWidth/2,innerHeight/2)?.id,workspaceVisibility:getComputedStyle(shell).visibility}})()`);assert.deepEqual(before,{booting:true,cover:true,top:'sparkBootCover',workspaceVisibility:'hidden'});await fs.writeFile(out+(fail?'/03-before-failure.png':'/01-before-bundle.png'),(await win.webContents.capturePage()).toPNG());
 release({cancel:fail});await loading;await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 if(fail){assert.equal(await evaluate('window.sparkitBoot.failed'),true);assert.equal(await evaluate("document.documentElement.classList.contains('spark-booting')"),false);assert.equal(await evaluate("getComputedStyle(document.querySelector('.shell')).visibility"),'visible');evidence.push('failed bundle releases cover and forbids late automatic animation');}
 else{assert.equal(await evaluate('window.sparkitStartup.active'),true);assert.equal(await evaluate("document.documentElement.classList.contains('spark-booting')"),false);assert.equal(await evaluate("document.elementFromPoint(innerWidth/2,innerHeight/2).closest('#sparkStartup')!==null"),true);await fs.writeFile(out+'/02-startup.png',(await win.webContents.capturePage()).toPNG());await evaluate('window.sparkitStartup.skip()');assert.equal(await evaluate("!!document.getElementById('sparkStartup')"),false);assert.equal(await evaluate("getComputedStyle(document.querySelector('.spark-home')).visibility"),'visible');evidence.push('held bundle first paint covers workspace; atomic animation handoff; skip reveals home');
 await evaluate('window.sparkitReplayStartup({reduced:true}).finished');assert.equal(await evaluate("!!document.getElementById('sparkStartup')"),false);evidence.push('reduced motion replay completes and leaves home usable');}
 }finally{win.destroy();}}
 await fs.writeFile(out+'/verified.json',JSON.stringify({passed:true,evidence},null,2));console.log('PASS startup first paint',evidence);
 }catch(error){console.error(error);exit=1;}finally{app.exit(exit)}});



