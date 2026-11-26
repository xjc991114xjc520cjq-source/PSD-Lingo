const test=require('node:test'),assert=require('node:assert/strict');
const {AgentTask}=require('../services/agent-task.cjs');
const step=(tool,args={})=>({kind:tool?'tool':'complete',tool:tool||'',arguments:JSON.stringify(args),message:'Check',questions:[]});
async function run(steps,execute){let i=0;const task=new AgentTask({think:async()=>steps[i++],execute});task.start({request:'Complete all selected files'});await task.runPromise;return task.current;}
test('a subset export cannot approve unsaved modifications in another file',async()=>{
 const t=await run([step('configure_product_copy',{fileIndex:0}),step('configure_product_copy',{fileIndex:1}),step('export_files',{fileIndices:[0]}),step()],async(tool,args)=>tool==='export_files'?{saved:1,qualityPassed:true,fileIndices:[0]}:{changed:true,fileIndex:args.fileIndex});assert.equal(t.status,'failed');assert.match(t.error,/尚未通过/);
});
test('corrected export scopes clear only matching failures and preserve other failures',async()=>{
 for(const repaired of [[0],[1],[0,1]]){let exports=0;const t=await run([step('export_files',{fileIndices:[0,1]}),step('export_files',{fileIndices:repaired}),step()],async()=>++exports===1?{saved:0,failed:2,qualityPassed:false}:{saved:repaired.length,qualityPassed:true});assert.equal(t.status,repaired.length===2?'completed':'failed');}
 const t=await run([step('export_files',{fileIndices:[0]}),step('export_files',{fileIndices:[0,1]}),step()],async(_tool,args)=>args.fileIndices.length===1?{failed:1}:{saved:2,qualityPassed:true});assert.equal(t.status,'completed');
});
test('operation uncertainty survives both IPC error envelopes and native engine dispatch',async()=>{
 const {errorDetails,restoreError}=require('../services/operation-error.cjs'),error=Object.assign(Error('submitted but no reply'),{uncertain:true,code:'NATIVE_PLAN_WORKFLOW',fileIndex:2});const restored=restoreError({error:error.message,...errorDetails(error)});assert.equal(restored.uncertain,true);assert.equal(restored.code,error.code);assert.equal(restored.fileIndex,2);
 let ps=0;const r=await require('../native-runner.cjs').runNativePlan({files:[{path:'source.ai',name:'AI'},{path:'source.psd',name:'PS'}]},{illustrator:async()=>{throw restored;},photoshop:async()=>{ps++;}});assert.equal(r.uncertain,true);assert.equal(ps,0);
 const t=await run([step('preview'),step()],async()=>{throw restoreError({error:'No reply',uncertain:true});});assert.equal(t.status,'failed');assert.match(t.error,/No reply/);assert.equal(t.history.filter(h=>h.type==='tool_start').length,1);
});

test('missing native receipt retains uncertainty through the public error envelope',()=>{
 const e=require('../services/native-receipt.cjs').missingReceipt(Error('report missing')),bridge=require('../services/operation-error.cjs');assert.equal(bridge.restoreError({error:e.message,...bridge.errorDetails(e)}).uncertain,true);assert.match(e.message,/不要重复执行/);
});
test('intentional interruption is retained without becoming an unresolved operation failure',async()=>{
 const t=await run([step('preview'),step()],async()=>{throw require('../services/operation-error.cjs').interrupted();});assert.equal(t.status,'completed');assert.equal(t.history.filter(h=>h.type==='tool_interrupted').length,1);
});
test('new instructions supersede unanswered stale questions without approving them',async()=>{
 const a=new AgentTask();a.current={status:'waiting',revision:0,history:[],question:{id:'old',items:[{id:'scope'}]}};a.supplement('Skip that product, keep the other files');assert.equal(a.current.question.id,'old');assert.equal(a.current.question.reviewRequested,true);assert.ok(a.current.history.some(h=>h.type==='question_review_requested'));assert.ok(!a.current.history.some(h=>h.type==='user_answer'));
});
test('active same-path replacement replaces stale identity even at attachment capacity',()=>{
 const {mergeAttachments}=require('../services/agent-attachments.cjs'),files=Array.from({length:24},(_,i)=>({id:'old'+i,path:'C:/source/'+i+'.psd'}));const next=mergeAttachments(files,[{id:'new',path:process.platform==='win32'?'C:/SOURCE/0.psd':'C:/source/0.psd'}]);assert.equal(next.length,24);assert.equal(next[0].id,'new');assert.throws(()=>mergeAttachments(next,[{id:'overflow',path:'C:/another.psd'}]),/24/);
});
test('completion accumulates separate delivered files and repairs only the same output scope',()=>{
 const {completionFor}=require('../services/agent-completion.cjs');const history=[0,1].flatMap(i=>[{type:'tool_start',tool:'export_files',args:{fileIndices:[i]}},{type:'tool_result',tool:'export_files',result:{fileIndices:[i],saved:1,qualityPassed:true,results:[{file:'File'+i,output:'copy'+i+'.ai',delivery:{boards:[{name:'A'}]}}]}}]);const r=completionFor({history});assert.equal(r.summary,'2 张画板 · 2 份可编辑文件');assert.match(r.verification,/通过/);
});

