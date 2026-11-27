const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {createScriptQueue}=require('./illustrator-connection.cjs');
// Photoshop may wait on Illustrator through the per-job mailbox. Serializing
// both applications on one queue would deadlock that nested request.
const queues={photoshop:createScriptQueue(),illustrator:createScriptQueue()};
const hosts={photoshop:'com.adobe.Photoshop',illustrator:'com.adobe.illustrator'};
function command(exec,file,args,timeout){return new Promise((resolve,reject)=>exec(file,args,{encoding:'utf8',timeout,maxBuffer:1024*1024},(error,stdout,stderr)=>error?reject(Object.assign(error,{detail:String(stderr||error.message)})):resolve(String(stdout||'').trim())));}
function preflightError(error){const detail=String(error.detail||error.message||error),timeout=!!error.killed||error.code==='ETIMEDOUT'||error.code==='adobe_preflight_timeout'||/-1712|timed out|超时/.test(detail);return Object.assign(Error('macOS Adobe 连接预检'+(timeout?'超时':'失败')+'，文件脚本尚未提交：'+detail+(/-1743/.test(detail)?'；请在系统设置的“隐私与安全性 → 自动化”中允许灵搭控制 Adobe。':'')),{uncertain:false,nativePhase:'preflight',code:timeout?'adobe_preflight_timeout':'adobe_preflight_failed'});}
// Keep JSX and user paths out of AppleScript source. argv is passed without a shell.
function appleScript(host){
 const id=hosts[host];if(!id)throw Error('不支持的 Adobe 程序');
 const command=host==='photoshop'?'do javascript file jsxFile':'do javascript jsxFile';
 return `on run argv\nset jsxFile to POSIX file (item 1 of argv)\nwith timeout of 3600 seconds\ntell application id "${id}"\n${command}\nend tell\nend timeout\nend run\n`;
}
async function findMacAdobe(host,{exec=execFile,timeoutMs=15000,now=Date.now}={}){
 const id=hosts[host];if(!id)throw Error('不支持的 Adobe 程序');
 const deadline=now()+timeoutMs;
 const inventory=`ObjC.import('AppKit');const apps=$.NSWorkspace.sharedWorkspace.runningApplications;let found=false;for(let i=0;i<apps.count;i++){if(ObjC.unwrap(apps.objectAtIndex(i).bundleIdentifier)===${JSON.stringify(id)})found=true;}JSON.stringify({running:found});`;
 try{const value=JSON.parse(await command(exec,'/usr/bin/osascript',['-l','JavaScript','-e',inventory],Math.min(timeoutMs,5000)));if(value.running)return {id,running:true};}catch{} // LaunchServices is the fallback if inventory is unavailable.
 if(now()>=deadline)throw preflightError(Object.assign(Error('应用发现超时'),{code:'ETIMEDOUT'}));
 return new Promise((resolve,reject)=>exec('/usr/bin/open',['-Ra','-b',id],{timeout:Math.max(1,deadline-now())},error=>{
  if(!error)return resolve({id,running:false});
  const failed=Error('未找到 '+(host==='photoshop'?'Adobe Photoshop':'Adobe Illustrator')+'。请安装并激活后重试；原稿尚未修改。');
  Object.assign(failed,{uncertain:false,nativePhase:'preflight',code:error.killed?'adobe_preflight_timeout':'adobe_preflight_failed'});reject(failed);
 }));
}
async function prepareMacAdobe(host,{exec=execFile,discover=findMacAdobe,timeoutMs=45000,now=Date.now,wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 if(!hosts[host])throw Error('不支持的 Adobe 程序');
 const deadline=now()+timeoutMs,remaining=()=>Math.max(1,deadline-now());let launched=false;
 for(let attempt=0;attempt<4;attempt++){
  try{
   const app=await discover(host,{exec,timeoutMs:remaining()});
   if(app?.running===false&&!launched){launched=true;await command(exec,'/usr/bin/open',['-g','-b',hosts[host]],Math.min(15000,remaining()));}
   if(now()>=deadline)throw Object.assign(Error('连接等待超时'),{code:'ETIMEDOUT'});
   const probe=`with timeout of ${Math.max(1,Math.floor(Math.min(10000,remaining())/1000))} seconds\ntell application id "${hosts[host]}"\ndo javascript "'sparkit-native-ready'"\nend tell\nend timeout`;
   const value=await command(exec,'/usr/bin/osascript',['-e',probe],Math.min(11000,remaining()));
   if(value!=='sparkit-native-ready')throw Error('原生脚本接口未返回预期就绪结果');
   return {ready:true,attempts:attempt+1,launched};
  }catch(error){
   const transient=error.killed||error.code==='ETIMEDOUT'||error.code==='adobe_preflight_timeout'||/-600\b|-609\b|-1712\b|-10810\b/.test(String(error.detail||error.message));
   if(!transient||attempt===3||now()>=deadline)throw preflightError(error);
   await wait(Math.min(500*(attempt+1),remaining()));
   if(now()>=deadline)throw preflightError(Object.assign(Error('连接等待超时'),{code:'ETIMEDOUT'}));
  }
 }
}
async function runMacAdobeScript(host,jsx,{platform=process.platform,io=fs,exec=execFile,discover=findMacAdobe,ready=prepareMacAdobe}={}){
 if(platform!=='darwin')throw Error('macOS Adobe 通道只能在 Mac 上运行');
 const source=appleScript(host);
 if(typeof jsx!=='string'||!path.posix.isAbsolute(jsx)||/[\0\r\n]/.test(jsx))throw Error('JSX 文件路径无效');
 if(!(await io.stat(jsx)).isFile())throw Error('JSX 文件不存在');
 return queues[host](async()=>{await ready(host,{exec,discover});return new Promise((resolve,reject)=>{
  let child;
  try{
   child=exec('/usr/bin/osascript',['-',jsx],{encoding:'utf8',timeout:3610000,maxBuffer:1024*1024},(error,stdout,stderr)=>{
    if(!error)return resolve({completed:true,transport:'apple-events'});
    const detail=String(stderr||error.message).trim();
    const failed=Error('macOS Adobe 调用失败：'+detail+(/-1743/.test(detail)?'；请在系统设置的“隐私与安全性 → 自动化”中允许灵搭控制 Adobe。':''));
    // After dispatch, a timeout or lost response never authorizes a second edit.
    failed.uncertain=!['ENOENT','EACCES'].includes(error.code);
    failed.nativePhase=failed.uncertain?'script':'preflight';
    reject(failed);
   });
   child.stdin.on('error',()=>{}); // Process callback owns the execution result.
   child.stdin.end(source,'utf8');
  }catch(error){reject(error);}
 });});
}
module.exports={appleScript,runMacAdobeScript,findMacAdobe,prepareMacAdobe};
