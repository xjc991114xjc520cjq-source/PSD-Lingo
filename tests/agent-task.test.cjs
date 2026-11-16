const {test}=require('node:test'),assert=require('node:assert/strict');
const {AgentTask,parseStep,promptFor}=require('../services/agent-task.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('unknown native result is recorded and stops the model before a repeated write',async()=>{let calls=0;const a=new AgentTask({think:async()=>{calls++;return {kind:'tool',message:'Export',tool:'export_files',arguments:'{}',questions:[]};},execute:async()=>({uncertain:true,failed:1,message:'RPC response lost; inspect output',results:[{pendingOutput:'copy.ai'}]})});a.start({request:'Export copy'});await a.runPromise;assert.equal(calls,1);assert.equal(a.current.status,'failed');assert.match(a.current.error,/inspect output/);assert.equal(a.current.history.find(h=>h.type==='tool_result').result.results[0].pendingOutput,'copy.ai');});
const step=(kind,tool='',args={},questions=[])=>({kind,message:kind,tool,arguments:JSON.stringify(args),questions});

test('returned errors and unfinished document selection cannot be reported as completed',async()=>{
 for(const result of [{error:'Renderer rejected operation'},{ok:false,message:'Rejected'},{selectionRequired:true},{cancelled:true},{items:[{result:{error:'Nested read failed'}}]}]){
  let n=0;const a=new AgentTask({think:async()=>[step('tool','read_document',{fileId:'book'}),step('complete')][n++],execute:async()=>result});a.start({request:'Process'});await a.runPromise;assert.equal(a.current.status,'failed',JSON.stringify(result));
 }
});

test('product copy clears stale visuals and cannot finish until the actual export is reviewed',async()=>{
 for(const exported of [false,true]){
  let n=0;const steps=[step('tool','configure_product_copy',{fileIndex:0}),...(exported?[step('tool','export_files')]:[]),step('complete')];
  const a=new AgentTask({think:async()=>steps[n++],execute:async tool=>tool==='export_files'?{qualityPassed:true,saved:1}:{changed:true,fileIndex:0}});
  a.start({request:'Change per-product footer copy'});a.current.visuals=['obsolete'];await a.runPromise;
  assert.deepEqual(a.current.visuals,[]);assert.equal(a.current.status,exported?'completed':'failed');
 }
});

test('embedded workbook references keep distinct identities and deliver actual images separately from history',async()=>{
 const ids=['xlsx-reference:poster','xlsx-reference:detail'];let n=0,delivered=[];
 const steps=ids.map(id=>step('tool','read_document',{fileId:'same-workbook',image:{sheet:id,media:'xl/media/reference.png'}}));steps.push(step('complete'));
 const a=new AgentTask({think:async()=>steps[n++],execute:async()=>({name:'copy.xlsx',referenceFileId:ids[delivered.length],images:[`image-${delivered.push(true)}`]})});
 a.start({request:'Compare candidate poster and detail references'});await a.runPromise;
 assert.equal(a.current.status,'completed');assert.deepEqual(a.current.referenceVisuals.map(v=>v.fileId),ids);assert.deepEqual(a.current.referenceVisuals.map(v=>v.image),['image-1','image-2']);
 for(const h of a.current.history.filter(h=>h.type==='tool_result'))assert.deepEqual(h.result.images,[{index:0,providedToModel:true}]);
});
test('hiding objects cannot complete until the affected page has a fresh current preview',async()=>{
 for(const verified of [false,true]){let n=0;const steps=[step('tool','set_artwork_visibility'),...(verified?[step('tool','preview')]:[]),step('complete')];const a=new AgentTask({think:async()=>steps[n++],execute:async tool=>tool==='set_artwork_visibility'?{changed:true,hidden:true,fileIndex:0,objectId:'g:1',boardBox:[0,0,500,800]}:{fileIndex:0,images:['current'],evidence:[{stage:'current',crop:[0,0,500,800]}]}});a.start({request:'Hide a verified duplicate'});await a.runPromise;assert.equal(a.current.status,verified?'completed':'failed');}
});
test('manual reference survives preview replacement while mutations invalidate stale current imagery',async()=>{
 const steps=[step('tool','read_document',{fileId:'manual'}),step('tool','preview'),step('tool','edit_text',{changes:[]}),step('complete')];let round=0;
 const a=new AgentTask({think:async task=>{if(round===2){assert.equal(task.referenceVisuals[0].image,'reference');assert.deepEqual(task.visuals,['current']);}if(round===3){assert.equal(task.referenceVisuals[0].image,'reference');assert.deepEqual(task.visuals,[]);}return steps[round++];},execute:async tool=>tool==='read_document'?{name:'manual.jpg',images:['reference']}:tool==='preview'?{images:['current'],evidence:[{stage:'current'}]}:{edited:1}});
 a.start({request:'Compare matching manual and actual artwork',mode:'local'});await a.runPromise;assert.equal(a.current.status,'completed');assert.deepEqual(a.public().referenceImages,[{fileId:'manual',name:'manual.jpg'}]);assert.equal(JSON.stringify(a.public()).includes('"image":"reference"'),false);
});
test('saved draft with failed page quality can never become a completed production task',async()=>{
 let n=0;const a=new AgentTask({think:async()=>n++?step('complete'):step('tool','export_files'),execute:async()=>({saved:1,failed:0,qualityPassed:false,failures:['Missing original price component']})});
 a.start({request:'Produce a complete poster',mode:'local'});await a.runPromise;assert.equal(a.current.status,'failed');assert.match(a.current.error,/Missing original price/);assert.equal(a.current.history.find(h=>h.type==='tool_result').result.saved,1);
});
async function until(fn){for(let n=0;n<200;n++){if(fn())return;await tick();}throw Error('state wait failed');}
test('software loop records actual tool outcomes and requires every question answer',async()=>{
 const calls=[],q=[{id:'language',title:'目标语言',options:['英文','日文']},{id:'scope',title:'范围',options:[]}];let n=0;
 const a=new AgentTask({think:async()=>[step('tool','workspace'),step('question','',{},q),step('complete')][n++],execute:async t=>{calls.push(t);return {files:[]};}});
 a.start({request:'分析原稿'});await until(()=>a.current.question);const id=a.current.question.id;
 assert.throws(()=>a.answer({questionId:id,answers:{language:'英文'}}),/所有/);
 a.supplement('保留产品图片');assert.equal(a.current.question.id,id);
 a.answer({questionId:id,answers:{language:'英文',scope:'全部'}});await a.runPromise;
 assert.equal(a.current.status,'completed');assert.deepEqual(calls,['workspace']);
 const prompt=promptFor(a.current);for(const text of ['分析原稿','保留产品图片','user_supplement','user_answer','英文','全部','tool_result'])assert.ok(prompt.includes(text),text);
});
test('mid-planning supplements discard a late response even if provider ignores abort',async()=>{
 const pending=defer(),second=defer();let n=0;const calls=[];
 const a=new AgentTask({think:async()=>++n===1?pending.promise:second.promise,execute:async tool=>calls.push(tool)});
 a.start({request:'原始需求'});await until(()=>a.current.controller);a.supplement('新的限制');pending.resolve(step('tool','export_files'));await until(()=>n===2);
 second.resolve(step('complete'));await a.runPromise;assert.deepEqual(calls,[]);assert.equal(a.current.step,1);assert.ok(promptFor(a.current).includes('原始需求'));
});
test('pause during a native write records completion and resumes without repeating it',async()=>{
 const write=defer();let n=0,writes=0;
 const a=new AgentTask({think:async()=>++n===1?step('tool','export_files'):step('complete'),execute:async()=>{writes++;return write.promise;}});
 a.start({request:'导出'});await until(()=>a.current.inTool);a.pause();assert.equal(a.current.status,'pausing');write.resolve({saved:1});await until(()=>a.current.status==='paused');assert.equal(n,1);
 a.resume();await a.runPromise;assert.equal(writes,1);assert.equal(a.current.status,'completed');assert.equal(a.current.history.filter(h=>h.type==='tool_result').length,1);
});
test('stop during native work waits for its boundary and does not run next step',async()=>{
 const write=defer();let n=0;const a=new AgentTask({think:async()=>{n++;return step('tool','export_files');},execute:async()=>write.promise});
 a.start({request:'导出'});await until(()=>a.current.inTool);a.stop();assert.equal(a.current.status,'stopping');assert.throws(()=>a.start({request:'另一任务'}),/正在进行/);
 write.resolve({saved:1});await a.runPromise;assert.equal(n,1);assert.equal(a.current.status,'stopped');assert.equal(a.current.history.at(-1).result.saved,1);
});
test('stopping an abort-resistant planner prevents concurrent task contamination',async()=>{
 const pending=defer();const a=new AgentTask({think:async()=>pending.promise,execute:()=>assert.fail('stopped')});a.start({request:'旧任务'});await until(()=>a.current.controller);a.stop();assert.throws(()=>a.start({request:'新任务'}),/正在进行/);pending.resolve(step('complete'));await a.runPromise;
 a.think=async()=>step('complete');a.start({request:'新任务'});await a.runPromise;assert.equal(a.current.request,'新任务');assert.equal(a.current.status,'completed');
});
test('unknown write outcome fails closed instead of asking AI to retry it',async()=>{
 let calls=0;const a=new AgentTask({think:async()=>{calls++;return step('tool','export_files');},execute:async()=>{throw Object.assign(Error('不能确定执行结果'),{uncertain:true});}});a.start({request:'导出'});await a.runPromise;assert.equal(calls,1);assert.equal(a.current.status,'failed');assert.match(a.current.error,/不能确定/);
});
test('invalid tool and question contracts are rejected',()=>{
 for(const v of [step('tool','shell'),step('tool','workspace',[]),step('question'),step('question','',{},[{id:'x',title:'a',options:[]},{id:'x',title:'b',options:[]}]),{...step('complete'),message:4}])assert.throws(()=>parseStep(v));
});
test('follow-up keeps original request, completed tool results and supplements',async()=>{
 let n=0;const a=new AgentTask({think:async()=>++n===1?step('tool','workspace'):step('complete'),execute:async()=>({files:[]})});a.start({request:'原始要求'});await a.runPromise;const id=a.current.id;a.followUp('接着检查价格块');await a.runPromise;assert.equal(a.current.id,id);assert.equal(a.current.request,'原始要求');assert.ok(a.current.history.some(h=>h.type==='tool_result'));assert.ok(promptFor(a.current).includes('接着检查价格块'));assert.equal(a.current.status,'completed');
});

test('unresolved preview failure cannot be labeled complete after unrelated workspace read',async()=>{
 let n=0;const steps=[step('tool','preview',{fileIndex:0}),step('tool','workspace'),step('complete')];
 const a=new AgentTask({think:async()=>steps[n++],execute:async tool=>{if(tool==='preview')throw Error("Cannot read properties of undefined (reading 'target')");return {files:[]};}});
 a.start({request:'制作英文海报'});await a.runPromise;assert.equal(a.current.status,'failed');assert.match(a.current.error,/reading 'target'/);
});
test('successful retry clears only the recovered operation and can complete',async()=>{
 let n=0,calls=0;const a=new AgentTask({think:async()=>[step('tool','preview',{fileIndex:0}),step('tool','preview',{fileIndex:0,retry:true}),step('complete')][n++],execute:async()=>{if(++calls===1)throw Error('preview unavailable');return {images:['data:image/png;base64,fixture']};}});
 a.start({request:'检查预览'});await a.runPromise;assert.equal(a.current.status,'completed');assert.equal(a.current.error,'');
});

test('retry on another file preserves unresolved preview failure',async()=>{let n=0;const steps=[step('tool','preview',{fileIndex:0}),step('tool','preview',{fileIndex:1,retry:true}),step('complete')];const a=new AgentTask({think:async()=>steps[n++],execute:async(_tool,args)=>{if(args.fileIndex===0)throw Error('first file unavailable');return {images:[]};}});a.start({request:'check files'});await a.runPromise;assert.equal(a.current.status,'failed');assert.match(a.current.error,/first file unavailable/);});

test('verified alternative object operation resolves only the same text presence action',async()=>{
 for(const recovered of [{layerKey:'0:6',mode:'clear'},{layerKey:'0:5',mode:'clear'},{layerKey:'0:6',mode:'hidden'}]){
  let n=0;const steps=[step('tool','set_text_presence',{layerKey:'0:6',mode:'clear',reason:'First attempt'}),step('tool','set_artwork_visibility',{fileIndex:0,objectId:'t:7',hidden:true,mode:recovered.mode,reason:'Verified alternate interface'}),step('tool','export_files'),step('complete')];
  const a=new AgentTask({think:async()=>steps[n++],execute:async tool=>{if(tool==='set_text_presence')throw Error('unsupported text');return tool==='set_artwork_visibility'?{changed:true,hidden:true,textPresence:recovered}:{qualityPassed:true,saved:1};}});a.start({request:'Remove a verified duplicate'});await a.runPromise;assert.equal(a.current.status,recovered.layerKey==='0:6'&&recovered.mode==='clear'?'completed':'failed');assert.equal(a.current.history.filter(h=>h.type==='tool_error').length,1);
 }
});
test('changing only the reason on a successful text retry does not retain its obsolete error',async()=>{
 let n=0,calls=0;const steps=[step('tool','set_text_presence',{layerKey:'0:1',mode:'clear',reason:'Old reason'}),step('tool','set_text_presence',{layerKey:'0:1',mode:'clear',reason:'Confirmed reason'}),step('tool','export_files'),step('complete')];
 const a=new AgentTask({think:async()=>steps[n++],execute:async tool=>{if(tool==='set_text_presence'&&++calls===1)throw Error('transient error');return tool==='export_files'?{qualityPassed:true,saved:1}:{changed:true};}});a.start({request:'Verified removal'});await a.runPromise;assert.equal(a.current.status,'completed');
});
test('confirmed successful import resolves its earlier guard failure without clearing another document failure',async()=>{
 for(const otherFailure of [false,true]){
  const args={fileId:'same-copy',selection:{segments:[{sheet:'Copy',rowStart:2,rowEnd:9}]}};
  const steps=[...(otherFailure?[step('tool','import_document',{fileId:'other'})]:[]),step('tool','import_document',args),step('tool','import_document',{...args,replaceExisting:true}),step('complete')];let n=0;
  const a=new AgentTask({think:async()=>steps[n++],execute:async(_tool,args)=>{if(!args.replaceExisting)throw Error('existing bindings require confirmation');return {records:[{id:'new'}]};}});
  a.start({request:'Continue with confirmed copy'});await a.runPromise;assert.equal(a.current.status,otherFailure?'failed':'completed');
  assert.equal(a.current.history.filter(h=>h.type==='tool_error').length,otherFailure?2:1);
 }
});
test('explicit unfinished outcome and partial export both remain incomplete',async()=>{
 const a=new AgentTask({think:async()=>({...step('blocked'),message:'尚未制作，请检查能力缺口'})});a.start({request:'制作'});await a.runPromise;assert.equal(a.current.status,'failed');assert.match(a.current.error,/尚未制作/);
 let n=0;const b=new AgentTask({think:async()=>[step('tool','export_files'),step('complete')][n++],execute:async()=>({saved:1,failed:1})});b.start({request:'导出全部'});await b.runPromise;assert.equal(b.current.status,'failed');
});

test('corrected workbook column selection resolves only the same attachment error',async()=>{
 for(const unrelated of [false,true]){let n=0;const steps=[...(unrelated?[step('tool','import_document',{fileId:'other'})]:[]),step('tool','import_document',{fileId:'book',selection:{sourceColumns:'A',targetColumns:'A'}}),step('tool','import_document',{fileId:'book',selection:{sourceColumns:'A',targetColumns:'C:F'}}),step('complete')];const a=new AgentTask({think:async()=>steps[n++],execute:async(_t,args)=>{if(args.fileId==='other'||args.selection.targetColumns==='A')throw Error('invalid selection');return {records:[{id:'approved'}]};}});a.start({request:'Import corrected price fields'});await a.runPromise;assert.equal(a.current.status,unrelated?'failed':'completed');}
});

test('resume while native question is unanswered keeps waiting for that exact answer',async()=>{const a=new AgentTask({think:async()=>step('complete')});a.current={id:'isolated',history:[],status:'running',request:'Keep original',revision:0};const controller=new AbortController();let ended=false;const result=a.nativeQuestion({questions:[{id:'q',question:'Scope?',options:[]}]},controller.signal).then(r=>{ended=true;return r;});const id=a.current.question.id;a.resume();await tick();assert.equal(ended,false);assert.equal(a.current.question.id,id);a.answer({questionId:id,answers:{q:'Only current file'}});assert.deepEqual(await result,{answers:{q:{answers:['Only current file']}}});});