test('partial multi-file failure and single-file retry retain successful audited deliveries',()=>{
 const {applyExportOutcome}=require('../services/agent-delivery-scope.cjs'),{completionFor}=require('../services/agent-completion.cjs'),failures=new Map();
 const first={fileIndices:[0,1],saved:1,failed:1,qualityPassed:false,results:[{output:'zero.psd',delivery:{boards:[{name:'zero'}]}},{file:'one',error:'save failed'}],fileOutcomes:[{fileIndex:0,qualityPassed:true},{fileIndex:1,qualityPassed:false,error:'save failed'}]};
 applyExportOutcome(failures,{},first,'partial failure');assert.deepEqual([...failures.keys()],['export:file:1']);
 const fixed={fileIndices:[1],saved:1,qualityPassed:true,results:[{output:'one.psd',delivery:{boards:[{name:'one'}]}}],fileOutcomes:[{fileIndex:1,qualityPassed:true}]};applyExportOutcome(failures,{},fixed,'');assert.equal(failures.size,0);
 const history=[first,fixed].flatMap(result=>[{type:'tool_start',tool:'export_files',args:{fileIndices:result.fileIndices}},{type:'tool_result',tool:'export_files',result}]);const completion=completionFor({history});assert.equal(completion.tone,'success');assert.equal(completion.summary,'2 张画板 · 2 份可编辑文件');assert.match(completion.verification,/通过/);
});

test('partial success clears visibility only for its audited file and retry completes the remaining file',async()=>{
 let exports=0;
 const t=await run([step('configure_product_copy',{fileIndex:0}),step('configure_product_copy',{fileIndex:1}),step('export_files',{fileIndices:[0,1]}),step('export_files',{fileIndices:[1]}),step()],async(tool,args)=>{
  if(tool!=='export_files')return {changed:true,fileIndex:args.fileIndex};
  if(++exports===1)return {fileIndices:[0,1],failed:1,qualityPassed:false,fileOutcomes:[{fileIndex:0,qualityPassed:true},{fileIndex:1,qualityPassed:false}]};
  return {fileIndices:[1],qualityPassed:true};
 });assert.equal(t.status,'completed',t.error);
});

test('software-confirmed full retry replaces a previous export failure with unknown coverage',async()=>{
 let count=0;const t=await run([step('export_files'),step('export_files'),step()],async()=>{if(++count===1)throw Error('Export preparation failed');return {fileIndices:[0,1],exportScope:'all',qualityPassed:true,fileOutcomes:[{fileIndex:0,qualityPassed:true},{fileIndex:1,qualityPassed:true}]};});assert.equal(t.status,'completed',t.error);
});

test('progress publishes no repeated transcript, preserves terminal evidence and recovers missing bases',()=>{
 const {createStatePublication,restoreStateFrame}=require('../services/agent-state-publication.cjs'),sent=[],saved=[];let now=0;const publish=createStatePublication({send:s=>sent.push(s),save:s=>saved.push(s),now:()=>now});const history=[{type:'tool_result',result:{evidence:'x'.repeat(500000)}}],state={id:'task',status:'running',revision:0,history};publish(state);for(let i=0;i<100;i++){now++;publish({...state,progress:{current:i}});}assert.equal(saved.length,1);assert.equal(sent[1].history,undefined);assert.ok(JSON.stringify(sent[1]).length<300);assert.equal(restoreStateFrame(sent[1],state).history,history);assert.equal(restoreStateFrame(sent[1],{id:'other',history}),null);assert.equal(restoreStateFrame(sent[1],{id:'task',history:[]}),null);publish({...state,status:'completed'});assert.equal(sent.at(-1).history,history);assert.equal(saved.length,2);
});
test('native routing avoids constructing the unused legacy full-history prompt',async()=>{
 const deps={runTool(){},get prompt(){assert.fail('unused full prompt must remain lazy');}};const value=await require('../services/agent-provider.cjs').thinkAgent({},deps,{nativeThink:async(_task,received)=>{assert.equal(received,deps);return 'native';}});assert.equal(value,'native');
 const args={boards:Array.from({length:200},(_,i)=>({name:'SKU'+i,original:'x'.repeat(1000)}))};const parsed=require('../services/agent-task.cjs').parseStep(step('configure_artboards',args));assert.equal(parsed.args.boards.length,200);assert.throws(()=>require('../services/agent-task.cjs').parseStep({...step('workspace'),arguments:'[]'}),/参数无效/);
});
