const fs=require('node:fs/promises');
const {inspectFile,hashFile,sameSnapshot}=require('./photoshop-file-io.cjs');
const {needsNativePhotoshop}=require('./photoshop-file.cjs');
const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
async function readPhotoshopInput(file,{native,inspect=inspectFile,read=fs.readFile,checksum=hashFile,reserve=()=>()=>{}}={}){
 const info=await inspect(file);
 if(needsNativePhotoshop(info)){
  const release=reserve();try{
  const fingerprint=await checksum(file,{expectedStat:info.stat}),result=await native(info);
  const m=result.metadata;if(m.width!==info.width||m.height!==info.height||m.bitsPerChannel!==8||m.colorMode!==3)throw Error('原稿尺寸或颜色模式在读取期间发生变化，请重新导入。');
  if(await checksum(file)!==fingerprint)throw Error('源文件在读取期间发生变化，请保存后重新导入。');
  return {...result,format:info.format,fingerprint};
  }finally{release();}
 }
 const bytes=await read(file),after=await inspect(file);if(bytes.length!==info.stat.size||!sameSnapshot(info.stat,after.stat))throw Error('源文件在读取期间发生变化，请保存后重新导入。');
 return {format:info.format,fingerprint:hash(bytes),bytes:new Uint8Array(bytes)};
}
module.exports={readPhotoshopInput};
