import {restoreExtractedContainers} from './extracted-container-state.js';
// A language preview uses a separate working state; the main project is restored
// by reference so neither language edits nor cancellation can mutate it.
export async function hydrateBatchFiles({items,plan,savedLayers},parseImported){
  const files=[];
  for(const item of items){
   const f=await parseImported(item),source=plan.files.find(p=>p.path===f.path);
   if(!source)throw new Error('语言预览原稿与模板不一致。');
   for(const l of f.layers){
    l.recordId=null;l.suggestedId=null;delete l.customText;delete l.manual;delete l.position;
    const j=source.jobs.find(j=>j.layerId===l.id);l.skipExport=!j;
    if(!j)continue;
    const p=j.previewLayout,r=plan.records.find(r=>r.id===j.recordId);
    if(!p||!r)throw new Error('语言预览绑定不完整。');
    l.sourceAlignment=l.sourceAlignment||l.alignment||'left';l.sourceBox=[...(j.box||l.box)];l.recordId=r.id;l.box=[...p.box];l.position={x:p.box[0],y:p.box[1]};l.alignment='left';
    l.manual={enabled:true,size:p.size,font:p.font,weight:p.weight,tracking:p.tracking,leading:p.leading,stretchX:p.stretchX,stretchY:p.stretchY};
    l.minSize=Math.min(p.size,j.minSize||p.size*.6);l.smart={allowWrap:false,allowLeading:false,trackingLimit:0};
    if(p.text!==r.target)l.customText=p.text;
   }
   const saved=savedLayers?.find(s=>s.path===f.path);if(saved)for(const l of f.layers){const previous=saved.layers.find(p=>p.id===l.id),sourceBox=l.sourceBox&&[...l.sourceBox];if(previous)Object.assign(l,JSON.parse(JSON.stringify(previous)));if(sourceBox)l.sourceBox=sourceBox;}
   const savedFile=savedLayers?.find(s=>s.path===f.path);
   restoreExtractedContainers(f,savedFile?.extractedContainers??source.extractedContainers??[]);
   f.artworkHides=JSON.parse(JSON.stringify(savedFile?.artworkHides??source.artworkHides??[]));for(const e of f.artworkHides){const o=f.artworkObjects?.find(o=>o.objectId===e.objectId),l=f.layers.find(l=>l.id===o?.layerId);if(l){l.skipExport=true;l.visible=false;l.artworkHidden=true;}}
   f.containerEdits=JSON.parse(JSON.stringify(savedFile?.containerEdits??source.containerEdits??[]));
   for(const e of f.containerEdits){const text=f.layers.find(l=>l.id===e.textLayerId);if(text)text.containerId=e.layerId;}
   files.push(f);
  }
  if(!files.length)throw new Error('此语言没有可预览的原稿。');
  return files;
}
export function createBatchPreview({state,parseImported,makePlan,refresh,getView=()=>null,restoreView=()=>{}}){
 let original=null;
 const keys=['files','records','docName','docFingerprint','sourceDocument','fileIndex','layerIndex','chosen','checked','comparing','scale','batchPreviewId'];
 async function enter(prepared,id){
  if(original)throw new Error('请先保存或放弃当前语言调整。');
  const {plan}=prepared,files=await hydrateBatchFiles(prepared,parseImported);
  original={state:Object.fromEntries(keys.map(k=>[k,state[k]])),view:getView()};
  Object.assign(state,{files,records:JSON.parse(JSON.stringify(plan.records)),docName:plan.docName,docFingerprint:plan.docFingerprint,sourceDocument:null,fileIndex:0,layerIndex:0,chosen:files[0].layers.find(l=>l.recordId)?.recordId||null,checked:false,comparing:undefined,batchPreviewId:id});
  const first=files[0].layers.findIndex(l=>l.recordId);state.layerIndex=Math.max(0,first);
  refresh(true);
 }
 async function capture(){if(!original)throw new Error('没有正在调整的语言。');return makePlan({allowEmpty:true});}
 function exit(){if(!original)return;const snapshot=original;original=null;Object.assign(state,snapshot.state);refresh(false);restoreView(snapshot.view);}
 return {enter,capture,exit,getLayers:()=>state.files.map(f=>({path:f.path,artworkHides:JSON.parse(JSON.stringify(f.artworkHides||[])),layers:JSON.parse(JSON.stringify(f.layers)),extractedContainers:JSON.parse(JSON.stringify(f.extractedContainers||[])),containerEdits:JSON.parse(JSON.stringify(f.containerEdits||[]))})),isActive:()=>!!original};
}
