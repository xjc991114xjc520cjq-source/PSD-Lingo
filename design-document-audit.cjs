const {textActionsFor}=require('./native-text-objects.cjs');
const {boardGroups}=require('./design-layout-planner.cjs');
const {validateAudit}=require('./services/design-page-audit.cjs');
// Geometry selects what to look at; only the rendered images decide acceptance.
function detailCrops(request,audit,board){
 const failed=audit.checks.filter(c=>c.verdict!=='pass'),keys=new Set(failed.flatMap(c=>c.layerKeys));
 let boxes=request.layers.filter(l=>keys.has(l.layerKey)).map(l=>l.box);
 if(!boxes.length)boxes=request.layers.map(l=>l.box);
 const crop=b=>{const pad=Math.max(20,Math.min(b[2],b[3])*.6),x=Math.max(board[0],b[0]-pad),y=Math.max(board[1],b[1]-pad),right=Math.min(board[0]+board[2],b[0]+b[2]+pad),bottom=Math.min(board[1]+board[3],b[1]+b[3]+pad);return [x,y,right-x,bottom-y];};
 const candidates=boxes.filter(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0).map(crop).filter(b=>b[2]>0&&b[3]>0&&b[2]*b[3]<board[2]*board[3]*.8);
 if(!candidates.length)for(let y=0;y<2;y++)for(let x=0;x<2;x++)candidates.push([board[0]+x*board[2]*.45,board[1]+y*board[3]*.45,board[2]*.55,board[3]*.55]);
 const unique=[...new Map(candidates.map(b=>[JSON.stringify(b),b])).values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 return unique.length<=6?unique:Array.from({length:6},(_,i)=>unique[Math.round(i*(unique.length-1)/5)]);
}
async function auditDesignFile({file,records,fitText,buildRequest,getVisual,call,cache,cacheIdentity='',forceReview=false,isCancelled=()=>false,onProgress=()=>{}}){
 const targets=file.layers.filter(l=>l.visible!==false&&!l.skipExport&&records.some(r=>r.id===l.recordId));
 const hidden=(file.artworkHides||[]).map(e=>({edit:e,object:file.artworkObjects?.find(o=>o.objectId===e.objectId&&o.sourceIdentity===e.sourceIdentity)}));
 if(hidden.some(h=>!h.object))throw Error('隐藏对象缺少已验证来源，无法审阅');
 for(const {object:o} of hidden)if(!targets.some(l=>l.boardNames?.length===1&&l.boardNames[0]===o.boardNames[0]))targets.push({id:'artwork:'+o.objectId,box:o.box,boardBox:o.boardBox,boardNames:o.boardNames,artworkOnly:true});
 if(!targets.length&&!textActionsFor(file).length)return {passed:false,scope:'bound-artboards',boards:[],failures:['没有可审阅的已绑定画板']};
 for(const a of textActionsFor(file)){const l=file.layers.find(l=>l.id===a.layerId);if(!targets.some(t=>t.boardNames?.[0]===l.boardNames?.[0]))targets.push({...l,artworkOnly:true,boardBox:l.boardBox||[0,0,file.width,file.height],boardNames:l.boardNames?.length?l.boardNames:['画布']});}
 const groups=boardGroups(file,targets);if(!groups.length)return {passed:false,scope:'bound-artboards',boards:[],failures:['画板归属不明确，不能将总览视为整页验收']};
 const boards=[],failures=[];let reusedBoards=0;
 for(let i=0;i<groups.length;i++){
  if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');const g=groups[i];onProgress({label:`整页审阅 ${i+1}/${groups.length}：${g.name}`,current:i,total:groups.length});
  const seed=targets.find(l=>g.ids.includes(l.id)),layer=seed.artworkOnly?file.layers.find(l=>l.visible!==false&&l.boardNames?.includes(g.name)):seed;
  const request=layer?buildRequest({file,layer,records,fitText,auditOnly:true}):{version:1,selectedLayerKey:'',canvas:{width:file.width,height:file.height},layers:[],containers:[]};
  const intersects=b=>b[0]<g.crop[0]+g.crop[2]&&b[0]+b[2]>g.crop[0]&&b[1]<g.crop[1]+g.crop[3]&&b[1]+b[3]>g.crop[1];
  request.layers=request.layers.filter(l=>intersects(l.sourceBox)||intersects(l.box));request.containers=request.containers.filter(c=>intersects(c.box));
  request.artworkObjects=(file.artworkObjects||[]).filter(o=>o.boardNames?.includes(g.name)).map(o=>({...o,hidden:hidden.some(h=>h.object.objectId===o.objectId)}));
  request.textObjectActions=textActionsFor(file);request.createdTextObjects=file.layers.filter(l=>l.nativeCreation&&l.visible!==false).map(l=>({layerId:l.id,creation:l.nativeCreation,recordIds:l.copyAdjustment?.recordIds}));
  request.visibilityEdits=hidden.filter(h=>h.object.boardNames.includes(g.name)).map(h=>({...h.edit,box:h.object.box,kind:h.object.kind}));
  const ids=new Set(file.layers.filter(l=>g.ids.includes(l.id)).flatMap(l=>[l.recordId,...(l.copyAdjustment?.recordIds||[])]));
  const anchors=new Set(records.filter(r=>ids.has(r.id)).flatMap(r=>(r.context?.imageCandidates||[]).map(a=>a.media)));
  request.copyReferences=records.filter(r=>ids.has(r.id)||(r.context?.imageCandidates||[]).some(a=>anchors.has(a.media))).map(r=>({id:r.id,original:r.original,target:r.target,source:r.source,boundInThisBoard:ids.has(r.id)}));
  request.referenceLimits='图片锚点只帮助找候选资料，不证明归属。不能把共享锚点或未使用条目直接判作本页漏文案，也不能以绑定数作完整性证明。';
  Object.assign(request,{designReviewSources:require('./services/design-plugins/manifest.json').skills.map(s=>({...s,required:['design-critique','graphic-judgment'].includes(s.id)})),phase:'audit',designReviewVersion:1,designSkillIdentity:require('./services/design-skill-manifest.json'),activeBoard:{name:g.name,box:g.crop},selectedLayerKeys:g.ids.map(String),scope:'full'});
  const visuals=await getVisual({file,layer,scope:'full',crop:g.crop,requireCurrent:true});
  if(!visuals?.some(v=>v.stage==='current'))throw Error('整页审阅缺少实际当前画面');
  request.visuals=visuals.filter(v=>['source','current'].includes(v.stage)).slice(0,2);
  const cacheKey=cache&&JSON.stringify([cacheIdentity,file.fingerprint,request]);
  if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');
  const pluginFailures=a=>(a.skillReviews||[]).filter(c=>['revise','uncertain'].includes(c.verdict)).map(c=>g.name+' / skill:'+c.id+'：'+c.evidence);
  const saved=cacheKey&&!forceReview&&cache.get(cacheKey);if(saved){const audit=structuredClone(saved);boards.push(audit);failures.push(...pluginFailures(audit));for(const c of audit.checks)if(c.verdict!=='pass')failures.push(`${g.name} / ${c.id} / ${c.verdict}：${c.evidence}`);for(const c of audit.designChecks||[])if(c.verdict!=='accept')failures.push(`${g.name} / design:${c.id} / ${c.verdict}：${c.evidence}`);reusedBoards++;continue;}
  let result=await call('suggestLayout',request),audit=validateAudit(result.audit,{...request,repairGuidanceVersion:result.repairGuidanceVersion});
  const initialAudit=structuredClone(audit);
  if([...audit.checks,...(audit.designChecks||[]),...(audit.skillReviews||[])].some(c=>c.verdict==='uncertain')){
   const details=[];
   for(const crop of detailCrops(request,audit,g.crop)){
    if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');
    const images=await getVisual({file,layer,scope:'full',crop,requireCurrent:true}),current=images?.find(v=>v.stage==='current');
    if(!current||!Array.isArray(current.crop)||current.crop.some((n,i)=>Math.abs(n-crop[i])>.01))throw Error('细节审阅缺少对应区域的实际当前画面');
    details.push(current);
   }
   request.visuals=[...request.visuals,...details];request.detailReview={previousChecks:initialAudit.checks,crops:details.map(v=>v.crop),instruction:'本轮包含同一当前画面的整页与局部细节。逐项重新判断；细节用于辨认小字、线条和留白，整页用于层级及视觉关系。可见真实缺陷仍fail，仍看不清则uncertain；不得仅因为有细节图就通过。没有可编辑背景线引用不等于文字必然无法避让，先考虑授权文字的整体位置、行数与同组关系。'};
   request.detailReview.previousDesignChecks=initialAudit.designChecks;
   request.detailReview.previousSkillReviews=initialAudit.skillReviews;request.detailReview.previousRepairPlan=initialAudit.repairPlan;
   result=await call('suggestLayout',request);audit=validateAudit(result.audit,{...request,repairGuidanceVersion:result.repairGuidanceVersion});
  }
  if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');boards.push({board:g.name,crop:g.crop,reviewSources:result.designReviewSources,reviewTransport:result.reviewTransport,...audit,...(request.detailReview?{initialSkillReviews:initialAudit.skillReviews,initialRepairPlan:initialAudit.repairPlan,initialChecks:initialAudit.checks,initialDesignChecks:initialAudit.designChecks,detailCrops:request.detailReview.crops}:{})});
  failures.push(...pluginFailures(audit));
  for(const c of audit.checks)if(c.verdict!=='pass')failures.push(`${g.name} / ${c.id} / ${c.verdict}：${c.evidence}`);
  for(const c of audit.designChecks||[])if(c.verdict!=='accept')failures.push(`${g.name} / design:${c.id} / ${c.verdict}：${c.evidence}`);
  if(cacheKey){cache.set(cacheKey,structuredClone(boards.at(-1)));if(cache.size>16)cache.delete(cache.keys().next().value);}
 }
 return {passed:!failures.length,scope:'bound-artboards',boards,failures,reusedBoards};
}
module.exports={auditDesignFile};
