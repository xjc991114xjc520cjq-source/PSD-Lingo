const {test}=require('node:test'),assert=require('node:assert/strict');
const compact=require('../services/design-audit-response.cjs'),page=require('../services/design-page-audit.cjs');
const request={compactAuditVersion:1,designReviewVersion:1,repairGuidanceVersion:1,reviewProfile:'delivery',layers:[],containers:[],designReviewSources:[{id:'design-critique',required:true},{id:'optional'}],finalDelivery:{board:'Board'},visuals:[]};
const answer=()=>({checks:Object.fromEntries(page.checks.map(k=>[k,'pass'])),design:Object.fromEntries(require('../services/design-composition.cjs').dimensions.map(k=>[k,'accept'])),skills:{'design-critique':'accept',optional:'not-applicable'},summary:'标题组与价格清楚，内容未重复、未遮挡。',repairPlan:[]});
test('compact joint inspection retains all verdict coverage, one summary and strict repair validation',()=>{
 const v=answer(),a=page.validateAudit(v,request);assert.equal(a.passed,true);assert.equal(a.checks.length,6);assert.equal(a.designChecks.length,4);assert.equal(a.skillReviews.length,2);assert.ok(JSON.stringify(v).length<JSON.stringify(a).length*.7);
 delete v.checks.clearance;assert.throws(()=>page.validateAudit(v,request));
 const bad=answer();bad.checks.clearance='fail';assert.throws(()=>page.validateAudit(bad,request),/遗漏/);
 const missing=answer();missing.skills['design-critique']='not-applicable';assert.throws(()=>page.validateAudit(missing,request),/适用/);
});
test('one issue covers shared design and copy failures without repeated prose',()=>{
 const v=answer();v.checks.clearance='fail';v.design.opticalSpacing='revise';v.skills['design-critique']='revise';v.repairPlan=[{id:'price',sourceChecks:['check:clearance','design:opticalSpacing','skill:design-critique'],layerKeys:[],problem:'底部价格标签遮挡关键数字',cause:'价格组挤占同一阅读区',action:'将完整价格组移入留白，保持现价主导与标签从属',acceptance:'价格和标签清楚且组内留白均衡',dependsOn:[]}];assert.equal(page.validateAudit(v,request).passed,false);
});
test('default inspection and opt-in advanced review have distinct prompts without asking for source or crops',()=>{
 const p=page.auditPrompt(request);assert.match(p,/成品检查/);assert.match(p,/不要为主观偏好/);assert.doesNotMatch(p,/看不清先补同状态局部图/);assert.match(page.auditPrompt({...request,reviewProfile:'advanced'}),/完整设计审验/);assert.throws(()=>require('../services/review-profile.cjs').normalize('fast-ignore-issues'));assert.equal(require('../services/review-profile.cjs').normalize(),'delivery');
});
test('transport window bounds images and batch size without rejecting large individual images',()=>{
 const {windows}=require('../services/design-audit-policy.cjs');const p=n=>({visuals:[{dataURL:'x'.repeat(n)}]});assert.deepEqual(windows([p(9e6),p(10)]).map(x=>x.length),[1,1]);assert.deepEqual(windows(Array.from({length:54},()=>p(1))).map(x=>x.length),Array(9).fill(6));
});

test('advanced mode and independent review kind survive failed-task continuation and stay read-only',async()=>{
 const {AgentTask}=require('../services/agent-task.cjs');let writes=0;const task=new AgentTask({execute:async()=>{writes++;return {};},think:async()=>({kind:'blocked',message:'fixture',tool:'',arguments:'{}',questions:[]})});
 task.restoreContinuation({id:'prior',mode:'local',request:'Review images',reviewProfile:'advanced',taskKind:'image-audit',status:'failed',files:[],history:[]});assert.equal(task.public().reviewProfile,'advanced');assert.equal(task.public().taskKind,'image-audit');
 await assert.rejects(task.performTool({tool:'import_source',args:{fileId:'anything'}}),/只允许/);assert.equal(writes,0);
});
