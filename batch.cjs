const {validatePlan,hash}=require('./core.cjs');
function validateTemplate(t){
  if(!t||t.kind!=='psd-lingo-template'||t.version!==1||typeof t.name!=='string'||t.name.length>200||!['line','paragraph'].includes(t.splitMode)||!Array.isArray(t.bindings))throw new Error('排版模板格式无效');
  validatePlan(t.plan);
  if(t.plan.files.length>100||t.plan.records.length>2000||t.bindings.length>5000)throw new Error('模板超出批量处理范围');
  const seen=new Set();
  for(const b of t.bindings){const f=t.plan.files[b.fileIndex],j=f?.jobs.find(j=>j.layerId===b.layerId),r=t.plan.records[b.recordIndex];const id=b.fileIndex+':'+b.layerId;
    if(!Number.isInteger(b.fileIndex)||!Number.isInteger(b.recordIndex)||!j?.previewLayout||!r||j.recordId!==r.id||r.key!==b.recordKey||!['left','center','right'].includes(b.alignment)||typeof b.layerName!=='string'||!Number.isFinite(b.aspectScale)||b.aspectScale<=0||b.aspectScale>100||seen.has(id))throw new Error('模板绑定或预览参数无效');seen.add(id);
  }
  if(seen.size!==t.plan.files.reduce((n,f)=>n+f.jobs.length,0))throw new Error('模板缺少文字层绑定');
  return t;
}
function createTemplate(plan,{name,splitMode='line',annotations=[]}){
  validatePlan(plan);const bindings=[];
  plan.files.forEach((f,fileIndex)=>f.jobs.forEach(j=>{const recordIndex=plan.records.findIndex(r=>r.id===j.recordId),a=annotations.find(a=>a.path===f.path&&a.layerId===j.layerId);bindings.push({fileIndex,layerId:j.layerId,recordIndex,recordKey:plan.records[recordIndex].key,layerName:a?.name||String(j.layerId),alignment:a?.alignment||'left',aspectScale:a?.aspectScale||1});}));
  return validateTemplate({kind:'psd-lingo-template',version:1,name:String(name||'多语言排版模板').slice(0,200),createdAt:new Date().toISOString(),splitMode,plan,bindings});
}
function matchDocument(template,document,mode){
  validateTemplate(template);if(!['order','key'].includes(mode))throw new Error('文案对应方式无效');
  const rows=document.records;if(!Array.isArray(rows)||!rows.length||rows.length>2000||rows.some(r=>typeof r.target!=='string'||!r.target.trim()||hash(r.target)!==r.digest))throw new Error('语言文档内容校验失败');
  if(mode==='order'&&rows.length!==template.plan.records.length)throw new Error('条目数不一致：模板 '+template.plan.records.length+' 条，文档 '+rows.length+' 条；请调整文档顺序／拆分方式，或使用固定编号对应');
  const keys=new Map();if(mode==='key')for(const r of rows){if(!String(r.key).trim()||keys.has(r.key))throw new Error('语言文档编号为空或重复：'+r.key);keys.set(r.key,r);}
  if(mode==='key'){const baseKeys=new Set();for(const r of template.plan.records){if(!String(r.key).trim()||baseKeys.has(r.key))throw new Error('模板文案编号为空或重复：'+r.key);baseKeys.add(r.key);}}
  return template.bindings.map(b=>{const r=mode==='order'?rows[b.recordIndex]:keys.get(b.recordKey);if(!r)throw new Error('缺少模板文案编号：'+b.recordKey);return {binding:b,record:r,job:template.plan.files[b.fileIndex].jobs.find(j=>j.layerId===b.layerId)};});
}
function outputName(source,document,format){const extension=(format==='AI'||!format&&/\.ai$/i.test(String(source)))?'.ai':(format==='PSB'||!format&&/\.psb$/i.test(String(source)))?'.psb':'.psd';const clean=s=>String(s).replace(/\.[^.]+$/,'').normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').slice(0,75)||'语言';let n=clean(source)+'_'+clean(document);if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(n))n='_'+n;return n+extension;}
function planForDocument(template,doc,{mode,layouts,fitMode='adapt',minimumPercent=60,preview=false,manualPlan}){
  if(manualPlan)return editedPlanForDocument(template,doc,mode,manualPlan);
  const matches=matchDocument(template,doc,mode);if(!Array.isArray(layouts)||layouts.length!==matches.length||!['adapt','fixed'].includes(fitMode)||!Number.isFinite(minimumPercent)||minimumPercent<10||minimumPercent>100)throw new Error('批量排版参数无效');
  const ids=new Set();const records=doc.records.map((r,i)=>({...r,id:'batch:'+i}));
  const files=template.plan.files.map(f=>({...f,containerEdits:structuredClone(f.containerEdits||[]),name:outputName(f.name,doc.name,f.format),jobs:[]}));
  matches.forEach(({binding:b,record:r,job:j},i)=>{const p=layouts[i],base=j.previewLayout,k=b.fileIndex+':'+b.layerId;if(!p||p.fileIndex!==b.fileIndex||p.layerId!==b.layerId||ids.has(k))throw new Error('批量排版与模板文字层不一致');ids.add(k);
    if(!preview&&(p.font!==base.font||p.weight!==base.weight||p.stretchX!==base.stretchX||p.stretchY!==base.stretchY||p.size>base.size+.01||p.size<base.size*(fitMode==='fixed'?1:minimumPercent/100)-.01||fitMode==='fixed'&&(Math.abs(p.size-base.size)>.01||p.tracking!==base.tracking||Math.abs(p.leading-base.leading)>.01)||fitMode==='adapt'&&(p.tracking>base.tracking||p.tracking<Math.max(-200,base.tracking-30)||p.leading>base.leading+.01||p.leading<base.leading*(minimumPercent/100)*.65-.01)))throw new Error('批量排版超出模板允许的参数范围');
    const left=base.box[0],top=base.box[1],right=left+base.box[2],bottom=top+base.box[3];
    if(!preview&&(Math.abs(p.box[1]-top)>.1||p.box[0]<left-.1||fitMode==='adapt'&&(p.box[0]+p.box[2]>right+Math.max(.5,base.box[2]*.0011)||p.box[1]+p.box[3]>bottom+Math.max(.5,base.box[3]*.0011))))throw new Error('批量排版超出模板区域，请预览调整或跳过该文档');
    const rIndex=doc.records.indexOf(r),job={...j,recordId:records[rIndex].id,target:r.target,documentText:r.target,previewLayout:{text:p.text,breaks:p.breaks,size:p.size,font:p.font,weight:p.weight,tracking:p.tracking,leading:p.leading,stretchX:p.stretchX,stretchY:p.stretchY,box:p.box}};
    delete job.override;delete job.manual;delete job.position;files[b.fileIndex].jobs.push(job);
  });
  const names=new Set();for(const f of files){if(names.has(f.name.toLowerCase()))throw new Error('模板中 PSD／PSB 输出名称重复，请使用不同原稿文件名');names.add(f.name.toLowerCase());}
  return validatePlan({version:1,createdAt:new Date().toISOString(),docName:doc.name,docFingerprint:doc.fingerprint,records,files,skipped:template.plan.skipped,batch:{templateName:template.name,fitMode,mode}});
}
function editedPlanForDocument(template,doc,mode,edited){
  const matches=matchDocument(template,doc,mode);validatePlan(edited);
  const records=doc.records.map((r,i)=>({...r,id:'batch:'+i}));
  if(edited.records.length!==records.length||records.some(r=>{const e=edited.records.find(x=>x.id===r.id);return !e||e.target!==r.target||e.digest!==r.digest;}))throw new Error('单语言编辑的文档来源已变化，请重新打开语言预览。');
  const files=[],seen=new Set(),allowed=new Map(matches.map(m=>[template.plan.files[m.binding.fileIndex].path+':'+m.binding.layerId,m]));
  for(const ef of edited.files){
    const fileIndex=template.plan.files.findIndex(f=>f.path===ef.path),base=template.plan.files[fileIndex];
    if(!base||ef.fingerprint!==base.fingerprint||seen.has(ef.path))throw new Error('单语言编辑的原稿来源无效。');seen.add(ef.path);
    const jobs=ef.jobs.map(e=>{
      const match=allowed.get(ef.path+':'+e.layerId);if(!match)throw new Error('单语言编辑包含模板之外的文字层。');
      const j=match.job,r=records[doc.records.indexOf(match.record)];
      if(e.original!==j.original||e.font!==j.font||e.size!==j.size||JSON.stringify(e.box)!==JSON.stringify(j.box)||e.recordId!==r.id||!e.previewLayout)throw new Error('单语言编辑的文字层或文案绑定已变化。');
      const result={...j,recordId:r.id,target:e.target,documentText:r.target,previewLayout:structuredClone(e.previewLayout)};
      delete result.override;delete result.manual;delete result.position;
      if(e.override)result.override=structuredClone(e.override);
      return result;
    });
    if(jobs.length)files.push({...base,name:outputName(base.name,doc.name,base.format),extractedContainers:structuredClone(ef.extractedContainers||base.extractedContainers||[]),containerEdits:structuredClone(ef.containerEdits||[]).filter(e=>jobs.some(j=>j.layerId===e.textLayerId)),jobs});
  }
  const skipped=[...(template.plan.skipped||[])];
  for(const {binding:b} of matches){const f=template.plan.files[b.fileIndex];if(!files.some(x=>x.path===f.path&&x.jobs.some(j=>j.layerId===b.layerId)))skipped.push({file:f.name,layerId:b.layerId,name:b.layerName});}
  return validatePlan({version:1,createdAt:new Date().toISOString(),docName:doc.name,docFingerprint:doc.fingerprint,records,files,skipped,batch:{templateName:template.name,mode,fitMode:'edited'}});
}
module.exports={createTemplate,validateTemplate,matchDocument,planForDocument,editedPlanForDocument,outputName};
