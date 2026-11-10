const fs=require('node:fs/promises'),path=require('node:path');
const {hashFile}=require('../photoshop-file-io.cjs');
function createExportCache(run){
 const entries=new WeakMap();
 return async function exportOnce(task,plan,directory){
  const key=JSON.stringify({...plan,createdAt:undefined}),cached=entries.get(task);
  if(cached?.key===key&&cached.directory===directory){
   for(const f of plan.files||[])if(await hashFile(f.path)!==f.fingerprint)throw Error('源文件已变化，不能复用之前导出，请重新导入');
   let unchanged=true;for(const output of cached.outputs)try{if(await hashFile(output.path)!==output.hash)unchanged=false;}catch{unchanged=false;}
   if(unchanged)return {...structuredClone(cached.result),reused:true};
  }
  const result=await run(plan,directory),outputs=[];
  if(!result.uncertain&&!result.failed&&result.saved>0&&Array.isArray(result.results)){
   for(const r of result.results){if(!r.output)continue;const relative=path.relative(directory,r.output);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))continue;try{if((await fs.stat(r.output)).isFile())outputs.push({path:r.output,hash:await hashFile(r.output)});}catch{}}
   if(outputs.length===result.saved)entries.set(task,{key,directory,result:structuredClone(result),outputs});
  }
  return result;
 };
}
module.exports={createExportCache};
