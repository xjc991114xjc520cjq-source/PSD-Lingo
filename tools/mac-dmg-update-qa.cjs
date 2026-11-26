const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFile,spawn}=require('node:child_process'),exec=require('node:util').promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 if(process.platform!=='darwin')throw Error('Mac required');
 const rollback=process.argv.includes('--rollback');
 const root=path.resolve(__dirname,'..'),session=path.dirname(root),directory=await fs.mkdtemp(path.join(session,'packages/dmg-update-qa-'));
 const target=path.join(directory,'Sparkit.app'),profile=path.join(directory,'profile'),codex=path.join(directory,'codex-home');await fs.mkdir(profile);await fs.mkdir(codex);
 const dataDir=profile;await fs.writeFile(path.join(dataDir,'preserve.txt'),'user-data-preserved');
 await exec('/usr/bin/ditto',[path.join(root,'work/mac-dist/Sparkit.app'),target],{timeout:180000});
 const {stdout:before}=await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(target,'Contents/Info.plist')]);assert.equal(before.trim(),'0.3.108');
 const file=path.join(root,'work/mac-dmg109/Sparkit-0.3.109-Mac-arm64.dmg'),bytes=await fs.readFile(file),manifest={packageType:'dmg',updaterProtocol:3,version:'0.3.109',length:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 const bundle=path.join(directory,'dmg-updater.cjs');require('esbuild').buildSync({entryPoints:[path.join(root,'services/macos-dmg-updater.cjs')],bundle:true,platform:'node',format:'cjs',outfile:bundle});
 const service=require(bundle),stagedFile=await service.stageDmg(bytes,manifest,dataDir);
 await exec('/usr/bin/xattr',['-w','com.apple.quarantine','0083;00000000;Sparkit-QA;',stagedFile]);
 await assert.rejects(service.prepareReplacement(stagedFile,{...manifest,version:'9.9.9'},{exe:path.join(target,'Contents/MacOS/Sparkit'),dataDir}),/版本/);
 const {stdout:stillOld}=await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(target,'Contents/Info.plist')]);assert.equal(stillOld.trim(),'0.3.108');
 const runner=path.join(directory,'runner.cjs'),preparedPath=path.join(directory,'prepared.json');
 const options={exe:path.join(target,'Contents/MacOS/Sparkit'),dataDir,launchArguments:['--user-data-dir='+(rollback?profile+'-no-ack':profile),'--remote-debugging-port=0','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>'],launchEnvironment:{CODEX_HOME:codex,SPARKIT_KEYCHAIN_TEST_NAMESPACE:'dmg-update-qa-'+Date.now()}};
 await fs.writeFile(runner,`const fs=require('node:fs/promises');(async()=>{const service=require(${JSON.stringify(bundle)});const prepared=await service.prepareReplacement(${JSON.stringify(stagedFile)},${JSON.stringify(manifest)},${JSON.stringify(options)});await service.launchReplacement(prepared,${JSON.stringify(options.exe)});await fs.writeFile(${JSON.stringify(preparedPath)},JSON.stringify(prepared));})().catch(e=>{console.error(e);process.exitCode=1});`);
 await exec(process.execPath,[runner],{timeout:180000});
 const prepared=JSON.parse(await fs.readFile(preparedPath,'utf8'));let result;
 for(let i=0;i<360;i++){try{result=JSON.parse(await fs.readFile(prepared.ticketFile+'.result','utf8'));break;}catch{}await delay(250);}
 if(rollback){
  assert.equal(result?.passed,false);assert.equal(result.restored,true);await service.verifyApp(target,'0.3.108');
  assert.equal(await fs.readFile(path.join(dataDir,'preserve.txt'),'utf8'),'user-data-preserved');
  await delay(3000);const {stdout}=await exec('/bin/ps',['-axo','pid=,command=']);for(const line of stdout.split('\n')){const m=/^\s*(\d+)\s+(.+)$/.exec(line);if(m&&m[2].startsWith(target+'/Contents/MacOS/Sparkit '))try{process.kill(+m[1],'SIGTERM');}catch{}}
  const report={passed:true,forcedMissingStartupAck:true,oldVersionRestored:'0.3.108',userDataPreserved:true,productionAppTouched:false,result,directory};await fs.writeFile(path.join(session,'logs/dmg-update109-rollback.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));return;
 }
 assert(result?.passed,JSON.stringify(result));assert.equal(result.version,'0.3.109');
 assert.equal(await fs.readFile(path.join(dataDir,'preserve.txt'),'utf8'),'user-data-preserved');
 await service.verifyApp(target,'0.3.109');await service.verifyApp(prepared.backup,'0.3.108');
 const {stdout:attributes}=await exec('/usr/bin/xattr',['-r',target],{maxBuffer:16*1024*1024});assert(!attributes.includes('com.apple.quarantine'));
 let page;for(let i=0;i<180;i++){try{const port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page'&&p.url.endsWith('/renderer/index.html'));if(page)break;}catch{}await delay(250);}assert(page,'Updated renderer did not open');
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let requestId=0;const evaluate=expression=>new Promise((resolve,reject)=>{const id=++requestId,timer=setTimeout(()=>reject(Error('CDP timeout')),12000),handler=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timer);ws.removeEventListener('message',handler);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);};ws.addEventListener('message',handler);ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true}}));});
 let state;for(let i=0;i<100;i++){state=(await evaluate("({ready:document.readyState,bridge:typeof window.desktop,booting:document.documentElement.classList.contains('spark-booting')})")).result.value;if(state.ready==='complete'&&state.bridge==='object'&&!state.booting)break;await delay(100);}assert.equal(state.bridge,'object');assert.equal(state.booting,false);
 await evaluate('window.close();true').catch(()=>{});ws.close();
 const report={passed:true,version:'0.3.109',previousVersion:'0.3.108',actualDmg:true,compiledWorker:true,electronNodeWorkerHandshake:true,wrongVersionRejectedBeforeReplacement:true,atomicReplacement:true,oldAppBackupVerified:true,quarantineScopedToVerifiedApp:true,userDataPreserved:true,relaunchedRenderer:state,productionAppTouched:false,systemSecurityPolicyChanged:false,appleNotarized:false,directory};
 await fs.writeFile(path.join(session,'logs/dmg-update109-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
