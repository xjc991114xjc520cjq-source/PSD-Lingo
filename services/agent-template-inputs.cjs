const path=require('node:path');
const key=p=>require('./file-identity.cjs').fileKey(p);
async function resolveTemplateInputs(args,file,task,{hashInputs=true}={}){
 const multiple=args.templates!==undefined,configs=multiple?args.templates:[args];
 if(!require('../sku-template-routing.cjs').uniqueTemplates(configs))throw Error('请提供1至12个模板配置；同一PSD的不同模板块须用不同templateKey');
 let giftSource=args.giftSource;if(giftSource){const book=await file(giftSource.workbookFileId,task);if(!/\.xlsx$/i.test(book.path)||book.type==='folder')throw Error('赠品对照表必须是本任务XLSX附件');giftSource={...giftSource,workbook:{path:book.path,...(hashInputs?{fingerprint:await require('../photoshop-file-io.cjs').hashFile(book.path)}:{})}};}
 const resolved=[],normalized=[];
 for(const c of configs){
  const f=await file(c.templateFileId,task);if(f.type==='folder'||!/\.(psd|psb)$/i.test(f.path))throw Error('模板必须是本任务PSD/PSB附件');
  const existing=resolved.find(t=>key(t.template.path)===key(f.path));
  resolved.push({templateFileId:c.templateFileId,...(c.templateKey?{templateKey:c.templateKey}:{}),template:existing?.template||{path:f.path,...(hashInputs?{fingerprint:await require('../photoshop-file-io.cjs').hashFile(f.path)}:{})}});
  let gifts=c.gifts;if(gifts){const folder=await file(gifts.directoryFileId,task);if(folder.type!=='folder')throw Error('赠品需使用本任务附加文件夹');gifts={...gifts,directory:folder.path};}
  normalized.push({...c,...(gifts?{gifts}:{})});
 }
 return multiple?{args:{...args,...(giftSource?{giftSource}:{}),templates:normalized},templateInputs:resolved}:{args:{...normalized[0],...(giftSource?{giftSource}:{})},templateInput:resolved[0].template};
}
async function validateTemplateAttachments(p,file,task){
 if(p.decisions.giftSource){const g=p.decisions.giftSource,f=await file(g.workbookFileId,task);if(f.type==='folder'||key(f.path)!==key(g.workbook.path))throw Error('赠品对照表不属于本任务');}
 for(const entry of require('../sku-template-routing.cjs').templateSources(p)){
  if(entry.templateFileId){const f=await file(entry.templateFileId,task);if(key(f.path)!==key(entry.template.path))throw Error('外部模板不属于当前任务');}
  else{const allowed=await Promise.all((task.files||[]).filter(f=>f.type!=='folder').map(f=>file(f.id,task)));if(!allowed.some(f=>key(f.path)===key(entry.template.path)))throw Error('外部模板不属于当前任务');}
 }
 const configs=p.templates?p.decisions.templates:[p.decisions];
 for(const c of configs){if(!c.gifts)continue;const folder=await file(c.gifts.directoryFileId,task);if(folder.type!=='folder'||key(folder.path)!==key(c.gifts.directory))throw Error('赠品目录不属于本任务');}
}
module.exports={resolveTemplateInputs,validateTemplateAttachments};
