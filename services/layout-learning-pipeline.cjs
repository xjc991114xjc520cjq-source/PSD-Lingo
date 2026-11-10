// Drafts are local working data. Only an actual successful PSD/PSB output
// promotes the matching final layout into the reusable example corpus.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {createLayoutMemory,normalizeLayoutSample}=require('./layout-memory.cjs');
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<.06;
function matchesExport(sample,file,plan){
 if(sample.context.fileFingerprint!==file.fingerprint||sample.context.documentDigest!==plan.docFingerprint)return false;
 const layers=sample.after.layers;if(layers.length!==file.jobs.length)return false;
 for(const job of file.jobs){const l=layers.find(l=>String(l.id)===String(job.layerId)),p=job.previewLayout;if(!l||!p||l.target!==job.target)return false;
  const m=l.manual||{},fit=l.fit||{},box=l.layoutBox||l.box,position=l.position||{x:box[0],y:box[1]},factor=l.alignment==='center'?.5:l.alignment==='right'?1:0;
  const expected=[position.x+(box[2]-fit.width)*factor,position.y,Math.max(1,fit.width),Math.max(1,fit.height)];
  if(!p.box?.every((n,i)=>near(n,expected[i]))||!near(p.size,fit.size)||!near(p.tracking,fit.tracking)||!near(p.leading,fit.leading/((m.stretchY??100)/100))||p.font!==(m.font||l.font)||p.weight!==(m.weight||'original')||!near(p.stretchX,m.stretchX??100)||!near(p.stretchY,m.stretchY??100))return false;
 }
 const canonical=edits=>(edits||[]).map(e=>({id:e.layerId,box:e.box,radii:e.radii})).sort((a,b)=>a.id-b.id);
 return JSON.stringify(canonical(file.containerEdits))===JSON.stringify(canonical(sample.after.containerEdits));
}
async function verifyPsdOutput(output){
 if(typeof output!=='string'||!path.isAbsolute(output)||! /\.(psd|psb)$/i.test(output))return false;
 const fd=await fs.open(output,'r');try{const b=Buffer.alloc(26);const read=await fd.read(b,0,26,0);return read.bytesRead===26&&b.toString('ascii',0,4)==='8BPS'&&[1,2].includes(b.readUInt16BE(4))&&(await fd.stat()).size>26;}finally{await fd.close();}
}
function createLearningPipeline({directory,cloud,io=fs,verifyOutput=verifyPsdOutput,store=createLayoutMemory({directory:path.join(directory,'confirmed')})}={}){
 const drafts=path.join(directory,'drafts');let tail=Promise.resolve();const queue=fn=>{const result=tail.then(fn);tail=result.catch(()=>{});return result;};
 async function entries(){await io.mkdir(drafts,{recursive:true});return (await io.readdir(drafts)).filter(name=>/^[a-f0-9]{64}\.json$/.test(name));}
 async function status(){const base=await store.status();return {...base,draftTotal:(await entries()).length,cloud:cloud?await cloud.status():{configured:false,message:'云端尚未配置，记录仅保存在本机'}};}
 return {
  stage(input){return queue(async()=>{
   const {sample,images}=normalizeLayoutSample(input,1024*1024);if(!sample.layoutChanges.changed)return {staged:false,saved:false,ignored:'no-layout-change',...await status()};const payload={...sample,visual:{...sample.visual}};
   for(const [side,image]of Object.entries(images))if(image){const region=/^r(\d+)-(source|substituted|final)$/.exec(side);if(region){const r=payload.visual.regions[Number(region[1])];r[region[2]]={dataURL:'data:image/png;base64,'+image.toString('base64'),quality:r.quality[region[2]],provenance:r.provenance?.[region[2]]};}else payload.visual[side]='data:image/png;base64,'+image.toString('base64');}
   const key=hash([sample.projectId,sample.context.documentDigest,sample.context.batchLanguage]),file=path.join(drafts,key+'.json');
   await entries();let previous;try{previous=JSON.parse(await io.readFile(file,'utf8'));}catch{}
   const changedLayers=sample.layoutChanges.changedLayers.slice(0,200);
   payload.operations=[...(Array.isArray(previous?.operations)?previous.operations:[]).slice(-199),{at:new Date().toISOString(),reason:sample.reason,changedLayers,changedContainers:sample.layoutChanges.changedContainers.slice(0,200)}];
   const tmp=file+'.tmp';await io.writeFile(tmp,JSON.stringify(payload),{mode:0o600});await io.rename(tmp,file);
   const list=await entries(),stats=await Promise.all(list.map(async name=>({name,...await io.stat(path.join(drafts,name))})));stats.sort((a,b)=>a.mtimeMs-b.mtimeMs);let bytes=stats.reduce((n,s)=>n+s.size,0),count=stats.length;
   for(const entry of stats){if(count<=64&&bytes<=256*1024*1024)break;if(entry.name===key+'.json')continue;await io.unlink(path.join(drafts,entry.name));bytes-=entry.size;count--;}
   return {staged:true,saved:false,...await status()};
  });},
  /*
   * A PSD generation run is considered complete when generation actually
   * started, at least one valid PSD/PSB was produced, and failures are not
   * widespread.  Successful files are still checked against their exact
   * layout before promotion; failed files remain local drafts for retry.
   * This lets a batch with one isolated export error become a useful learning
   * record without allowing a mostly failed run to pollute the corpus.
   */
  finalize(plan,results,{maxErrorRatio=.5}={}){return queue(async()=>{
   const candidates=[];for(const name of await entries()){try{candidates.push({name,payload:JSON.parse(await io.readFile(path.join(drafts,name),'utf8'))});}catch{}}
   let confirmed=0,unmatched=0,validOutputs=0,failed=0;const verified=[];
   const total=Math.max(0,Array.isArray(plan?.files)?plan.files.length:0);
   for(let index=0;index<total;index++){const file=plan.files[index],result=results?.[index];
    let valid=false;
    if(result&&result.file===file.name&&!result.error&&result.output){try{valid=await verifyOutput(result.output);}catch{valid=false;}}
    if(valid)validOutputs++;else {failed++;continue;}
    verified.push(file);
   }
   const started=Array.isArray(results)&&results.length>0;
   const errorRatio=total?failed/total:1;
   const configuredThreshold=Number(maxErrorRatio);
   const threshold=Number.isFinite(configuredThreshold)?Math.max(0,Math.min(1,configuredThreshold)):.5;
   const widespreadError=!started||errorRatio>=threshold;
   if(!widespreadError)for(const file of verified){
    const draft=candidates.find(c=>matchesExport(c.payload,file,plan));if(!draft){unmatched++;continue;}
    const queued=await cloud?.enqueueFull?.(draft.payload);await store.record(draft.payload);if(queued?.complete!==false)await io.unlink(path.join(drafts,draft.name));candidates.splice(candidates.indexOf(draft),1);confirmed++;
   }
   // A run is complete only when a successful export was also promoted into
   // the learning corpus. A mismatched/stale draft must remain incomplete.
   const operationComplete=started&&confirmed>0&&!widespreadError;
   return {confirmed,unmatched,started,operationComplete,widespreadError,errorCount:failed,totalCount:total,errorRatio,...await status()};
  });},
  status:()=>queue(status),retrieve:query=>store.retrieve(query)
 };
}
module.exports={createLearningPipeline,matchesExport,verifyPsdOutput};
