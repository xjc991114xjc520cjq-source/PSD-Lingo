import {hydrateBatchFiles} from './batch-preview.js';
import {planAiFile} from '../design-layout-planner.cjs';
import {proposeVisualLayout} from '../visual-layout.cjs';
import {activeContainerEdits,recommendedContainer} from '../container-fit.cjs';
import {manualStyleFor} from '../layout.cjs';

// Batch preparation runs away from the live workspace and never changes its selection.
export function createBatchLayoutRuntime({parseImported,fitText,call,getSettings,document:doc=document,Image:ImageType=Image}){
 const backgrounds=new Map();
 const clone=v=>JSON.parse(JSON.stringify(v));
 const load=url=>new Promise((resolve,reject)=>{const img=new ImageType();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('预览图读取失败'));img.src=url;});
 function previewJob(l,r){
  const f=fitText(l,r),m=l.manual||{},box=l.position?[l.position.x,l.position.y,l.box[2],l.box[3]]:l.box,stretchY=(m.stretchY??100)/100;
  return {fit:f,layout:{text:f.text,breaks:f.breaks,size:f.size,font:m.font||l.font,tracking:f.tracking,leading:f.leading/stretchY,weight:m.weight||'original',stretchX:m.stretchX??100,stretchY:m.stretchY??100,box:[box[0]+(l.alignment==='center'?(box[2]-f.width)/2:l.alignment==='right'?box[2]-f.width:0),box[1],Math.max(1,f.width),Math.max(1,f.height)]}};
 }
 async function images(file,records){
  const source=await load(file.preview),ids=file.layers.filter(l=>l.recordId&&!l.skipExport&&!l.issues?.length).map(l=>l.id),cacheKey=JSON.stringify([file.fingerprint,ids,activeContainerEdits(file),file.extractedContainers||[],file.artworkHides||[]]);
  if(!backgrounds.has(cacheKey))backgrounds.set(cacheKey,call('previewBackground',{path:file.path,fingerprint:file.fingerprint,ids,containerEdits:activeContainerEdits(file),extractedContainers:file.extractedContainers||[],artworkHides:file.artworkHides||[]}).then(load).catch(e=>{backgrounds.delete(cacheKey);throw e;}));
  let native;try{native=await backgrounds.get(cacheKey);}catch{}
  return ({file:working,scope})=>{
   const s=Math.min(1,1280/file.width,1800/file.height),create=()=>{const c=doc.createElement('canvas');c.width=Math.max(1,Math.ceil(file.width*s));c.height=Math.max(1,Math.ceil(file.height*s));return c;};
   const encode=c=>{let url=c.toDataURL('image/png');while(url.length>1300000&&c.width>160){const b=doc.createElement('canvas');b.width=Math.ceil(c.width*.75);b.height=Math.ceil(c.height*.75);b.getContext('2d').drawImage(c,0,0,b.width,b.height);c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(b,0,0);url=c.toDataURL('image/png');}return url;};
   const original=create();original.getContext('2d').drawImage(source,0,0,original.width,original.height);const crop=[0,0,file.width,file.height],visuals=[{stage:'source',quality:'original-source',crop,dataURL:encode(original)}];
   if(native&&JSON.stringify([activeContainerEdits(working),working.extractedContainers||[],working.artworkHides||[]])===JSON.stringify([activeContainerEdits(file),file.extractedContainers||[],file.artworkHides||[]])){
    const c=create(),ctx=c.getContext('2d');ctx.scale(c.width/file.width,c.height/file.height);ctx.drawImage(native,0,0,file.width,file.height);
    for(const l of working.layers){const r=records.find(r=>r.id===l.recordId);if(!r||l.skipExport||l.issues?.length)continue;const {fit:f}=previewJob(l,r),m=l.manual||{},ratio=(l.aspectScale||1)*(m.stretchX??100)/100,sy=(m.stretchY??100)/100,b=l.position?[l.position.x,l.position.y]:l.box,offset=l.alignment==='center'?l.box[2]/2:l.alignment==='right'?l.box[2]:0;ctx.save();ctx.translate(b[0],b[1]);ctx.scale(ratio,sy);ctx.fillStyle=l.color||'#202020';ctx.font=`${m.weight==='bold'?'bold ':''}${f.size}px "${f.family.replace(/"/g,'')}" , "Microsoft YaHei", sans-serif`;ctx.textBaseline='alphabetic';ctx.textAlign=l.alignment==='center'?'center':l.alignment==='right'?'right':'left';ctx.letterSpacing=f.tracking*f.size/1000+'px';for(let i=0;i<f.lines.length;i++)ctx.fillText(f.lines[i],offset/ratio,(f.ascent+i*f.leading)/sy);ctx.restore();}
    visuals.push({stage:'current',quality:'native-background',crop:[...crop],dataURL:encode(c),provenance:{backgroundKey:cacheKey,expectedBackgroundKey:cacheKey,renderRevision:'batch-initial',expectedRenderRevision:'batch-initial'}});
   }
   return visuals;
  };
 }
 return async function autoLayoutLanguage({prepared,document:language,useAi=true,isCancelled=()=>false,onProgress=()=>{}}){
  const files=await hydrateBatchFiles(prepared,parseImported),records=prepared.plan.records,issues=[],settings=getSettings(),connected=settings.mode==='local'?!!settings.executable:!!settings.hasApiKey&&!!(settings.apiModel||settings.model);
  for(let i=0;i<files.length;i++){
   if(isCancelled())return {cancelled:true};let working=files[i];
   onProgress({phase:'排版准备',message:language.name+' · '+working.name,current:i,total:files.length});
   const accepted=new Set();if(useAi&&connected){
    let getVisual=()=>[];try{getVisual=await images(working,records);}catch(e){issues.push(working.name+'：预览不可用，使用图层结构分析。');}
    try{const result=await planAiFile({file:working,records,fitText,call,getVisual,scope:'full',isCancelled,onProgress});if(result.cancelled||isCancelled())return {cancelled:true};working=result.working;for(const a of result.accepted)accepted.add(a.id);issues.push(...result.failures.map(t=>working.name+'：'+t));}catch(e){if(isCancelled())return {cancelled:true};issues.push(working.name+'：AI 未完成，继续本地适配。'+e.message);}
   }else if(useAi)issues.push(working.name+'：未配置 AI 连接，本次使用本地自动适配。');
   // Repair remaining overflow and origin-container violations without forcing
   // already valid AI typography back into the source glyph bounds.
   for(const l of working.layers){const r=records.find(r=>r.id===l.recordId);if(!r||l.skipExport||l.issues?.length)continue;const fit=fitText(l,r);const shouldRepair=!fit.ok||!accepted.has(l.id);if(!shouldRepair)continue;const p=proposeVisualLayout(working,l,r,fitText);if(p.ok){Object.assign(l,p.layerPatch);if(p.containerEdit){working.containerEdits||=[];const ix=working.containerEdits.findIndex(e=>e.layerId===p.containerEdit.layerId);if(ix<0)working.containerEdits.push(p.containerEdit);else working.containerEdits[ix]=p.containerEdit;}}}
   files[i]=working;
  }
  const plan=clone(prepared.plan),invalid=[];
  // Every export job gets a complete style, including legacy AI suggestions.
  for(const f of files)for(const l of f.layers)if(l.recordId&&!l.skipExport)l.manual=manualStyleFor(l);
  for(const f of plan.files){const working=files.find(w=>w.path===f.path);if(!working)throw Error('批量排版原稿缺失');f.artworkHides=clone(working.artworkHides||[]);f.extractedContainers=clone(working.extractedContainers||[]);f.containerEdits=activeContainerEdits(working);const occupied=[],replaced=new Set(f.jobs.map(j=>j.layerId));for(const j of f.jobs){const l=working.layers.find(l=>l.id===j.layerId),r=records.find(r=>r.id===l?.recordId);if(!l||!r)throw Error('批量文字绑定缺失');const p=previewJob(l,r),b=p.layout.box;if(!p.fit.ok||b[0]<-.1||b[1]<-.1||b[0]+b[2]>working.width+.1||b[1]+b[3]>working.height+.1)invalid.push(f.name+' / '+l.name+'：文字超出可用区域');const relation=recommendedContainer(working,l),shape=l.containerId===null?null:l.containerId!==undefined?relation.candidates.find(c=>c.id===l.containerId):relation.recommended;if(shape){const c=f.containerEdits.find(e=>e.layerId===shape.id)?.box||shape.box;if(b[0]<c[0]-.1||b[1]<c[1]-.1||b[0]+b[2]>c[0]+c[2]+.1||b[1]+b[3]>c[1]+c[3]+.1)invalid.push(f.name+' / '+l.name+'：文字未回到原稿容器内');}occupied.push({id:l.id,name:l.name,box:b});j.previewLayout=p.layout;j.box=[...(l.sourceBox||j.box)];j.manual=clone(l.manual||{});j.position=l.position?{...l.position}:undefined;j.smart={...l.smart};}for(const l of working.layers.filter(l=>!f.jobs.some(j=>j.layerId===l.id)&&l.visible!==false&&!l.issues?.some(i=>/隐藏/.test(i))))occupied.push({id:l.id,name:l.name,box:l.sourceBox||l.box});for(let a=0;a<occupied.length;a++)for(let b=a+1;b<occupied.length;b++){const x=occupied[a].box,y=occupied[b].box;if((replaced.has(occupied[a].id)||replaced.has(occupied[b].id))&&x[0]<y[0]+y[2]-.5&&x[0]+x[2]>y[0]+.5&&x[1]<y[1]+y[3]-.5&&x[1]+x[3]>y[1]+.5)invalid.push(f.name+' / '+occupied[a].name+' 与 '+occupied[b].name+'：文字重叠');}}
  if(invalid.length)throw Error('以下少数项目仍无法安全排版，已保留为待复查，其他语言可继续：'+invalid.join('；'));
  return {plan,layers:files.map(f=>({path:f.path,layers:clone(f.layers),extractedContainers:clone(f.extractedContainers||[]),containerEdits:clone(f.containerEdits||[])})),issues};
 };
}
