const fs=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {createScriptQueue}=require('./illustrator-connection.cjs');
// Photoshop may wait on Illustrator through the per-job mailbox. Serializing
// both applications on one queue would deadlock that nested request.
const queues={photoshop:createScriptQueue(),illustrator:createScriptQueue()};
const hosts={photoshop:'com.adobe.Photoshop',illustrator:'com.adobe.illustrator'};
// Keep JSX and user paths out of AppleScript source. argv is passed without a shell.
function appleScript(host){
 const id=hosts[host];if(!id)throw Error('不支持的 Adobe 程序');
 const command=host==='photoshop'?'do javascript file jsxFile':'do javascript jsxFile';
 return `on run argv\nset jsxFile to POSIX file (item 1 of argv)\nwith timeout of 3600 seconds\ntell application id "${id}"\n${command}\nend tell\nend timeout\nend run\n`;
}
async function runMacAdobeScript(host,jsx,{platform=process.platform,io=fs,exec=execFile}={}){
 if(platform!=='darwin')throw Error('macOS Adobe 通道只能在 Mac 上运行');
 const source=appleScript(host);
 if(typeof jsx!=='string'||!path.posix.isAbsolute(jsx)||/[\0\r\n]/.test(jsx))throw Error('JSX 文件路径无效');
 if(!(await io.stat(jsx)).isFile())throw Error('JSX 文件不存在');
 return queues[host](()=>new Promise((resolve,reject)=>{
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
 }));
}
module.exports={appleScript,runMacAdobeScript};
