const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {artboardVisual}=require('../photoshop-artboards.cjs');
function createArtboardOperations({run,directory,requireOutput}){
 const cache=new Map(),delivered=new Map(),deliveredVisuals=new Map();
 return async function operate(input,task,progress=()=>{}){
  if(!input?.source||!input.plan||!['preview','export','visual','verify'].includes(input.action))throw Error('画板调用参数无效');
  const key=crypto.createHash('sha256').update(JSON.stringify([task.id,input.source.path,input.source.fingerprint,input.plan])).digest('hex');
  let entry=cache.get(key);
  if(input.action==='visual'){if(!entry)throw Error('画板预览已失效，请重新preview');return artboardVisual(deliveredVisuals.get(key)||entry,input);}
  if(input.action==='verify'&&!entry)throw Error('画板成果缓存已失效，请重新导出');
  // run revalidates the imported fingerprint even when reusing a prepared copy.
  const result=await run({source:input.source,plan:input.plan,directory:path.join(directory(),task.id,key,crypto.randomUUID()),prepared:entry,onProgress:progress});
  cache.set(key,result);if(cache.size>12){const old=cache.keys().next().value;cache.delete(old);delivered.delete(old);deliveredVisuals.delete(old);}entry=result;
  if(input.action==='verify'){const saved=delivered.get(key);if(!saved)throw Error('画板尚未导出');for(const a of saved)if(await require('../photoshop-file-io.cjs').hashFile(a.path)!==a.hash)throw Error('最终画板交付文件已变化，审验结果失效');return {verified:true,reused:true};}
  if(input.action==='export'){
   await requireOutput(task.outputDirectory);const dest=path.join(task.outputDirectory,'Sparkit-'+task.id,'artboards-'+key.slice(0,12));await fs.mkdir(dest,{recursive:true});
   const copy=async(from,to)=>{try{await fs.copyFile(from,to,require('node:fs').constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;if(await require('../photoshop-file-io.cjs').hashFile(from)!==await require('../photoshop-file-io.cjs').hashFile(to))throw Error('输出已有同名但不同的文件，未覆盖');}return to;};
   const output=await copy(entry.output,path.join(dest,(input.plan.documentName||'artboards')+'.'+entry.format.toLowerCase()));
   const boards=[];for(const [i,b]of entry.boards.entries())boards.push({...b,image:await copy(b.image,path.join(dest,'board-'+i+'.jpg'))});
   const artifacts=[{path:output,hash:entry.fingerprint}];for(const [i,b]of boards.entries())artifacts.push({path:b.image,hash:await require('../photoshop-file-io.cjs').hashFile(entry.boards[i].image)});delivered.set(key,artifacts);
   const exported={...entry,output,boards,delivery:{...entry.delivery,boards},artifactFingerprints:[...(entry.artifactFingerprints||[]),...artifacts],exported:true,reused:!!result.reused};
   // Subsequent visual requests must read the actual delivered JPEG, not the temporary proof.
   deliveredVisuals.set(key,exported);return exported;
  }
  const offset=input.offset??0,limit=input.limit??3;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>3)throw Error('画板预览每批1至3张，请按boardName或offset分页');const selected=input.boardName?entry.boards.filter(b=>b.name===input.boardName):entry.boards.slice(offset,offset+limit);
  if(!selected.length)throw Error('画板名称不存在');
  const visuals=[];for(const b of selected)visuals.push(await artboardVisual(entry,{boardName:b.name,crop:input.crop}));
  return {...entry,visuals,shownBoards:selected.map(b=>b.name),nextOffset:!input.boardName&&offset+limit<entry.boards.length?offset+limit:null,reused:!!result.reused};
 };
}
module.exports={createArtboardOperations};
