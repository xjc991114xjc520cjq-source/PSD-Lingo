const path=require('node:path');
async function backgroundTemplates(job,hash){
 if(job.templates!==undefined&&job.templatePath!==undefined)throw Error('多模板任务不能混用templatePath');
 const configs=job.templates===undefined?[{templatePath:job.templatePath}]:job.templates;
 if(!Array.isArray(configs)||!configs.length||configs.length>12||configs.some(c=>!c||!path.isAbsolute(c.templatePath||'')||!/\.(psd|psb)$/i.test(c.templatePath)||job.templates!==undefined&&(typeof c.templateFileId!=='string'||!c.templateFileId))||new Set(configs.map(c=>c.templateFileId)).size!==configs.length)throw Error('后台模板清单无效');
 if(job.action==='inspect'&&job.templates!==undefined)throw Error('inspect请分别提供templatePath，之后统一配置');
 const templates=[];for(const c of configs)templates.push({templateFileId:c.templateFileId,template:{path:c.templatePath,fingerprint:await hash(c.templatePath)}});return templates;
}
function validateBackgroundTemplates(p,templates){
 const expected=require('../sku-template-routing.cjs').templateSources(p),key=p=>path.resolve(p).toLowerCase();
 if(expected.length!==templates.length||expected.some(e=>!templates.some(t=>(!p.templates||t.templateFileId===e.templateFileId)&&key(t.template.path)===key(e.template.path)&&t.template.fingerprint===e.template.fingerprint)))throw Error('运行计划模板与本次完整模板清单不一致');
}
module.exports={backgroundTemplates,validateBackgroundTemplates};
