const fs=require('node:fs/promises'),path=require('node:path');
const {hashFile}=require('../photoshop-file-io.cjs');
function createExportCache(run){
 const entries=new Map();
 const exportOnce=async function exportOnce(task,plan,directory){
  const key=JSON.stringify({...plan,createdAt:undefined}),cached=entries.get(task.executionScope||task.id||task);
  if(cached?.key===key&&cached.directory===directory){
   for(const f of plan.files||[])if(await hashFile(f.path)!==f.fingerprint)throw Error('源文件已变化，不能复用之前导出，请重新导入');
   let unchanged=true;for(const output of cached.outputs)try{if(await hashFile(output.path)!==output.hash)unchanged=false;}catch{unchanged=false;}
   if(unchanged)return {...structuredClone(cached.result),reused:true};
  }
  const result=await run(plan,directory),outputs=[];
  if(!result.uncertain&&!result.failed&&result.saved>0&&Array.isArray(result.results)){
   let complete=true;
   for(const r of result.results){if(!r.output){complete=false;continue;}const artifacts=[r.output,...(r.delivery?.boards||[]).map(b=>b.path)];
    for(const artifact of artifacts){const relative=path.relative(directory,artifact);if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){complete=false;continue;}try{if(!(await fs.stat(artifact)).isFile())throw Error('not a file');outputs.push({path:artifact,hash:await hashFile(artifact)});}catch{complete=false;}}
   }
   if(complete&&result.results.length===result.saved)entries.set(task.executionScope||task.id||task,{key,directory,result:structuredClone(result),outputs});
  }
  while(entries.size>12)entries.delete(entries.keys().next().value);
  return result;
 };
 exportOnce.capture=scope=>entries.get(scope)||null;
 exportOnce.restore=(scope,entry)=>{if(scope&&entry)entries.set(scope,entry);};
 return exportOnce;
}
module.exports={createExportCache};
