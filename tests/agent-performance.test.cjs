const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {historyFor,recordMetrics}=require('../services/agent-context.cjs');
const {thinkAgent}=require('../services/agent-provider.cjs');
const {runStructuredTask}=require('../services/ai-match.cjs');
const {AgentTask,promptFor}=require('../services/agent-task.cjs');
const {createExportCache}=require('../services/agent-export-cache.cjs');
const {hashFile}=require('../photoshop-file-io.cjs');
const step=(tool,args={})=>({kind:tool?'tool':'complete',message:'Checked',tool:tool||'',arguments:JSON.stringify(args),questions:[]});
async function temp(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'perf-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));return d;}
test('final native cache validates every JPG and preserves same-state write reuse',async t=>{
 const dir=await temp(t),source=path.join(dir,'source.ai'),output=path.join(dir,'final.ai'),jpg=path.join(dir,'board.jpg');await fs.writeFile(source,'original');let writes=0;
 const run=createExportCache(async()=>{writes++;await fs.writeFile(output,'AI-'+writes);await fs.writeFile(jpg,'JPG-'+writes);return {saved:1,failed:0,results:[{output,delivery:{verified:true,boards:[{path:jpg}]}}]};}),task={},plan={files:[{path:source,fingerprint:await hashFile(source)}]};
 await run(task,plan,dir);assert.equal((await run(task,plan,dir)).reused,true);assert.equal(writes,1);await fs.writeFile(jpg,'external modification');assert.equal((await run(task,plan,dir)).reused,undefined);assert.equal(writes,2);await fs.unlink(jpg);await run(task,plan,dir);assert.equal(writes,3);
});
test('exact duplicate references are lossless and never replace user instructions or raw history',()=>{
 const history=[{type:'user_supplement',text:'Keep original price'},{type:'tool_result',tool:'workspace',result:{layers:[1,2]}},{type:'tool_result',tool:'workspace',result:{layers:[1,2]}},{type:'tool_error',error:'Pending issue'},{type:'user_answer',answers:{a:'Keep original price'}}],before=JSON.stringify(history);
 const projected=historyFor(history);assert.equal(projected[2].resultUnchangedFromEvent,1);assert.deepEqual(history[projected[2].resultUnchangedFromEvent].result,history[2].result);assert.equal(historyFor(history,2)[0].resultUnchangedFromEvent,1);assert.equal(JSON.stringify(history),before);assert.equal(projected[4].answers.a,'Keep original price');
});
test('main local SDK session receives deltas, preserves answers and reattaches full context on errors/model/env changes',async t=>{
 const directory=await temp(t),inputs=[],threads=[];let fail=false;
 class Codex{startThread(options){let turns=0;const thread={options,run:async input=>{inputs.push(input);if(fail){fail=false;throw Error('connection failed');}turns++;return {finalResponse:JSON.stringify(step()),usage:{input_tokens:50*turns,cached_input_tokens:30*turns,output_tokens:5*turns}};}};threads.push(thread);return thread;}}
 const settings={get:async()=>({mode:'local',executable:'C:/codex.exe',localModel:'gpt-6.1-sol'})},task={request:'Original request with complete copy',files:[],history:[],visuals:['data:image/png;base64,aGVsbG8=']};
 const runTask=(r,c,d)=>runStructuredTask(r,c,{...d,validateExecutable:async()=>{},loadSdk:async()=>({Codex})});
 const run=env=>thinkAgent(task,{prompt:promptFor(task),schema:{}},{directory,settings,runTask,env:env||{Path:'fixed'}});
 const text=input=>typeof input==='string'?input:input.find(i=>i.type==='text').text;
 await run();task.history.push({type:'user_supplement',text:'New constraint'},{type:'user_answer',answers:{language:'English'}});await run();
 assert.equal(threads.length,1);assert.equal(inputs[0].filter(i=>i.type==='local_image').length,1);assert.equal(typeof inputs[1],'string');assert.match(text(inputs[1]),/New constraint/);assert.match(text(inputs[1]),/English/);assert.doesNotMatch(text(inputs[1]),/Original request with complete copy/);assert.equal(task.performance.resumedTurns,1);
 task.visuals=['data:image/png;base64,bmV3'];await run();assert.equal(inputs.at(-1).filter(i=>i.type==='local_image').length,1);
 fail=true;await assert.rejects(run(),/连接失败/);await run();assert.equal(threads.length,2);assert.match(text(inputs.at(-1)),/Original request with complete copy/);assert.match(text(inputs.at(-1)),/New constraint/);assert.match(text(inputs.at(-1)),/English/);
 task.model='other-selected-model';await run();assert.equal(threads.length,3);assert.equal(threads.at(-1).options.model,'other-selected-model');await run({Path:'changed'});assert.equal(threads.length,4);
 assert.equal(task.performance.calls,7);assert.equal(task.performance.failedCalls,1);assert.equal(task.performance.usageReportedCalls,6);assert.equal(task.performance.inputTokens,300);assert.equal(task.performance.cachedInputTokens,180);
});
test('SDK fresh executable fallback gets full original context, never only incremental input',async()=>{
 const received=[],session={thread:{run:()=>assert.fail('different key')},key:'old',fullInput:[{type:'text',text:'Complete original task and answers'}]};
 class Codex{constructor(options){this.exe=options.codexPathOverride;}startThread(){return {run:async input=>{received.push(input);if(this.exe==='C:/denied/codex.exe')throw Object.assign(Error('spawn EPERM'),{code:'EPERM',syscall:'spawn'});return {finalResponse:'{}'};}};}}
 await runStructuredTask({}, {mode:'local',executable:'C:/denied/codex.exe'}, {localSession:session,workingDirectory:'C:/empty',env:{},validateExecutable:async()=>{},loadSdk:async()=>({Codex}),discoverExecutables:async()=>({candidates:['C:/native/codex.exe']}),buildPrompt:()=> 'delta only',parseOutput:JSON.parse});
 assert.equal(received.length,2);assert.ok(received.every(input=>input[0].text==='Complete original task and answers'));
});
test('usage distinguishes reported cache tokens, unknown usage, nested calls and reused work',()=>{
 const task={};recordMetrics(task,{taskName:'nested',usage:{input_tokens:100,cached_input_tokens:70,output_tokens:10}});recordMetrics(task,{taskName:'main'});recordMetrics(task,{reused:true});assert.equal(task.performance.calls,2);assert.equal(task.performance.usageReportedCalls,1);assert.equal(task.performance.cachedInputTokens,70);assert.equal(task.performance.inputTokens,100);assert.equal(task.performance.reusedOperations,1);assert.equal(task.performance.phases.nested,1);
});
test('native export is reused only after source and output hash validation, isolated per task and directory',async t=>{
 const dir=await temp(t),source=path.join(dir,'original.ai'),output=path.join(dir,'copy.ai');await fs.writeFile(source,'source');let writes=0;
 const run=createExportCache(async()=>{writes++;await fs.writeFile(output,'saved-'+writes);return {saved:1,failed:0,results:[{output}]};});const task={},plan={createdAt:'first',files:[{path:source,fingerprint:await hashFile(source)}]};
 await run(task,plan,dir);assert.equal((await run(task,{...plan,createdAt:'second'},dir)).reused,true);assert.equal(writes,1);
 await fs.writeFile(output,'manual output change');assert.equal((await run(task,plan,dir)).reused,undefined);assert.equal(writes,2);await run({},plan,dir);assert.equal(writes,3);
 await fs.writeFile(source,'different source');await assert.rejects(run(task,plan,dir),/源文件已变化/);assert.equal(writes,3);
});
test('partial and uncertain native saves are never reused',async t=>{
 const dir=await temp(t);for(const result of [{saved:1,failed:1},{saved:1,failed:0,uncertain:true}]){let count=0;const run=createExportCache(async()=>{count++;return result;}),task={};await run(task,{files:[]},dir);await run(task,{files:[]},dir);assert.equal(count,2);}
});
test('no-op mutations preserve current image evidence and batch failures recover individually',async()=>{
 let n=0;const a=new AgentTask({think:async()=>[step('preview'),step('import_document'),step('read_batch'),step('read_document',{fileId:'missing'}),step()][n++],execute:async tool=>tool==='preview'?{images:['current'],evidence:[{stage:'current'}]}:tool==='import_document'?{reused:true}:tool==='read_batch'?{items:[{tool:'read_document',arguments:{fileId:'missing'},error:'Unavailable'}],failed:1}:{text:'Recovered'}});a.start({request:'Keep original instructions'});await a.runPromise;assert.equal(a.current.status,'completed');assert.deepEqual(a.current.visuals,['current']);assert.equal(a.current.performance.reusedOperations,1);assert.ok(a.current.history.some(h=>h.result?.items?.[0].error==='Unavailable'));
});
test('coalesced persistence retains complete final history and latest progress',async t=>{
 const directory=await temp(t);let finish;const waiting=new Promise(r=>finish=r),a=new AgentTask({directory,think:async()=>{await waiting;return step();},execute:async()=>{}});a.start({request:'Original'});await new Promise(r=>setImmediate(r));for(let i=0;i<250;i++)a.progress({label:'Step '+i,current:i,total:250});a.add('user_supplement',{text:'Keep full copy'});finish();await a.runPromise;const saved=JSON.parse(await fs.readFile(path.join(directory,a.current.id+'.json'),'utf8'));assert.equal(saved.status,'completed');assert.equal(saved.history[0].text,'Keep full copy');assert.equal(saved.progress.current,249);assert.equal(saved.eventVersion,a.current.eventVersion);
});
