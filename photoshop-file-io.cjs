const fs=require('node:fs/promises');
const {createReadStream}=require('node:fs');
const crypto=require('node:crypto');
const {inspectPhotoshopFile}=require('./photoshop-file.cjs');
function sameSnapshot(a,b){return a.size===b.size&&a.mtimeMs===b.mtimeMs&&a.ctimeMs===b.ctimeMs&&a.ino===b.ino&&a.dev===b.dev;}
async function inspectFile(filePath,io=fs){
 const handle=await io.open(filePath,'r');
 try{
  const stat=await handle.stat();if(!stat.isFile())throw new Error('请选择 PSD / PSB 文件。');
  const header=Buffer.alloc(26),{bytesRead}=await handle.read(header,0,header.length,0);
  return {...inspectPhotoshopFile(header.subarray(0,bytesRead),stat.size),stat};
 }finally{await handle.close();}
}
async function hashFile(filePath,{expectedStat,io=fs,stream=createReadStream,createDigest=()=>crypto.createHash('sha256'),onProgress}={}){
 const before=expectedStat||await io.stat(filePath),digest=createDigest();let length=0;
 // A bounded read buffer works above Node's single-Buffer allocation limit.
 for await(const chunk of stream(filePath,{highWaterMark:1024*1024})){
  length+=chunk.length;if(length>before.size)throw new Error('源文件在校验期间发生变化，请保存后重新导入。');
  digest.update(chunk);
  onProgress?.({current:length,total:before.size});
 }
 const after=await io.stat(filePath);
 if(length!==before.size||!sameSnapshot(before,after))throw new Error('源文件在校验期间发生变化，请保存后重新导入。');
 return digest.digest('hex');
}
module.exports={inspectFile,hashFile,sameSnapshot};
