const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
function createTypographyWorkflow({runArtboards,runPhotoshop,directory,isBusy=()=>false}){
 async function requireOutput(dir){if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('请先选择输出位置');await fs.access(dir,require('node:fs').constants.W_OK);if(!(await fs.stat(dir)).isDirectory())throw Error('输出位置不是文件夹');return dir;}
 const scope=crypto.randomUUID(),cache=new Map(),artboards=require('./agent-artboards.cjs').createArtboardOperations({run:runArtboards,directory,requireOutput});let running=false;
 return async input=>{
  if(running||isBusy())throw Error('请先完成当前助手或 Adobe 任务');running=true;try{
  if(input.action==='metadata')return await runArtboards({source:input.source,metadataOnly:true,nativeText:true,boardIds:input.boardIds,nativeTextScanId:input.nativeTextScanId});
  if(['preview','export'].includes(input.action)){
   if(!input.plan?.files?.length||input.plan.files.some(f=>!f.typographyEdits?.length))throw Error('没有待导出的字体修改');
   if(input.action==='export')await requireOutput(input.outputDirectory);
   const {hashFile}=require('../photoshop-file-io.cjs');
   const key=crypto.createHash('sha256').update(JSON.stringify({...input.plan,createdAt:undefined})).digest('hex');const cached=cache.get(key);let result=cached?.result;
   if(cached){for(const f of input.plan.files)if(await hashFile(f.path)!==f.fingerprint)throw Error('源文件已变化，请重新导入');for(const a of cached.artifacts)if(await hashFile(a.path)!==a.hash)throw Error('预览副本或图片已变化，请重新应用设置');}
   if(!result){result=await runPhotoshop(input.plan,path.join(directory(),scope,key),{deferLearning:true});if(result.failed||result.uncertain||result.results?.some(r=>r.error))return result;const artifacts=[];for(const r of result.results||[]){if(!r.delivery?.verified||!r.delivery?.reopened)throw Error('副本尚未通过保存重开与JPG核验');for(const p of [r.output,...r.delivery.boards.map(b=>b.path)])artifacts.push({path:p,hash:await hashFile(p)});}cache.set(key,{result,artifacts});while(cache.size>8)cache.delete(cache.keys().next().value);}
   if(input.action==='preview'){const boards=(result.results||[]).flatMap(r=>r.delivery?.boards||[]),selected=input.boardName?boards.filter(b=>b.name===input.boardName):boards.slice(0,1),visuals=[];for(const b of selected)visuals.push({name:b.name,crop:b.crop,dataURL:'data:image/jpeg;base64,'+(await fs.readFile(b.path)).toString('base64')});if(!visuals.length)throw Error('未取得实际导出的预览图片');return {boards:boards.map(b=>({name:b.name,crop:b.crop})),visuals};}
   const dest=path.join(input.outputDirectory,'Sparkit-fonts-'+scope,key.slice(0,12));await fs.mkdir(dest,{recursive:true});
   const copy=async p=>{const to=path.join(dest,path.basename(p));try{await fs.copyFile(p,to,require('node:fs').constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST'||await hashFile(p)!==await hashFile(to))throw e;}return to;};
   const results=[];for(const r of result.results){const output=await copy(r.output),boards=[];for(const b of r.delivery?.boards||[])boards.push({...b,path:await copy(b.path)});results.push({...r,output,delivery:{...r.delivery,boards}});}return {...result,results,reused:true};
  }
  const action=input.action?.replace(/^native-/,'');if(!['preview','visual','export'].includes(action)||!input.plan?.boards?.some(b=>b.changes.some(c=>c.layout?.typography)))throw Error('字体预览或导出计划无效');
  return await artboards({...input,action},{id:scope,outputDirectory:input.outputDirectory},()=>{});
  }finally{running=false;}
 };
}
module.exports={createTypographyWorkflow};
