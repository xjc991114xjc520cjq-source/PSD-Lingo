const {textActionsFor}=require('./native-text-objects.cjs');
const {boardGroups}=require('./design-layout-planner.cjs');
const {validateAudit}=require('./services/design-page-audit.cjs');
// Geometry selects what to look at; only the rendered images decide acceptance.
function detailCrops(request,audit,board){
 const failed=audit.checks.filter(c=>c.verdict==='uncertain'),keys=new Set(failed.flatMap(c=>c.layerKeys));
 let boxes=request.layers.filter(l=>keys.has(l.layerKey)).map(l=>l.box);
 if(!boxes.length)boxes=request.layers.map(l=>l.box);
 const crop=b=>{const pad=Math.max(20,Math.min(b[2],b[3])*.6),x=Math.max(board[0],b[0]-pad),y=Math.max(board[1],b[1]-pad),right=Math.min(board[0]+board[2],b[0]+b[2]+pad),bottom=Math.min(board[1]+board[3],b[1]+b[3]+pad);return [x,y,right-x,bottom-y];};
 const candidates=boxes.filter(b=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[2]>0&&b[3]>0).map(crop).filter(b=>b[2]>0&&b[3]>0&&b[2]*b[3]<board[2]*board[3]*.8);
 if(!candidates.length)for(let y=0;y<2;y++)for(let x=0;x<2;x++)candidates.push([board[0]+x*board[2]*.45,board[1]+y*board[3]*.45,board[2]*.55,board[3]*.55]);
 const unique=[...new Map(candidates.map(b=>[JSON.stringify(b),b])).values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
 return unique.length<=6?unique:Array.from({length:6},(_,i)=>unique[Math.round(i*(unique.length-1)/5)]);
}
function auditTargets(file,records){
 const targets=file.layers.filter(l=>l.visible!==false&&!l.skipExport&&records.some(r=>r.id===l.recordId));
 for(const e of file.mixedTextEdits||[]){const l=file.layers.find(l=>l.id===e.layerId);if(!l||!records.some(r=>r.id===e.recordId))throw Error('混合改字来源失效，无法审阅');if(!targets.some(t=>t.id===l.id))targets.push({...l,recordId:e.recordId,artworkOnly:true});}
 const hidden=(file.artworkHides||[]).map(e=>({edit:e,object:file.artworkObjects?.find(o=>o.objectId===e.objectId&&o.sourceIdentity===e.sourceIdentity)}));
 if(hidden.some(h=>!h.object))throw Error('隐藏对象缺少已验证来源，无法审阅');
 for(const {object:o} of hidden)if(!targets.some(l=>l.boardNames?.length===1&&l.boardNames[0]===o.boardNames[0]))targets.push({id:'artwork:'+o.objectId,box:o.box,boardBox:o.boardBox,boardNames:o.boardNames,artworkOnly:true});
 for(const a of textActionsFor(file)){const l=file.layers.find(l=>l.id===a.layerId);if(!targets.some(t=>t.boardNames?.[0]===l.boardNames?.[0]))targets.push({...l,artworkOnly:true,boardBox:l.boardBox||[0,0,file.width,file.height],boardNames:l.boardNames?.length?l.boardNames:['画布']});}
 for(const b of file.composedBoards||[])if(!targets.some(l=>l.boardNames?.includes(b.name)))targets.push({id:'artboard:'+b.id,box:b.box,boardBox:b.box,boardNames:[b.name],artworkOnly:true});
 return {targets,hidden};
}
function deliveryBoardsFor(file,records){const {targets}=auditTargets(file,records);return boardGroups(file,targets).map(g=>({name:g.name,crop:g.crop}));}
async function auditDesignFile({file,records,fitText,buildRequest,getVisual,call,callBatch,cache,cacheIdentity='',forceReview=false,reviewProfile='delivery',requireDelivery=false,isCancelled=()=>false,onProgress=()=>{}}){
 const {targets,hidden}=auditTargets(file,records);
 const groups=boardGroups(file,targets);if(!groups.length)return {passed:false,scope:'bound-artboards',boards:[],failures:['画板归属不明确，不能将总览视为整页验收']};
 const boards=[],failures=[];let reusedBoards=0,completed=0;
 const performance={pages:groups.length,imagePreparationMs:0,analysisMs:0,initialExchanges:0,detailExchanges:0,detailPages:0,cacheHits:0};
 async function prepareJob(i){const started=Date.now();
  if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');const g=groups[i];onProgress({label:`准备审验图片 ${i+1}/${groups.length} · 已审 ${completed}/${groups.length}`,current:completed,total:groups.length});
  const intersects=b=>b[0]<g.crop[0]+g.crop[2]&&b[0]+b[2]>g.crop[0]&&b[1]<g.crop[1]+g.crop[3]&&b[1]+b[3]>g.crop[1];
  const belongs=l=>l.boardNames?.length?l.boardNames.includes(g.name):intersects(l.box);
  const scopedFile={...file,layers:file.layers.filter(belongs),containers:(file.containers||[]).filter(c=>intersects(c.box))};
  const seed=targets.find(l=>g.ids.includes(l.id)),layer=seed.artworkOnly?file.layers.find(l=>l.visible!==false&&l.boardNames?.includes(g.name)):seed;
  const request=layer?buildRequest({file:scopedFile,layer,records,fitText,auditOnly:true}):{version:1,selectedLayerKey:'',canvas:{width:file.width,height:file.height},layers:[],containers:[]};
  request.layers=request.layers.filter(l=>intersects(l.sourceBox)||intersects(l.box));request.containers=request.containers.filter(c=>intersects(c.box));
  request.artworkObjects=(file.artworkObjects||[]).filter(o=>o.boardNames?.includes(g.name)).map(o=>({...o,hidden:hidden.some(h=>h.object.objectId===o.objectId)}));
  request.nativeMixedEdits=(file.mixedTextEdits||[]).filter(e=>g.ids.includes(e.layerId));request.textObjectActions=textActionsFor(file).filter(a=>scopedFile.layers.some(l=>l.id===a.layerId));request.createdTextObjects=scopedFile.layers.filter(l=>l.nativeCreation&&l.visible!==false).map(l=>({layerId:l.id,creation:l.nativeCreation,recordIds:l.copyAdjustment?.recordIds}));
  request.visibilityEdits=hidden.filter(h=>h.object.boardNames.includes(g.name)).map(h=>({...h.edit,box:h.object.box,kind:h.object.kind}));
  const ids=new Set(file.layers.filter(l=>g.ids.includes(l.id)).flatMap(l=>[l.recordId,...(l.copyAdjustment?.recordIds||[])]));
  for(const e of request.nativeMixedEdits)ids.add(e.recordId);
  const anchors=new Set(records.filter(r=>ids.has(r.id)).flatMap(r=>(r.context?.imageCandidates||[]).map(a=>a.media)));
  request.copyReferences=records.filter(r=>ids.has(r.id)||(r.context?.imageCandidates||[]).some(a=>anchors.has(a.media))).map(r=>({id:r.id,original:r.original,target:r.target,source:r.source,boundInThisBoard:ids.has(r.id)}));
  if(file.templateCopy){const fields=file.templateCopy.records.filter(r=>r.context.boardName===g.name),decision=file.templateCopy.decisions.boards.find(b=>file.artboards?.some(a=>a.id===b.boardId&&a.name===g.name));request.copyReferences=fields.map(r=>({id:r.id,original:r.original,target:r.target,context:r.context,boundInThisBoard:!decision?.fieldExclusions?.some(e=>e.recordId===r.id),excluded:decision?.fieldExclusions?.find(e=>e.recordId===r.id)?.reason}));request.nativeTemplateReplacement={templateSource:file.composedBoards.find(b=>b.name===g.name)?.templateSource||null,verified:file.composedBoards.find(b=>b.name===g.name)?.templateVerified===true,changes:file.composedBoards.find(b=>b.name===g.name)?.templateChanges||[],excludedFields:decision?.fieldExclusions||[],giftReference:file.composedBoards.find(b=>b.name===g.name)?.templateGiftReference||null,priceStructure:file.composedBoards.find(b=>b.name===g.name)?.templatePriceStructure||[],removedObjects:file.composedBoards.find(b=>b.name===g.name)?.templateRemoved||[],note:'整块模板已在副本替换并核验保存重开。价格项减少必须默认清除对应标签、金额和失效运算符，剩余内容回收空槽；按这些逐产品字段和最终JPG检查价格完整性、孤立符号、原项空槽、优惠区清理、容器留白与视觉位置，主价与明细分容器，保留有效0和用户布局。赠品还须核对当前表格对应的数量、名称、价值、PNG款式颜色、等比图形、留白及无旧赠品残留。跳过画板未替换。数值框不作为美感评分。'};}

  request.giftVisualReferences=file.composedBoards?.find(b=>b.name===g.name)?.giftVisualReferences||[];
  request.referenceLimits='图片锚点只帮助找候选资料，不证明归属。不能把共享锚点或未使用条目直接判作本页漏文案，也不能以绑定数作完整性证明。';
  Object.assign(request,{designReviewSources:require('./services/design-plugins/manifest.json').skills.map(s=>({...s,required:['design-critique','graphic-judgment'].includes(s.id)})),phase:'audit',designReviewVersion:1,designSkillIdentity:require('./services/design-skill-manifest.json'),activeBoard:{name:g.name,box:g.crop},selectedLayerKeys:g.ids.map(String),scope:'full'});
  const visuals=await getVisual({file,layer,scope:'full',crop:g.crop,requireCurrent:true,currentOnly:requireDelivery});
  if(!visuals?.some(v=>v.stage==='current'))throw Error('整页审阅缺少实际当前画面');
  if(requireDelivery){const current=visuals.find(v=>v.stage==='current');if(current.origin!=='exported-jpeg'||!current.deliveryEvidence?.reopened)throw Error('最终审验必须使用保存重开后的实际JPG');if(!Array.isArray(current.crop)||current.crop.length!==4||current.crop.some((n,i)=>!Number.isFinite(n)||Math.abs(n-g.crop[i])>.01))throw Error('最终审验缺少对应画板的完整JPG，不能用局部裁图替代整页');request.finalDelivery={jpegPath:current.deliveryEvidence.jpegPath||current.deliveryEvidence.imagePath,jpegHash:current.deliveryEvidence.jpegHash,board:g.name,reopened:true};request.compactAuditVersion=1;request.reviewProfile=require('./services/review-profile.cjs').normalize(reviewProfile);}
  request.visuals=visuals.filter(v=>requireDelivery?v.stage==='current':['source','current'].includes(v.stage)).slice(0,2);
  const cacheKey=cache&&await auditDigest(JSON.stringify([cacheIdentity,file.fingerprint,request]));
  if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');
  performance.imagePreparationMs+=Date.now()-started;return {g,layer,request,cacheKey};
 }
 async function analyze(jobs,detail=false){
  for(const batch of require('./services/design-audit-policy.cjs').windows(jobs)){
   if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');
   onProgress({label:('审验'+(detail?'细节':'整页'))+' · 已审 '+completed+'/'+groups.length+' · 本批 '+batch.length+' 张',current:completed,total:groups.length});
   const started=Date.now();
   const result=callBatch&&batch.length>1?await callBatch(batch.map(j=>j.request)):{pages:await Promise.all(batch.map(j=>call('suggestLayout',j.request)))};
   performance.analysisMs+=Date.now()-started;performance[detail?'detailExchanges':'initialExchanges']+=callBatch&&batch.length>1?1:batch.length;
   if(!Array.isArray(result?.pages)||result.pages.length!==batch.length)throw Error('合并审验返回画板数量不一致');
   batch.forEach((job,k)=>{job.result=result.pages[k];job.audit=validateAudit(job.result.audit,{...job.request,repairGuidanceVersion:job.result.repairGuidanceVersion});});
  }
 }
 // Prepare a bounded window, review it, then release its image payloads.
 // This does not create parallel Codex sessions or omit any board.
 const size=callBatch?require('./services/design-audit-policy.cjs').MAX_PAGES:1;
 for(let offset=0;offset<groups.length;offset+=size){
  const jobs=[];for(let i=offset;i<Math.min(groups.length,offset+size);i++)jobs.push(await prepareJob(i));
  const pending=[];
  for(const job of jobs){const saved=job.cacheKey&&!forceReview&&cache.get(job.cacheKey);if(saved){job.saved=structuredClone(saved);reusedBoards++;performance.cacheHits++;}else pending.push(job);}
  await analyze(pending);
  const details=[];
  for(const job of pending){
   const {request,audit,g,layer}=job;job.initialAudit=structuredClone(audit);
   if(requireDelivery||!needsDetail(audit))continue;
   const images=[];const started=Date.now();
   for(const crop of detailCrops(request,audit,g.crop)){
    if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');
    const visuals=await getVisual({file,layer,scope:'full',crop,requireCurrent:true,currentOnly:true}),current=visuals?.find(v=>v.stage==='current');
    if(!current||!Array.isArray(current.crop)||current.crop.some((n,i)=>Math.abs(n-crop[i])>.01))throw Error('细节审阅缺少对应区域的实际当前画面');
    if(requireDelivery&&(current.origin!=='exported-jpeg'||!current.deliveryEvidence?.reopened))throw Error('细节审阅必须使用同一交付JPG');images.push(current);
   }
   performance.imagePreparationMs+=Date.now()-started;
   request.visuals=[...request.visuals,...images];
   request.detailReview={previousChecks:audit.checks,previousDesignChecks:audit.designChecks,previousSkillReviews:audit.skillReviews,previousRepairPlan:audit.repairPlan,crops:images.map(v=>v.crop),instruction:'本轮是同一交付图的完整画板与按不确定区域补充的局部。只为辨认当前不确定项补图，不重做已明确的问题；仍完整返回各项判定及联合修改清单，不能将已确认缺陷抹掉，也不能因有局部图就通过。缺资料或归属不明不能靠重复看图解决，应保留不确定和明确所需资料。'};
   details.push(job);performance.detailPages++;
  }
  await analyze(details,true);
  for(const job of jobs){
   if(isCancelled())throw Error('任务已变化，整页审阅结果已丢弃');
   const {g,request,result,audit,initialAudit,cacheKey}=job;
   const value=job.saved||{board:g.name,crop:g.crop,reviewSources:result.designReviewSources,reviewTransport:result.reviewTransport,...audit,...(request.detailReview?{initialSkillReviews:initialAudit.skillReviews,initialRepairPlan:initialAudit.repairPlan,initialChecks:initialAudit.checks,initialDesignChecks:initialAudit.designChecks,detailCrops:request.detailReview.crops}:{})};
   boards.push(value);
   failures.push(...(value.skillReviews||[]).filter(c=>['revise','uncertain'].includes(c.verdict)).map(c=>g.name+' / skill:'+c.id+'：'+c.evidence));
   for(const c of value.checks)if(c.verdict!=='pass')failures.push(g.name+' / '+c.id+' / '+c.verdict+'：'+c.evidence);
   for(const c of value.designChecks||[])if(c.verdict!=='accept')failures.push(g.name+' / design:'+c.id+' / '+c.verdict+'：'+c.evidence);
   if(cacheKey&&!job.saved){cache.set(cacheKey,structuredClone(value));while(cache.size>Math.max(256,groups.length*2))cache.delete(cache.keys().next().value);}
   completed++;onProgress({label:'已审 '+completed+'/'+groups.length+'：'+g.name,current:completed,total:groups.length});
  }
 }
 return {passed:!failures.length,scope:'bound-artboards',boards,failures,reusedBoards,performance};
}
async function auditDigest(text){const bytes=new TextEncoder().encode(text);return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
function needsDetail(audit){
 return [...audit.checks,...(audit.designChecks||[]),...(audit.skillReviews||[])].filter(c=>c.verdict==='uncertain').some(c=>{
  const e=c.evidence||'';
  return !(/缺少.*(资料|依据|表格|原稿|信息)|未提供.*(资料|文案|表格|原稿)|归属.*(不明|无法)|需要.*(用户确认|用户批准)/.test(e)&&!/看不清|辨认|模糊|分辨率|缩略|小字|像素|字形/.test(e));
 });
}
module.exports={auditDesignFile,deliveryBoardsFor};
