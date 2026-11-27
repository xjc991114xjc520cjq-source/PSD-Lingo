// Shared plan routing contract. Single-template plans remain readable.
const templateIdentity=t=>t?.templateKey||t?.templateFileId;
function uniqueTemplates(configs){return Array.isArray(configs)&&configs.length>0&&configs.length<=12&&configs.every(t=>t&&typeof t.templateFileId==='string'&&t.templateFileId&&(!('templateKey'in t)||typeof t.templateKey==='string'&&t.templateKey.trim()))&&new Set(configs.map(templateIdentity)).size===configs.length;}
function templateSources(p){
 if(!p)return [];
 if(p.templates!==undefined){
  if(!uniqueTemplates(p.templates)||p.templates.some(t=>!t.scanId||!t.template?.path))throw Error('多模板来源清单无效');
  return p.templates;
 }
 if(!p.template?.path)throw Error('缺少外部模板来源');
 return [{templateFileId:p.decisions?.templateFileId,scanId:p.scanId,template:p.template,giftCatalog:p.giftCatalog}];
}
function requestTemplate(p,r){
 const sources=templateSources(p),entry=p.templates?sources.find(t=>templateIdentity(t)===templateIdentity(r)&&t.templateFileId===r.templateFileId&&t.scanId===r.scanId):sources[0];
 if(!entry)throw Error('画板引用了不属于本计划的模板扫描');return entry;
}
module.exports={templateSources,requestTemplate,templateIdentity,uniqueTemplates};
