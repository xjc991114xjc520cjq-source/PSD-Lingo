const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile,spawn}=require('node:child_process'),exec=require('node:util').promisify(execFile);

async function verifyApp(app,version){
 if((await fs.lstat(app)).isSymbolicLink())throw Error('更新应用不能是符号链接');
 const plist=path.join(app,'Contents/Info.plist');
 const read=async key=>(await exec('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist])).stdout.trim();
 if(await read('CFBundleIdentifier')!=='com.sparkit.desktop'||version&&await read('CFBundleShortVersionString')!==version)throw Error('DMG 内应用身份或版本不匹配');
 await exec('/usr/bin/codesign',['--verify','--deep','--strict',app],{timeout:60000});
}

// This self-contained worker is copied out of the app before the app exits.
// It keeps the old bundle as a backup and never touches user data or Keychain.
async function replacementWorker(ticketFile){
 const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
 const exec=require('node:util').promisify(require('node:child_process').execFile);
 delete process.env.ELECTRON_RUN_AS_NODE;
 const ticket=JSON.parse(await fs.readFile(ticketFile,'utf8'));
 const {target,staged,backup,parentPid,version,sealHash,executableHash,launchArguments=[],launchEnvironment={}}=ticket;
 const acknowledgement=path.join(path.dirname(ticketFile),'launch-ack.json');
 const openArgs=['-n','--env','SPARKIT_UPDATE_ACK='+acknowledgement];
 for(const key of ['CODEX_HOME','SPARKIT_KEYCHAIN_TEST_NAMESPACE'])if(launchEnvironment[key])openArgs.push('--env',key+'='+launchEnvironment[key]);
 openArgs.push(target);if(launchArguments.length)openArgs.push('--args',...launchArguments);
 let moved=false,installed=false;
 const result=async value=>fs.writeFile(ticketFile+'.result',JSON.stringify(value));
 try{
  if(path.basename(target)!=='Sparkit.app'||path.dirname(target)!==path.dirname(staged)||path.dirname(target)!==path.dirname(backup)||!path.basename(staged).startsWith('.Sparkit-update-')||!path.basename(backup).startsWith('.Sparkit-backup-'))throw Error('更新路径无效');
  await fs.writeFile(ticketFile+'.ready','ready',{mode:0o600});
  let exited=false;
  for(let i=0;i<480;i++){try{process.kill(parentPid,0);}catch(e){if(e.code==='ESRCH'){exited=true;break;}throw e;}await new Promise(resolve=>setTimeout(resolve,250));}
  if(!exited)throw Error('应用未退出，取消替换');
  for(const app of [target,staged]){
   if((await fs.lstat(app)).isSymbolicLink()||await fs.realpath(app)!==app)throw Error('拒绝链接应用路径');
   const {stdout}=await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(app,'Contents/Info.plist')]);
   if(stdout.trim()!=='com.sparkit.desktop')throw Error('应用身份变化');
  }
  const {stdout}=await exec('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',path.join(staged,'Contents/Info.plist')]);
  if(stdout.trim()!==version)throw Error('应用版本变化');
  const hash=async name=>crypto.createHash('sha256').update(await fs.readFile(path.join(staged,name))).digest('hex');
  if(await hash('Contents/_CodeSignature/CodeResources')!==sealHash||await hash('Contents/MacOS/Sparkit')!==executableHash)throw Error('暂存应用完整性变化');
  await exec('/usr/bin/codesign',['--verify','--deep','--strict',staged],{timeout:60000});
  await fs.rename(target,backup);moved=true;
  await fs.rename(staged,target);installed=true;
  await exec('/usr/bin/open',openArgs,{timeout:30000});
  let ready=false;
  for(let i=0;i<240;i++){try{const ack=JSON.parse(await fs.readFile(acknowledgement,'utf8'));if(ack.version===version){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
  if(!ready)throw Error('新版窗口启动未确认，恢复旧版');
  await result({passed:true,version,target,backup,relaunched:true});
 }catch(error){
  if(moved){
   if(installed){const {stdout}=await exec('/bin/ps',['-axo','pid=,command=']);for(const line of stdout.split('\n')){const m=/^\s*(\d+)\s+(.+)$/.exec(line);if(m&&+m[1]!==process.pid&&(m[2]===target+'/Contents/MacOS/Sparkit'||m[2].startsWith(target+'/Contents/MacOS/Sparkit ')))try{process.kill(+m[1],'SIGTERM');}catch{}}await fs.rename(target,staged);}
   await fs.rename(backup,target);await exec('/usr/bin/open',openArgs,{timeout:30000}).catch(()=>{});
  }
  await result({passed:false,error:error.message,restored:moved});
  process.exitCode=1;
 }
}

async function stageDmg(bytes,manifest,dataDir){
 if(manifest.packageType!=='dmg'||manifest.updaterProtocol!==3||bytes.length!==manifest.length||crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('DMG 长度或 SHA-256 不匹配');
 const dir=path.join(dataDir,'updates');await fs.mkdir(dir,{recursive:true,mode:0o700});
 const file=path.join(dir,manifest.sha256+'.dmg');
 await require('./durable-file.cjs').writeVerifiedFile(file,bytes);
 await exec('/usr/bin/hdiutil',['verify',file],{timeout:120000});
 return file;
}

async function verifyDmgDistribution(file,version){
 const directory=await fs.mkdtemp(path.join(require('node:os').tmpdir(),'sparkit-dmg-verify-'));
 let attached=false;
 try{
  await exec('/usr/bin/hdiutil',['verify',file],{timeout:120000});
  await exec('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',directory,file],{timeout:120000});attached=true;
  await verifyApp(path.join(directory,'Sparkit.app'),version);
 }finally{if(attached)await exec('/usr/bin/hdiutil',['detach',directory],{timeout:30000});await fs.rmdir(directory);}
}

async function prepareReplacement(file,manifest,{exe,dataDir,launchArguments=[],launchEnvironment={}}){
 if(process.platform!=='darwin')throw Error('DMG 更新需要 macOS');
 const suffix='/Contents/MacOS/Sparkit';
 if(!exe?.endsWith(suffix))throw Error('请从 Applications 中的 Sparkit.app 启动后更新');
 const target=exe.slice(0,-suffix.length),parent=path.dirname(target);
 if(path.basename(target)!=='Sparkit.app'||await fs.realpath(target)!==target||target.includes('/AppTranslocation/'))throw Error('请先将 Sparkit.app 拖到 Applications，再更新');
 await verifyApp(target);
 await fs.access(parent,require('node:fs').constants.W_OK);
 const directory=await fs.mkdtemp(path.join(dataDir,'updates/dmg-install-'));await fs.chmod(directory,0o700);
 const mount=path.join(directory,'volume');await fs.mkdir(mount);
 const nonce=crypto.randomUUID(),staged=path.join(parent,'.Sparkit-update-'+nonce+'.app'),backup=path.join(parent,'.Sparkit-backup-'+nonce+'.app');
 let attached=false;
 try{
  await exec('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-noautoopen','-mountpoint',mount,file],{timeout:120000});attached=true;
  const source=path.join(mount,'Sparkit.app');await verifyApp(source,manifest.version);
  await exec('/usr/bin/ditto',[source,staged],{timeout:180000});
  await verifyApp(staged,manifest.version);
  // Authorized publisher-signed test distribution, scoped to this verified copy.
  // No global Gatekeeper setting is changed and no PKG installer is involved.
  const {stdout}=await exec('/usr/bin/xattr',['-r',staged],{maxBuffer:16*1024*1024});
  if(stdout.includes('com.apple.quarantine'))await exec('/usr/bin/xattr',['-dr','com.apple.quarantine',staged],{timeout:60000});
  await verifyApp(staged,manifest.version);
  const hash=async name=>crypto.createHash('sha256').update(await fs.readFile(path.join(staged,name))).digest('hex');
  const ticketFile=path.join(directory,'install.json'),worker=path.join(directory,'worker.cjs');
  await fs.writeFile(ticketFile,JSON.stringify({target,staged,backup,parentPid:process.pid,version:manifest.version,launchArguments,launchEnvironment,sealHash:await hash('Contents/_CodeSignature/CodeResources'),executableHash:await hash('Contents/MacOS/Sparkit')}),{mode:0o600});
  await fs.writeFile(worker,'('+replacementWorker.toString()+')(process.argv[2]).catch(e=>{console.error(e);process.exitCode=1});',{mode:0o600});
  return {ticketFile,worker,target,staged,backup};
 }catch(error){await fs.rm(staged,{recursive:true,force:true});throw error;}
 finally{if(attached)await exec('/usr/bin/hdiutil',['detach',mount],{timeout:30000});}
}

async function launchReplacement(prepared,exe){
 const child=spawn(exe,[prepared.worker,prepared.ticketFile],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},cwd:path.dirname(prepared.worker),detached:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 for(let i=0;i<100;i++){
  if(await fs.access(prepared.ticketFile+'.ready').then(()=>true,()=>false))return;
  if(child.exitCode!==null)throw Error('更新助手未能启动，应用保留运行');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 child.kill();throw Error('更新助手启动超时，应用保留运行');
}
module.exports={verifyApp,verifyDmgDistribution,stageDmg,prepareReplacement,launchReplacement,replacementWorker};
