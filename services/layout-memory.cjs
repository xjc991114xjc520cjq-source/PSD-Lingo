/* Local examples, not model training. Never executes AI or applies retrieved layouts. */
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {layoutChanges}=require('../layout-learning-signals.cjs');
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/i.test(v)?v.toLowerCase():'';
const fail=m=>{throw new Error('排版记忆：'+m);};
const text=(v,max=8000)=>typeof v==='string'?v.slice(0,max):'';
const number=(v,min=-1e7,max=1e7)=>Number.isFinite(v)&&v>=min&&v<=max?v:undefined;
const imageSides=['source','substituted','before','after'];
const matched=p=>p&&typeof p.backgroundKey==='string'&&p.backgroundKey.length>0&&p.backgroundKey===p.expectedBackgroundKey&&p.renderRevision!==undefined&&p.renderRevision===p.expectedRenderRevision;
function box(v){if(!Array.isArray(v)||v.length!==4||v.some(n=>number(n)===undefined)||v[2]<0||v[3]<0)fail('无效几何尺寸');return [...v];}
function safeFields(v,fields){const out={};if(!v||typeof v!=='object')return out;for(const k of fields){const x=v[k];if(typeof x==='boolean'||typeof x==='string'&&x.length<1000||typeof x==='number'&&Number.isFinite(x))out[k]=x;}return out;}
function snapshot(v){
 if(!v||!Array.isArray(v.layers)||v.layers.length>2000)fail('图层记录无效或过多');
 return {layers:v.layers.map(l=>{const out={id:text(String(l.id),128),original:text(l.original),target:text(l.target),recordDigest:digest(l.recordDigest),box:box(l.box),font:text(l.font,256),size:number(l.size,0,100000),alignment:text(l.alignment,32)};
  if(Array.isArray(l.position)&&l.position.length===2&&l.position.every(n=>number(n)!==undefined))out.position={x:l.position[0],y:l.position[1]};
  else if(l.position&&number(l.position.x)!==undefined&&number(l.position.y)!==undefined)out.position={x:l.position.x,y:l.position.y};
  if(l.layoutBox)out.layoutBox=box(l.layoutBox);Object.assign(out,safeFields(l,['minSize','smart']));if(l.smart&&typeof l.smart==='object')out.smart=safeFields(l.smart,['enabled','wrap','shrink','minSize','tracking','leading','maxSize','lineHeight','maxLines','allowWrap','allowLeading','trackingLimit','autoSize','preserveBreaks']);
  out.manual=safeFields(l.manual,['font','size','weight','tracking','leading','lineHeight','horizontalScale','verticalScale','wrap','alignment','x','y','width','height','fontSize','fontFamily','fontWeight','letterSpacing','lineSpacing','minSize','smartWrap','stretchX','stretchY','family','enabled']);
  out.fit=safeFields(l.fit,['width','height','size','fontSize','lineHeight','overflow','font','leading','tracking','ascent']);if(Array.isArray(l.fit?.lines))out.fit.lines=l.fit.lines.slice(0,1000).map(x=>text(x));
  if(l.containerId!==undefined)out.containerId=text(String(l.containerId),128);return out;}),
 containers:(Array.isArray(v.containers)?v.containers:[]).slice(0,2000).map(c=>{const out=safeFields(c,['id','name','shapeType','parentId','stackIndex']);if(c.box)out.box=box(c.box);if(Array.isArray(c.radii)&&c.radii.length===4&&c.radii.every(n=>number(n,0)!==undefined))out.radii=[...c.radii];return out;}),
 containerEdits:(Array.isArray(v.containerEdits)?v.containerEdits:[]).slice(0,2000).map(c=>{const out=safeFields(c,['layerId','textLayerId','linked','radiiLinked','cornerLinked','shapeType']);if(c.box)out.box=box(c.box);if(c.sourceBox)out.sourceBox=box(c.sourceBox);for(const k of ['radii','cornerRadii','sourceRadii'])if(Array.isArray(c[k])&&c[k].length===4&&c[k].every(n=>number(n,0)!==undefined))out[k]=[...c[k]];return out;})};
}
function crc32(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function png(url,maxBytes){
 if(url===undefined||url===null||url==='')return null;
 if(typeof url!=='string'||url.length>Math.ceil(maxBytes*4/3)+64||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(url))fail('缩略图必须是受限 PNG');
 const b=Buffer.from(url.slice(22),'base64');if(b.length>maxBytes||b.length<45||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('PNG 数据无效');
 let p=8,ihdr=false,idat=false,end=false;
 while(p+12<=b.length){const n=b.readUInt32BE(p),type=b.toString('ascii',p+4,p+8);if(n>b.length-p-12||crc32(b.subarray(p+4,p+8+n))!==b.readUInt32BE(p+8+n))fail('PNG 区块无效');
  if(!ihdr){if(type!=='IHDR'||n!==13||!b.readUInt32BE(p+8)||!b.readUInt32BE(p+12)||b.readUInt32BE(p+8)>2048||b.readUInt32BE(p+12)>2048)fail('缩略图尺寸无效');ihdr=true;}
  if(!['IHDR','IDAT','IEND','PLTE','tRNS','sRGB','gAMA','cHRM','pHYs'].includes(type))fail('缩略图包含额外元数据');
  if(type==='IDAT')idat=true;p+=12+n;if(type==='IEND'){if(n!==0||p!==b.length)fail('PNG 结尾无效');end=true;break;}
 }if(!end||!idat)fail('PNG 不完整');return b;
}
function normalize(input,maxImageBytes){
 if(!input||input.version!==1||!digest(input.projectId))fail('项目标识无效');
 const c=input.context||{};if(!Number.isFinite(c.width)||c.width<=0||!Number.isFinite(c.height)||c.height<=0)fail('画布尺寸无效');
 const visual=input.visual||{},p=visual.provenance||{};
 const confirmed=visual.quality==='native-background'&&matched(p);
 const images=Object.fromEntries(imageSides.map(side=>[side,png(visual[side],maxImageBytes)]));
 const sample={version:1,projectId:digest(input.projectId),context:{fileFingerprint:digest(c.fileFingerprint),width:c.width,height:c.height,documentDigest:digest(c.documentDigest),batchLanguage:text(c.batchLanguage,128)},before:snapshot(input.before),after:snapshot(input.after),reason:['manual','undo','redo','batch-save'].includes(input.reason)?input.reason:'manual',visual:{quality:confirmed&&images.after?'native-background':'estimated',hasBefore:!!images.before,hasAfter:!!images.after,beforeDigest:images.before?hash(images.before):'',afterDigest:images.after?hash(images.after):''}};
 sample.context.appVersion=text(c.appVersion||input.sourceSample?.appVersion,64);
 if(Array.isArray(input.operations))sample.operations=input.operations.slice(-200).map(o=>({at:text(o?.at,32),reason:['manual','undo','redo','batch-save'].includes(o?.reason)?o.reason:'manual',changedLayers:(Array.isArray(o?.changedLayers)?o.changedLayers:[]).slice(0,200).map(id=>text(String(id),128)),changedContainers:(Array.isArray(o?.changedContainers)?o.changedContainers:[]).slice(0,200).map(id=>text(String(id),128))}));
 const stages=input.stages||{};
 sample.stages={...(stages.source?{source:snapshot(stages.source)}:{}),...(stages.substituted?{substituted:snapshot(stages.substituted)}:{}),final:stages.final?snapshot(stages.final):sample.after};
 sample.learningScope='layout-only';sample.textRole='measurement-context';
 sample.layoutChanges=layoutChanges(sample.before,sample.after);
 // Defense in depth for old clients: never retain a before/after copy rewrite
 // as a learning operation. Existing stored examples are left untouched.
 for(const stage of [sample.before,sample.stages.substituted])for(const l of stage?.layers||[]){const current=sample.after.layers.find(a=>a.id===l.id);if(current&&l.target.replace(/[\r\n]/g,'')!==current.target.replace(/[\r\n]/g,'')){l.target=current.target;delete l.fit.lines;if(stage===sample.before){images.before=null;sample.visual.hasBefore=false;sample.visual.beforeDigest='';}else images.substituted=null;}}
 sample.stages.final=sample.after;
 sample.visual.regions=[];for(const [i,r]of (input.visual?.regions||[]).slice(0,24).entries()){const region={crop:box(r.crop),layerIds:(r.layerIds||[]).map(String),containerIds:(r.containerIds||[]).map(String),images:{},quality:{},provenance:{}};for(const side of ['source','substituted','final']){const v=r[side],image=png(v?.dataURL,maxImageBytes);if(!image)continue;const name='r'+i+'-'+side;images[name]=image;region.images[side]=name;if(matched(v.provenance))region.provenance[side]=safeFields(v.provenance,['backgroundKey','expectedBackgroundKey','renderRevision','expectedRenderRevision']);region.quality[side]=side==='source'&&v.quality==='original-source'?'original-source':v.quality==='native-background'&&matched(v.provenance)?'native-background':'estimated';region[side+'Digest']=hash(image);}sample.visual.regions.push(region);}

 sample.stageCoverage=sample.stages.source&&sample.stages.substituted?'three-stage':'partial';
 sample.visual.renderer='browser-text/native-background';sample.visual.beforeQuality='estimated';
 if(confirmed)sample.visual.provenance=safeFields(p,['backgroundKey','expectedBackgroundKey','renderRevision','expectedRenderRevision']);
 const substituteProvenance=visual.stageProvenance?.substituted;
 sample.visual.stageQuality={source:images.source&&sample.stages.source?'original-source':'unavailable',substituted:!images.substituted?'unavailable':sample.stages.substituted&&visual.stageQuality?.substituted==='native-background'&&matched(substituteProvenance)?'native-background':'estimated',final:images.after?sample.visual.quality:'unavailable'};
 if(matched(substituteProvenance))sample.visual.stageProvenance={substituted:safeFields(substituteProvenance,['backgroundKey','expectedBackgroundKey','renderRevision','expectedRenderRevision'])};
 for(const side of ['source','substituted']){sample.visual[side+'Digest']=images[side]?hash(images[side]):'';sample.visual['has'+side[0].toUpperCase()+side.slice(1)]=!!images[side];}
 for(const side of imageSides.map(side=>side+'Crop'))if(visual[side])sample.visual[side]=box(visual[side]);
 if(Buffer.byteLength(JSON.stringify(sample))>2*1024*1024)fail('记录超过 2 MiB');return {sample,images};
}
function script(s){return /\p{Script=Han}/u.test(s)?'han':/\p{Script=Arabic}/u.test(s)?'arabic':/\p{Script=Cyrillic}/u.test(s)?'cyrillic':/\p{Script=Devanagari}/u.test(s)?'devanagari':/\p{Script=Thai}/u.test(s)?'thai':/\p{Script=Hangul}/u.test(s)?'hangul':/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(s)?'japanese':'latin';}
function similarity(row,query){const explanation=[],layers=row.after.layers||[];let score=1;
 if(query.language&&row.context.batchLanguage===query.language){score++;explanation.push('same-language');}
 if(typeof query.targetText==='string'&&query.targetText.length){const target=query.targetText;let best=0;for(const layer of layers){const candidate=layer.target||'';if(!candidate)continue;const ratio=Math.min(candidate.length,target.length)/Math.max(candidate.length,target.length);const scripts=script(candidate)===script(target)?0.5:0;best=Math.max(best,ratio+scripts);}score+=best;explanation.push('text-length-script:'+best.toFixed(3));}
 if(query.font&&layers.some(l=>l.font===query.font||l.manual?.font===query.font||l.manual?.family===query.font)){score+=0.5;explanation.push('same-font');}
 if(Number.isFinite(query.width)&&query.width>0){const dimensions=[...(row.after.containers||[]),...(row.after.containerEdits||[]),...layers];let best=0;for(const l of dimensions){const b=l.layoutBox||l.box;if(!b?.[2])continue;let match=Math.min(b[2],query.width)/Math.max(b[2],query.width);if(Number.isFinite(query.height)&&query.height>0&&b[3]>0){const a=b[2]/b[3],q=query.width/query.height;match=(match+Math.min(a,q)/Math.max(a,q))/2;}best=Math.max(best,match);}score+=best;explanation.push('geometry:'+best.toFixed(3));}
 return {...row,score,scoreExplanation:explanation};}
function createLayoutMemory({directory,maxSamples=2000,maxImageBytes=1024*1024,maxStorageBytes=256*1024*1024,maxPending=32,maxPendingBytes=30*1024*1024,clock=()=>new Date(),io=fs}={}){
 if(!directory||!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>2000)throw new Error('Invalid layout memory configuration');
 const log=path.join(directory,'samples.jsonl'),imagesDir=path.join(directory,'thumbnails');let rows=[],loaded=false,tail=Promise.resolve(),pending=0,pendingBytes=0;
 function queue(fn){const p=tail.then(fn);tail=p.catch(()=>{});return p;}
 async function load(){if(loaded)return;await io.mkdir(imagesDir,{recursive:true});let raw='';try{raw=await io.readFile(log,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  rows=[];for(const line of raw.split('\n')){if(!line)continue;try{const r=JSON.parse(line);if(digest(r.id)&&digest(r.projectId)&&r.after?.layers)rows.push(r);}catch{ /* torn last line does not erase older examples */ }}rows=rows.slice(-maxSamples);loaded=true;
 }
 async function writeLog(next){const tmp=log+'.tmp';await io.writeFile(tmp,next.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});await io.rename(tmp,log);}
 function summarize(projectId){const selected=projectId?rows.filter(r=>r.projectId===projectId):rows;return {total:rows.length,projectCount:new Set(rows.map(r=>r.projectId)).size,projectSamples:selected.length,lastSavedAt:selected.at(-1)?.savedAt||null,visualQuality:selected.at(-1)?.visual.quality||null,storageBytes:rows.reduce((n,r)=>n+(r.storageBytes||0),0)};}
 return {
  record(input){if(pending>=maxPending)return Promise.reject(new Error('排版记忆：后台记录队列已满，稍后重试'));let prepared,bytes;try{prepared=normalize(input,maxImageBytes);if(!prepared.sample.layoutChanges.changed)return queue(async()=>{await load();return {saved:false,ignored:'no-layout-change',...summarize(input.projectId)};});bytes=Buffer.byteLength(JSON.stringify(prepared.sample))+Object.values(prepared.images).reduce((n,b)=>n+(b?.length||0),0);if(pendingBytes+bytes>maxPendingBytes)fail('后台记录队列已满，稍后重试');}catch(e){return Promise.reject(e);}pending++;pendingBytes+=bytes;return queue(async()=>{await load();const {sample,images}=prepared,id=hash(sample),duplicate=rows.find(r=>r.id===id);if(duplicate)return {saved:false,duplicate:true,...summarize(sample.projectId)};
   const savedAt=clock().toISOString(),row={...sample,id,savedAt,storageBytes:0};row.storageBytes=Buffer.byteLength(JSON.stringify(row))+Object.values(images).reduce((n,b)=>n+(b?.length||0),0);
   if(row.storageBytes>maxStorageBytes)fail('单条记录超出存储配额');
   const written=[];try{for(const side of Object.keys(images))if(images[side]){const file=path.join(imagesDir,id+'-'+side+'.png');written.push(file);await io.writeFile(file,images[side],{mode:0o600});}const next=[...rows,row].slice(-maxSamples);let bytes=next.reduce((n,r)=>n+(r.storageBytes||0),0);while(next.length>1&&bytes>maxStorageBytes)bytes-=next.shift().storageBytes||0;await writeLog(next);const removed=rows.filter(r=>!next.some(n=>n.id===r.id));rows=next;for(const old of removed)for(const side of [...imageSides,...(old.visual.regions||[]).flatMap(r=>Object.values(r.images))])await io.unlink(path.join(imagesDir,old.id+'-'+side+'.png')).catch(()=>{});
   }catch(e){for(const file of written)await io.unlink(file).catch(()=>{});throw e;}
   return {saved:true,...summarize(sample.projectId),similarCount:rows.filter(r=>r.projectId===sample.projectId&&r.id!==id).length};
  }).finally(()=>{pending--;pendingBytes-=bytes;});},
  status({projectId}={}){return queue(async()=>{await load();return summarize(projectId);});},
  retrieve(query={}){return queue(async()=>{await load();const {projectId,limit=8}=query,count=Math.min(20,Math.max(1,Number(limit)||8));return rows.filter(r=>!projectId||r.projectId===projectId).map(r=>similarity(r,query)).sort((a,b)=>b.score-a.score||b.savedAt.localeCompare(a.savedAt)).slice(0,count);});}
 };
}
module.exports={createLayoutMemory,normalizeLayoutSample:normalize,validateLayoutPng:png};
