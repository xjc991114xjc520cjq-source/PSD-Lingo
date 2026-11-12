// Shared plan routing contract. Single-template plans remain readable.
function templateSources(p){
 if(!p)return [];
 if(p.templates!==undefined){
  if(!Array.isArray(p.templates)||!p.templates.length||p.templates.length>12||p.templates.some(t=>!t||typeof t.templateFileId!=='string'||!t.templateFileId||!t.scanId||!t.template?.path)||new Set(p.templates.map(t=>t.templateFileId)).size!==p.templates.length)throw Error('多模板来源清单无效');
  return p.templates;
 }
 if(!p.template?.path)throw Error('缺少外部模板来源');
 return [{templateFileId:p.decisions?.templateFileId,scanId:p.scanId,template:p.template,giftCatalog:p.giftCatalog}];
}
function requestTemplate(p,r){
 const sources=templateSources(p),entry=p.templates?sources.find(t=>t.templateFileId===r.templateFileId&&t.scanId===r.scanId):sources[0];
 if(!entry)throw Error('画板引用了不属于本计划的模板扫描');return entry;
}
module.exports={templateSources,requestTemplate};
