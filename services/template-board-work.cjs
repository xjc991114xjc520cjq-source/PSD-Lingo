const crypto=require('node:crypto');
const {requestTemplate}=require('../sku-template-routing.cjs');
function boardWorkKey(source,plan,b){
 if(!canSample(plan)||!b||b.changes?.length)return null;
 const request=plan.productTemplate.requests.find(r=>r.boardId===b.templateId);
 const entry=request&&requestTemplate(plan.productTemplate,request);
 return crypto.createHash('sha256').update(JSON.stringify([source,b,request||null,entry?.template,entry?.giftCatalog?.digest])).digest('hex');
}
function canSample(plan){return !!plan.productTemplate&&plan.operation==='edit'&&plan.boards.every(b=>b.mode==='duplicate'&&b.templateId!==null&&!b.changes?.length);}
function representativeBoardIds(plan){
 if(!canSample(plan))return [];
 const seen=new Set(),ids=[];
 for(const b of plan.boards){const r=plan.productTemplate?.requests.find(r=>r.boardId===b.templateId);if(!r)continue;const gifts=r.actions.filter(a=>a.mode==='gift-replace').flatMap(a=>a.gifts||[]),entry=requestTemplate(plan.productTemplate,r),key=JSON.stringify([r.templateFileId||entry.template.path,gifts.length,r.actions.filter(a=>a.mode==='remove').map(a=>a.objectId),r.priceStructure]);if(!seen.has(key)){seen.add(key);ids.push(b.templateId);}}
 return ids;
}
async function validBoardWork(source,plan,candidates,hash){
 const checked=new Map(),accepted=new Map();
 for(const r of candidates){const b=plan.boards.find(b=>b.templateId===r.boardId);if(!b||!r.key||r.key!==boardWorkKey(source,plan,b)||!r.nativeRecord?.templateCheck)continue;
  if(!checked.has(r.output))checked.set(r.output,Promise.resolve().then(()=>hash(r.output)).catch(()=>null));
  if(await checked.get(r.output)===r.fingerprint)accepted.set(r.boardId,r);
 }
 return [...accepted.values()];
}
function selectResumeDocument(plan,valid){
 if(!canSample(plan))return null;
 const groups=new Map();for(const r of valid){if(!r.partial||!Array.isArray(r.completedBoardKeys)||!r.completedBoardKeys.length)continue;if(!groups.has(r.output))groups.set(r.output,[]);groups.get(r.output).push(r);}
 const choices=[...groups.values()].filter(rows=>rows.every(r=>r.fingerprint===rows[0].fingerprint&&JSON.stringify(r.completedBoardKeys)===JSON.stringify(rows[0].completedBoardKeys))&&rows[0].completedBoardKeys.every(key=>rows.some(r=>r.key===key)));
 choices.sort((a,b)=>b.length-a.length);if(!choices.length)return null;
 const rows=choices[0];return {output:rows[0].output,fingerprint:rows[0].fingerprint,boardIds:rows.map(r=>r.boardId)};
}
module.exports={boardWorkKey,representativeBoardIds,canSample,validBoardWork,selectResumeDocument};
