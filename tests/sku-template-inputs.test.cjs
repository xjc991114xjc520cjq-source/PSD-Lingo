const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveTemplateInputs,validateTemplateAttachments}=require('../services/agent-template-inputs.cjs');
const {backgroundTemplates,validateBackgroundTemplates}=require('../services/sku-template-background-inputs.cjs');
test('all templates and gift folders resolve through current attachments, never model paths',async()=>{
 const entries={A:{path:'C:/task/A.psd'},B:{path:'C:/task/B.psb'},G:{path:'C:/task/gifts',type:'folder'}};const file=async id=>{if(!entries[id])throw Error('不属于本任务');return entries[id];};
 const args={templates:[{templateFileId:'A',scanId:'a',gifts:{directoryFileId:'G',directory:'C:/foreign'}},{templateFileId:'B',scanId:'b',giftMode:'none'}]},r=await resolveTemplateInputs(args,file,{}, {hashInputs:false});
 assert.equal(r.args.templates[0].gifts.directory,'C:/task/gifts');assert.equal(r.templateInputs[1].template.path,'C:/task/B.psb');assert.equal(args.templates[0].gifts.directory,'C:/foreign');
 const p={templates:r.templateInputs.map((t,i)=>({...t,scanId:i?'b':'a'})),decisions:r.args};await validateTemplateAttachments(p,file,{});p.templates[1].template.path='C:/foreign/B.psb';await assert.rejects(validateTemplateAttachments(p,file,{}),/不属于当前任务/);
 await assert.rejects(resolveTemplateInputs({templates:[{templateFileId:'A'},{templateFileId:'foreign'}]},file,{}, {hashInputs:false}),/不属于本任务/);
 await assert.rejects(resolveTemplateInputs({templates:[{templateFileId:'A',gifts:{directoryFileId:'A'}}]},file,{}, {hashInputs:false}),/文件夹/);
});
test('official background jobs bind every file, scan and hash rather than accepting only the first template',async()=>{
 const job={action:'configure',templates:[{templateFileId:'A',templatePath:'C:/A.psd'},{templateFileId:'B',templatePath:'C:/B.psb'}]},templates=await backgroundTemplates(job,async p=>p),p={templates:templates.map((t,i)=>({...t,scanId:String(i)}))};validateBackgroundTemplates(p,templates);
 for(const mutate of [t=>t.pop(),t=>t[1].template.fingerprint='changed',t=>t[1].templateFileId='A',t=>t[1].template.path='C:/foreign.psb']){const t=structuredClone(templates);mutate(t);assert.throws(()=>validateBackgroundTemplates(p,t),/完整模板清单/);}
 for(const invalid of [{...job,templatePath:'C:/A.psd'},{...job,action:'inspect'},{...job,templates:[]},{...job,templates:[{templateFileId:'A',templatePath:'relative.psd'}]}])await assert.rejects(backgroundTemplates(invalid,async p=>p));
 const legacy=await backgroundTemplates({action:'configure',templatePath:'C:/A.psd'},async()=> 'hash');validateBackgroundTemplates({template:{path:'C:/A.psd',fingerprint:'hash'},scanId:'a'},legacy);
});
