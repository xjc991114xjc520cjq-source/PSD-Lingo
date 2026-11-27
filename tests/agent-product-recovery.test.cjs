const {test}=require('node:test'),assert=require('node:assert/strict');
const {AgentTask}=require('../services/agent-task.cjs'),{taskData}=require('../services/agent-context.cjs');
const {references}=require('../services/agent-product-references.cjs');
const done={kind:'complete',message:'Done',tool:'',arguments:'{}',questions:[]};
const args={sourceFileId:'source',workbookFileId:'book'};
test('restoring historical guessed mapping IDs never makes failed attempts export prerequisites',()=>{
 const history=[{type:'tool_start',tool:'read_product_mapping',args:{...args,mappingId:'guessed'}},{type:'tool_error',tool:'read_product_mapping',error:'产品对应记录ID无效'},{type:'tool_start',tool:'read_product_mapping',args:{...args,mappingId:'real'}},{type:'tool_result',tool:'read_product_mapping',result:{mappingId:'real',approved:{}}}];
 const a=new AgentTask({});a.restoreContinuation({id:'old',request:'Modify',status:'failed',mode:'local',productMappingIds:['guessed','real'],history});assert.deepEqual(a.public().productMappingIds,['real']);assert.deepEqual(taskData(a.current).productMappings,[{mappingId:'real',...args}]);
 assert.deepEqual(references({history:[{type:'tool_start',tool:'read_product_mapping',args:{mappingId:'never-read'}}]}),[]);
});
test('correcting a read-only product identity resolves that same attachment scope without hiding other failures',async()=>{
 for(const same of [true,false]){let i=0;const steps=[{kind:'tool',tool:'read_product_mapping',arguments:JSON.stringify({...args,mappingId:'wrong'}),message:'Read',questions:[]},{kind:'tool',tool:'read_product_mapping',arguments:JSON.stringify({...args,sourceFileId:same?'source':'other',mappingId:'real'}),message:'Recover',questions:[]},done];const a=new AgentTask({think:async()=>steps[i++],execute:async(_,v)=>{if(v.mappingId==='wrong')throw Error('产品对应记录ID无效');return {mappingId:'real'};}});a.start({request:'Modify'});await a.runPromise;assert.equal(a.current.status,same?'completed':'failed');}
});
test('user can reopen saved all-skipped correspondence directly after task ends and submit a corrected selection',async()=>{
 const a=new AgentTask({think:async()=>done});a.start({request:'Modify'});await a.runPromise;const original=a.current.id;const reopened=a.reconsiderProductMapping({mappingId:'real',...args});assert.equal(reopened.id,original);assert.equal(reopened.question.kind,'product_mapping');assert.equal(reopened.status,'waiting');assert.equal(reopened.revision,1);a.productMappingApproved(reopened.question.id,{id:'real',approved:{approvalDigest:'new',boards:[{action:'use',rowId:'product'}]}});await a.runPromise;assert.equal(a.current.status,'completed');assert.ok(a.current.history.some(h=>h.type==='product_review_reopened'));
});

test('analyzed correspondence stays available to the user without becoming an unrelated export prerequisite',()=>{
 const history=[{type:'tool_start',tool:'match_product_boards',args},{type:'tool_result',tool:'match_product_boards',result:{mappingId:'analysis-only'}}];const a=new AgentTask({});a.restoreContinuation({id:'old',request:'Modify',status:'failed',mode:'local',history});assert.deepEqual(a.public().productMappingIds,[]);assert.deepEqual(a.public().productMappings,[{mappingId:'analysis-only',...args}]);
});
