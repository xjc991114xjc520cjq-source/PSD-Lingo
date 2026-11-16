const {test}=require('node:test'),assert=require('node:assert/strict');
const {AgentTask}=require('../services/agent-task.cjs');
const {mappingForAgent}=require('../services/agent-product-review.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
const done={kind:'complete',message:'Done',tool:'',arguments:'{}',questions:[]};
test('product confirmation requires actual saved approval, retains pause and answers, and continues same task',async()=>{
 let calls=0;const a=new AgentTask({think:async()=>{calls++;await a.confirmProductMapping({mappingId:'m',choices:[]});return done;}});
 a.start({request:'Modify SKU'});await tick();const id=a.current.id,q=a.current.question;
 assert.equal(q.kind,'product_mapping');assert.throws(()=>a.answer({questionId:q.id,answers:{}}),/文字回答/);
 assert.throws(()=>a.productMappingApproved(q.id,{id:'other',approved:{}}),/变化/);
 a.productMappingApproved(q.id,{id:'m',approved:{approvalDigest:'verified'}});await a.runPromise;
 assert.equal(a.current.id,id);assert.equal(a.current.status,'completed');assert.equal(calls,1);
 assert.equal(a.current.history.find(h=>h.type==='user_answer').approvalDigest,'verified');
});
test('pause interrupts pending native wait, retains exact review, saves while paused without starting work',async()=>{
 let calls=0;const a=new AgentTask({think:async()=>{calls++;if(calls===1)await a.confirmProductMapping({mappingId:'m'});return done;}});
 a.start({request:'Modify'});await tick();const q=a.current.question;a.pause();await tick();
 assert.equal(a.current.question.id,q.id);assert.equal(a.current.status,'paused');
 a.productMappingApproved(q.id,{id:'m',approved:{approvalDigest:'verified'}});await tick();assert.equal(calls,1);assert.equal(a.current.status,'paused');
 a.resume();await a.runPromise;assert.equal(a.current.status,'completed');assert.equal(calls,2);
});
test('stop while waiting rejects stale approval and finishes without continuing',async()=>{
 const a=new AgentTask({think:async()=>{await a.confirmProductMapping({mappingId:'m'});return done;}});
 a.start({request:'Modify'});await tick();const q=a.current.question;a.stop();await a.runPromise;
 assert.equal(a.current.status,'stopped');assert.throws(()=>a.productMappingApproved(q.id,{id:'m',approved:{}}),/变化/);
});
test('mid-task clarification invalidates an old draft instead of accepting stale decisions',async()=>{
 let calls=0;const a=new AgentTask({think:async()=>{calls++;if(calls===1)await a.confirmProductMapping({mappingId:'m'});return done;}});
 a.start({request:'Modify'});await tick();const q=a.current.question;a.supplement('Use another activity sheet');await a.runPromise;
 assert.equal(a.current.question,null);assert.equal(calls,2);assert.throws(()=>a.productMappingApproved(q.id,{id:'m',approved:{}}),/变化/);
 assert.ok(a.current.history.some(h=>h.type==='user_supplement'));assert.ok(a.current.history.some(h=>h.type==='product_review_invalidated'));
});
test('mapping wire report resolves candidate identities once and retains exact field content and numeric provenance',()=>{
 const fields=[{key:'price',value:'0',state:'value',cell:'C2',numeric:{raw:'0.0',display:'0',canonical:'0',formula:null,digest:'local'}}];
 const r={id:'m',source:{path:'source.psb'},report:{identityDigest:'identity',summary:{proposed:1},rows:[{id:'r',name:'Product',code:'123',fields}],boards:[{boardId:1,candidates:[{rowId:'r',name:'Product',code:'123',reason:'same model'}]}]},approved:null};
 const v=mappingForAgent(r);assert.equal(v.report.boards[0].candidates[0].name,undefined);assert.equal(v.report.rows[0].name,'Product');assert.deepEqual(v.report.rows[0].fields[0].numeric,{raw:'0.0',display:'0',canonical:'0',formula:null});assert.equal(v.report.rows[0].fields[0].value,'0');
 r.approved={approvalDigest:'digest',boards:[{action:'use',rowId:'r',fields}]};const p=mappingForAgent(r);assert.equal(p.report.rows,undefined);assert.equal(p.approved.boards[0].fields[0].cell,'C2');assert.match(p.instruction,/不要重读/);assert.equal(r.report.rows[0].fields[0].numeric.digest,'local');
});
