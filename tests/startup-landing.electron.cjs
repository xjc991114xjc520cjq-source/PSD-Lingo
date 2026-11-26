const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.SPARKIT_LANDING_OUT||path.join(root,'work/startup-landing');app.setPath('userData',path.join(out,'profile'));
for(const [key,value]of Object.entries({'load-codex-settings':{},'service-ready':true,'layout-memory-status':{},'status':{active:true,authorization:{active:true},updates:{}},'agent-state':null,'diagnostic-status':{}}))ipcMain.handle(key,()=>({ok:true,value}));
app.whenReady().then(async()=>{let win;try{
 await fs.mkdir(out,{recursive:true});win=new BrowserWindow({show:true,width:1440,height:900,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}});win.webContents.debugger.attach('1.3');
 const js=async expression=>{const r=await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;},settle=()=>js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 await win.loadFile(path.join(root,'renderer/index.html'));await js('window.sparkitStartup?.skip()');const checks=[];
 for(const width of [1440,1080]){
  win.setSize(width,900);await settle();await js('window.sparkitReplayStartup({manual:true,reduced:false}).seek(600)');await settle();
  const halo=await js(`(()=>{const s=getComputedStyle(document.querySelector('.startup-ribbon'));return {radius:s.borderRadius,mask:s.maskImage}})()`);assert.notEqual(halo.mask,'none');assert.equal(halo.radius,'50%');await fs.writeFile(path.join(out,'halo-'+width+'.png'),(await win.webContents.capturePage()).toPNG());
  // Resize in flight: the landing must use the new destination, not cached geometry.
  win.setSize(width===1440?1280:1200,900);await settle();await js('window.sparkitReplayStartup({manual:true,reduced:false}).seek(2200)');win.setSize(width,900);await settle();
  await js(`document.querySelector('#sparkStartup').getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=2950})`);await settle();
  const landing=await js(`(()=>{const dock=document.querySelector('.startup-dock-logo'),target=document.querySelector('.spark-brand .spark-logo'),a=dock.getBoundingClientRect(),b=target.getBoundingClientRect();return {dock:a.toJSON(),target:b.toJSON(),opacity:getComputedStyle(dock).opacity,flightOpacity:getComputedStyle(document.querySelector('.startup-emblem')).opacity,imageWidth:getComputedStyle(dock.querySelector('img')).width,targetImageWidth:getComputedStyle(target.querySelector('img')).width}})()`);
  for(const key of ['x','y','width','height'])assert(Math.abs(landing.dock[key]-landing.target[key])<.25,key+' landing mismatch');assert.equal(landing.opacity,'1');assert.equal(landing.flightOpacity,'0');assert.equal(landing.imageWidth,landing.targetImageWidth);
  await fs.writeFile(path.join(out,'landing-'+width+'.png'),(await win.webContents.capturePage()).toPNG());checks.push({width,halo,landing});
 }
 await js('window.sparkitReplayStartup({reduced:true}).finished');assert.equal(await js("!!document.getElementById('sparkStartup')"),false);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:true,platform:process.platform,checks},null,2));console.log('PASS landing and soft halos',JSON.stringify(checks));app.exit(0);
 }catch(e){console.error(e);app.exit(1);}});
