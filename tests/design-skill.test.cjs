const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadDesignSkill,skillPrompt}=require('../services/design-skill.cjs');
const {validateAudit,checks}=require('../services/design-page-audit.cjs');
const composition=require('../services/design-composition.cjs');
test('bundled skill has verified identity and cannot silently accept tampered content',()=>{
 const skill=loadDesignSkill();assert.equal(skill.id,'composition-review');assert.match(skillPrompt({designSkill:skill}),/groupShape/);
 assert.equal(loadDesignSkill({readFile:()=>Buffer.from(skill.instructions.replace(/\r?\n/g,'\r\n'))}).sha256,skill.sha256);
 assert.throws(()=>loadDesignSkill({readFile:()=>Buffer.from('changed skill')}),/版本校验失败/);
});
test('technical success cannot override uncertain or rejected design dimensions',()=>{
 const r={layers:[],designReviewVersion:1},pass={checks:checks.map(id=>({id,verdict:'pass',evidence:'Technical fixture',layerKeys:[]})),designChecks:composition.dimensions.map(id=>({id,verdict:'accept',evidence:'Visible relationship fixture'}))};
 assert.equal(validateAudit(pass,r).passed,true);
 for(const verdict of ['revise','uncertain'])for(const c of pass.designChecks){const v=structuredClone(pass);v.designChecks.find(d=>d.id===c.id).verdict=verdict;assert.equal(validateAudit(v,r).passed,false);}
 assert.throws(()=>validateAudit({checks:pass.checks},r),/设计审验/);
});
