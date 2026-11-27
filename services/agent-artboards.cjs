const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const boardWorkPolicy=require('./template-board-work.cjs');
const {artboardVisual}=require('../photoshop-artboards.cjs');
function selectPreviewBoards(entry,input){
 const offset=input.offset??0,limit=input.limit??3;if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>3)throw Error('画板预览每批1至3张，请按boardName或offset分页');
 if(input.crop!==undefined){const c=input.crop;if(!Array.isArray(c)||c.length!==4||!c.every(Number.isFinite)||c[2]<=0||c[3]<=0)throw Error('画板预览范围须为全局坐标[x,y,width,height]');const matches=entry.boards.filter(b=>{const r=b.crop||b.box;if(!r)return false;return c[0]>=r[0]&&c[1]>=r[1]&&c[0]+c[2]<=r[0]+r[2]+.1&&c[1]+c[3]<=r[1]+r[3]+.1;});if(matches.length!==1)throw Error('预览范围必须完整落在一个画板内，请使用返回的boards.box或指定boardName查看整页');return matches;}
 const selected=input.boardName?entry.boards.filter(b=>b.name===input.boardName):entry.boards.slice(offset,offset+limit);if(!selected.length)throw Error('画板名称不存在');return selected;
}
function createArtboardOperations({run,directory,requireOutput,visual=artboardVisual}){
 const scopes=new Map(),boardWork=new Map(),cache=new Map(),delivered=new Map(),deliveredVisuals=new Map();
 const operate=async function operate(input,task,progress=()=>{}){
  if(!input?.source||!input.plan||!['preview','export','visual','verify'].includes(input.action))throw Error('画板调用参数无效');
  const scope=task.executionScope||task.id;
  const key=crypto.createHash('sha256').update(JSON.stringify([input.plan.productTemplate?2:0,scope,input.source.path,input.source.fingerprint,input.plan])).digest('hex');
  let entry=cache.get(key),previewBoardIds;
  const sampling=input.action==='preview'&&boardWorkPolicy.canSample(input.plan);
  const representatives=sampling?boardWorkPolicy.representativeBoardIds(input.plan):[];
  const representativeNames=new Set(input.plan.boards?.filter(b=>representatives.includes(b.templateId)).map(b=>b.name));
  const explicit=!!input.boardName||input.crop!==undefined;
  const plannedBoards=input.plan.boards?.map(b=>({...b,box:b.box||input.artboards?.find(a=>a.id===b.templateId)?.box}));
  const previewPlan=sampling?{boards:explicit?plannedBoards:plannedBoards.filter(b=>representativeNames.has(b.name))}:null;
  const requested=sampling?selectPreviewBoards(previewPlan,input).map(b=>b.templateId):[];
  if(sampling&&(!entry||entry.partial&&requested.some(id=>!entry.boardReuse?.some(b=>b.boardId===id)))){
   entry=undefined;previewBoardIds=explicit?requested:representatives;
  }
  if(input.action==='export'&&entry?.partial)entry=undefined;
  if(input.action==='visual'){if(!entry)throw Error('画板预览已失效，请重新preview');return visual(deliveredVisuals.get(key)||entry,input);}
  if(input.action==='verify'&&!entry)throw Error('画板成果缓存已失效，请重新导出');
  if(input.action==='verify'&&!delivered.has(key))throw Error('画板尚未导出');
  if(input.action==='export')await requireOutput(task.outputDirectory);
  // run revalidates the imported fingerprint even when reusing a prepared copy.
  const result=await run({source:input.source,plan:input.plan,directory:path.join(directory(),task.id,key,crypto.randomUUID()),prepared:entry,previewBoardIds,reusableBoards:[...boardWork.values()].filter(r=>r.scope===scope),onProgress:progress});
  if(result?.uncertain||require('./agent-operation-result.cjs').operationFailure(result))return result;
  for(const b of result.boardReuse||[])boardWork.set(scope+':'+b.key,{...b,scope});while(boardWork.size>120)boardWork.delete(boardWork.keys().next().value);
  scopes.set(key,scope);cache.set(key,result);if(cache.size>12){const old=cache.keys().next().value;cache.delete(old);delivered.delete(old);deliveredVisuals.delete(old);scopes.delete(old);}entry=result;
  if(input.action==='verify'){const saved=delivered.get(key);if(!saved)throw Error('画板尚未导出');for(const a of saved)if(await require('../photoshop-file-io.cjs').hashFile(a.path)!==a.hash)throw Error('最终画板交付文件已变化，审验结果失效');return {verified:true,reused:true};}
  if(input.action==='export'){
   if(entry.partial||input.plan.boards&&entry.boards.length!==input.plan.boards.length)throw Error('代表画板预览不能作为整批导出');
   const dest=path.join(task.outputDirectory,'Sparkit-'+scope,'artboards-'+key.slice(0,12));await fs.mkdir(dest,{recursive:true});
   const copy=async(from,to)=>{try{await fs.copyFile(from,to,require('node:fs').constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;if(await require('../photoshop-file-io.cjs').hashFile(from)!==await require('../photoshop-file-io.cjs').hashFile(to))throw Error('输出已有同名但不同的文件，未覆盖');}return to;};
   const output=await copy(entry.output,path.join(dest,(input.plan.documentName||'artboards')+'.'+entry.format.toLowerCase()));
   const boards=[];for(const [i,b]of entry.boards.entries())boards.push({...b,image:await copy(b.image,path.join(dest,'board-'+i+'.jpg'))});
   const artifacts=[{path:output,hash:entry.fingerprint}];for(const [i,b]of boards.entries())artifacts.push({path:b.image,hash:await require('../photoshop-file-io.cjs').hashFile(entry.boards[i].image)});delivered.set(key,artifacts);
   const exported={...entry,output,boards,delivery:{...entry.delivery,boards},artifactFingerprints:[...(entry.artifactFingerprints||[]),...artifacts],exported:true,reused:!!result.reused};
   // Subsequent visual requests must read the actual delivered JPEG, not the temporary proof.
   deliveredVisuals.set(key,exported);return exported;
  }
  const offset=input.offset??0,limit=input.limit??3,previewEntry=sampling&&!explicit?{boards:entry.boards.filter(b=>representativeNames.has(b.name))}:entry,selected=selectPreviewBoards(previewEntry,input);
  const visuals=[];for(const b of selected)visuals.push(await visual(entry,{boardName:b.name,crop:input.crop}));
  return {...entry,visuals,shownBoards:selected.map(b=>b.name),previewScope:entry.partial?'template-representatives':'full',representativeBoards:entry.partial?entry.boards.map(b=>b.name):undefined,remainingBoards:entry.partial?input.plan.boards.filter(b=>!entry.boards.some(r=>r.name===b.name)).map(b=>b.name):[],nextOffset:!input.boardName&&!input.crop&&offset+limit<previewEntry.boards.length?offset+limit:null,reused:!!result.reused};
 };
 operate.capture=scope=>{const keys=[...scopes].filter(([,v])=>v===scope).map(([k])=>k);return {schema:1,scope,cache:keys.map(k=>[k,cache.get(k)]),delivered:keys.filter(k=>delivered.has(k)).map(k=>[k,delivered.get(k)]),visuals:keys.filter(k=>deliveredVisuals.has(k)).map(k=>[k,deliveredVisuals.get(k)]),boards:[...boardWork].filter(([,b])=>b.scope===scope)};};
 operate.restore=s=>{if(s?.schema!==1)return;for(const [k,v]of s.cache||[]){cache.set(k,v);scopes.set(k,s.scope);}for(const [k,v]of s.delivered||[])delivered.set(k,v);for(const [k,v]of s.visuals||[])deliveredVisuals.set(k,v);for(const [k,v]of s.boards||[])boardWork.set(k,v);};
 return operate;
}
module.exports={createArtboardOperations,selectPreviewBoards};
