const path=require('node:path');
const key=p=>path.resolve(p).replace(/\\/g,'/').toLowerCase();
async function resolveTemplateInputs(args,file,task,{hashInputs=true}={}){
 const multiple=args.templates!==undefined,configs=multiple?args.templates:[args];
 if(!Array.isArray(configs)||!configs.length||configs.length>12||new Set(configs.map(c=>c?.templateFileId)).size!==configs.length)throw Error('请提供1至12个不重复的模板附件配置');
 const resolved=[],normalized=[];
 for(const c of configs){
  const f=await file(c.templateFileId,task);if(f.type==='folder'||!/\.(psd|psb)$/i.test(f.path))throw Error('模板必须是本任务PSD/PSB附件');
  resolved.push({templateFileId:c.templateFileId,template:{path:f.path,...(hashInputs?{fingerprint:await require('../photoshop-file-io.cjs').hashFile(f.path)}:{})}});
  let gifts=c.gifts;if(gifts){const folder=await file(gifts.directoryFileId,task);if(folder.type!=='folder')throw Error('赠品需使用本任务附加文件夹');gifts={...gifts,directory:folder.path};}
  normalized.push({...c,...(gifts?{gifts}:{})});
 }
 return multiple?{args:{...args,templates:normalized},templateInputs:resolved}:{args:normalized[0],templateInput:resolved[0].template};
}
async function validateTemplateAttachments(p,file,task){
 for(const entry of require('../sku-template-routing.cjs').templateSources(p)){
  if(entry.templateFileId){const f=await file(entry.templateFileId,task);if(key(f.path)!==key(entry.template.path))throw Error('外部模板不属于当前任务');}
  else{const allowed=await Promise.all((task.files||[]).filter(f=>f.type!=='folder').map(f=>file(f.id,task)));if(!allowed.some(f=>key(f.path)===key(entry.template.path)))throw Error('外部模板不属于当前任务');}
 }
 const configs=p.templates?p.decisions.templates:[p.decisions];
 for(const c of configs){if(!c.gifts)continue;const folder=await file(c.gifts.directoryFileId,task);if(folder.type!=='folder'||key(folder.path)!==key(c.gifts.directory))throw Error('赠品目录不属于本任务');}
}
module.exports={resolveTemplateInputs,validateTemplateAttachments};
