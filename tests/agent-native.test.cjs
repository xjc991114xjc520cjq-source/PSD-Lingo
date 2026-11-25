const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {AnalysisExchange}=require('../services/agent-analysis-exchange.cjs'),{CodexAppSession}=require('../services/codex-app-session.cjs');
const {thinkNative,closeNativeTask}=require('../services/agent-native-provider.cjs'),{AgentTask}=require('../services/agent-task.cjs'),{runStructuredTask}=require('../services/ai-match.cjs');
const tick=()=>new Promise(r=>setImmediate(r));
const complete={kind:'complete',message:'Fixture checked',tool:'',arguments:'{}',questions:[]};
async function fixture(t,script,execute,nativeOptions={}){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'native-task-'));let session,starts=0,resumes=0,tools=0,steers=0;
 const a=new AgentTask({directory,execute:execute||(async()=>({checked:true})),think:(task,deps)=>thinkNative(task,deps,{directory:directory+'/context',settings:{get:async()=>({mode:'local',executable:'C:/codex.exe',localModel:'selected-local'})},env:{Path:'test',OPENAI_API_KEY:'must-not-use'},validate:async()=>{},createSession:options=>{starts++;let threadId='thread-'+starts;session={closed:false,queue:Promise.resolve(),initialize:async()=>{},close(){this.closed=true;options.onEvent('transport/closed',{error:Error('closed')});},request:async(method,params)=>{if(method==='config/read')return {config:{mcp_servers:{unrelated:{}}}};if(method==='thread/start'){assert.equal(params.model,task.model||'selected-local');assert.equal(params.config['mcp_servers.unrelated.enabled'],false);assert.equal(params.allowProviderModelFallback,false);assert.equal(params.dynamicTools.length,2);return {thread:{id:threadId}};}if(method==='thread/resume'){resumes++;if(nativeOptions.resumeError)throw Error(nativeOptions.resumeError);threadId=params.threadId;return {thread:{id:threadId}};}if(method==='turn/start'){assert.equal(params.effort,'high');queueMicrotask(async()=>{try{const call=async(tool,args)=>{tools++;return options.onRequest('item/tool/call',{threadId,turnId:'turn',tool,arguments:args});};await script({call,task,deps,params,options});if(!session.closed){options.onEvent('thread/tokenUsage/updated',{threadId,tokenUsage:{total:{inputTokens:100,cachedInputTokens:60,outputTokens:10}}});options.onEvent('item/completed',{threadId,item:{type:'agentMessage',text:JSON.stringify(complete)}});options.onEvent('turn/completed',{threadId,turn:{id:'turn',status:'completed'}});}}catch(error){options.onEvent('transport/closed',{error});}});return {turn:{id:'turn'}};}if(method==='turn/steer'){steers++;assert.equal(params.expectedTurnId,'turn');assert.ok(params.input.some(i=>i.type==='image')||params.input[0].text.startsWith('软件分析完整资料'));session.lastText=params.input[0].text;session.lastImages=params.input.filter(i=>i.type==='image').map(i=>i.url);return {turnId:'turn'};}if(method==='turn/interrupt')return {};throw Error(method);}};return session;},...nativeOptions})});
 t.after(async()=>{closeNativeTask(a.current);await a.pending;await fs.rm(directory,{recursive:true,force:true});});return {a,get starts(){return starts;},get resumes(){return resumes;},get tools(){return tools;},get steers(){return steers;},get lastText(){return session.lastText;},get lastImages(){return session.lastImages;}};}
const ops=(tool,args={})=>({operations:[{tool,arguments:JSON.stringify(args),message:tool}]});

test('missing persisted native thread falls back to exact ledger without dropping previous results',async t=>{
 let turns=0;const f=await fixture(t,async({call,params})=>{if(turns++===0)await call('software_operations',ops('workspace'));else{assert.match(params.input[0].text,/retained analysis data/);assert.match(params.input[0].text,/Original requirement/);}},async()=>({analysis:'retained analysis data'}),{resumeError:'no rollout found'});
 f.a.start({request:'Original requirement'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;closeNativeTask(f.a.current);f.a.followUp('Continue');await f.a.runPromise;assert.equal(f.a.current.status,'completed');assert.equal(f.resumes,1);assert.ok(f.a.current.history.some(h=>h.type==='native_session_fallback'));
});

test('closed transport resumes persisted native thread and sends only new events',async t=>{
 let turns=0;
 const f=await fixture(t,async({call,params})=>{if(turns++===0)await call('software_operations',ops('workspace'));else{assert.match(params.input[0].text,/新的要求/);assert.ok(!params.input[0].text.includes('已交付的庞大结构'));}},async()=>({structure:'已交付的庞大结构'}));
 f.a.start({request:'Original scope'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;const receipt=structuredClone(f.a.public().nativeSession);assert.ok(receipt.threadId);assert.ok(receipt.cursor>0);closeNativeTask(f.a.current);f.a.followUp('新的要求：继续剩余工作');await f.a.runPromise;
 assert.equal(f.resumes,1);assert.equal(f.a.current.nativeSession.threadId,receipt.threadId);assert.equal(f.a.current.status,'completed',f.a.current.error);assert.ok(f.a.current.history.some(h=>h.type==='native_session_resumed'));
});

test('pause retains native analysis, exact pending question and batched operations in one session',async t=>{
 let entered,release;const ready=new Promise(r=>entered=r),hold=new Promise(r=>release=r);let writes=0;
 const f=await fixture(t,async({call})=>{await call('software_operations',{operations:[...ops('workspace').operations,...ops('attachments').operations]});},async tool=>{if(tool==='workspace'){entered();await hold;}else writes++;return {checked:true};});
 f.a.start({request:'Pause safely'});f.a.current.history.push({type:'fixture'});await ready;f.a.pause();release();await tick();await tick();assert.equal(writes,0);assert.equal(f.starts,1);assert.equal(f.a.current.status,'paused');f.a.resume();await f.a.runPromise;assert.equal(writes,1);assert.equal(f.starts,1);assert.equal(f.a.current.status,'completed');
});

test('pause while awaiting image analysis keeps candidate operation and original analysis id',async t=>{
 let entered,proceed;const ready=new Promise(r=>entered=r),hold=new Promise(r=>proceed=r);let runs=0,applied=0;
 const f=await fixture(t,async({call})=>{const r=JSON.parse((await call('software_operations',ops('design_layout'))).contentItems[0].text);entered();await hold;await call('submit_analysis',{analysisId:r.analysisRequired.id,answer:'{}'});},async(_tool,_args,{task})=>{runs++;await task.analysisExchange.ask({prompt:'Keep measured candidate'});applied++;return {accepted:true};});
 f.a.start({request:'Pause image analysis'});f.a.current.history.push({type:'fixture'});await ready;f.a.pause();proceed();await tick();assert.equal(applied,0);f.a.resume();await f.a.runPromise;assert.equal(runs,1);assert.equal(applied,1);assert.equal(f.starts,1);assert.equal(f.a.current.status,'completed');
});

test('restored large history can preview and export through native tools without replaying confirmed edits',async t=>{
 const history=[{type:'user_supplement',text:'Keep all approved prices'},{type:'user_answer',answers:{scope:'Nine boards'}},{type:'tool_start',tool:'configure_product_template',args:{fileIndex:0}},{type:'tool_result',tool:'configure_product_template',result:{changed:true,fileIndex:0}},{type:'tool_start',tool:'preview',args:{fileIndex:0}},{type:'tool_error',tool:'preview',error:'Old progress write error'},{type:'tool_result',tool:'workspace',result:{retainedPlan:'x'.repeat(740000)}}];const executed=[];
 const f=await fixture(t,async({call,params})=>{assert.ok(params.input[0].text.includes('Keep all approved prices'));assert.ok(params.input[0].text.includes('Nine boards'));assert.ok(params.input[0].text.length>650000);assert.equal((await call('software_operations',ops('preview',{fileIndex:0}))).success,true);assert.equal((await call('software_operations',ops('export_files'))).success,true);},async tool=>{executed.push(tool);return tool==='export_files'?{saved:1,failed:0,qualityPassed:true}:{fileIndex:0};});
 f.a.restoreContinuation({id:'large-old',mode:'local',status:'failed',request:'Finish existing plan',history,step:119,runSteps:120,files:[]});f.a.followUp('Continue remaining work');await f.a.runPromise;assert.equal(f.a.current.status,'completed',f.a.current.error);assert.deepEqual(executed,['preview','export_files']);assert.equal(f.a.current.runSteps,2);assert.equal(f.a.current.history.filter(h=>h.type==='tool_error').length,1);assert.equal(history.length,7);
});

test('large analysis answer is retained and applied after large history',async t=>{
 const answer=JSON.stringify({evidence:'a'.repeat(660000)});let applied=false;
 const f=await fixture(t,async({call})=>{const r=JSON.parse((await call('software_operations',ops('design_layout'))).contentItems[0].text);assert.equal((await call('submit_analysis',{analysisId:r.analysisRequired.id,answer})).success,true);},async(tool,args,{task})=>{const raw=await task.analysisExchange.ask({prompt:'Complete original analysis',outputSchema:{}});assert.equal(raw,answer);applied=true;return {checked:true};});f.a.start({request:'Keep analysis'});f.a.current.history.push({type:'user_supplement',text:'b'.repeat(660000)});await f.a.runPromise;assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(applied,true);assert.equal(f.a.current.history.find(h=>h.type==='analysis_answer').answer,answer);
});

test('native operation checkpoint pauses without discarding its session and resumes without replay',async t=>{
 let executed=0;const f=await fixture(t,async({call})=>{for(let i=0;i<121;i++)await call('software_operations',ops('workspace'));},async()=>{executed++;return {checked:true};});f.a.start({request:'Preserve original work'});f.a.current.history.push({type:'fixture'});
 for(let i=0;i<200&&f.a.current.status!=='paused';i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.a.current.status,'paused');assert.equal(executed,120);assert.equal(f.starts,1);const count=f.a.current.history.length;f.a.resume();await f.a.runPromise;assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(executed,121);assert.equal(f.starts,1);assert.equal(f.a.current.runSteps,1);assert.ok(f.a.current.history.length>count);assert.ok(f.a.current.history.some(h=>h.type==='operation_budget_checkpoint'));
});

test('large analysis reaches native input intact once, keeping tool receipt small and the same turn',async t=>{
 const prompt='Approved context '+ '完整设计证据'.repeat(9000)+' END-OF-CONTEXT';let executions=0;
 const f=await fixture(t,async({call,options,task})=>{
  // Observe the actual app-server steer payload, before answering the tool.
  const r=JSON.parse((await call('software_operations',ops('design_layout'))).contentItems[0].text);
  assert.ok(r.analysisRequired.contextDelivery);assert.equal(r.analysisRequired.prompt,undefined);assert.ok(JSON.stringify(r).length<4000);
  assert.equal(task.analysisExchange.pending.request.prompt,prompt);
  const result=await call('submit_analysis',{analysisId:r.analysisRequired.id,answer:'{}'});assert.equal(JSON.parse(result.contentItems[0].text).operationResult.accepted,1);
 },async(_tool,_args,{task})=>{executions++;await runStructuredTask({}, {mode:'local'},{outputSchema:{type:'object'},buildPrompt:()=>prompt,localAnalysis:r=>task.analysisExchange.ask(r),parseOutput:JSON.parse});return {accepted:1};});
 // Use the fixture's normal transport; its steer captures/validates text-only delivery.
 f.a.start({request:'Preserve original task'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(executions,1);assert.equal(f.steers,1);assert.equal(f.starts,1);assert.equal(f.a.current.performance.nativeTurns,1);const delivered=f.lastText.split('\n')[1];assert.equal(JSON.parse(delivered).analysisRequired.prompt,prompt);
});

test('terminal analysis failure records the final reason and releases the stale analysis gate',async t=>{
 const f=await fixture(t,async({call,task})=>{
  const first=JSON.parse((await call('software_operations',ops('design_layout'))).contentItems[0].text);
  for(let i=0;i<3;i++)await call('submit_analysis',{analysisId:first.analysisRequired.id,answer:'{}'});
  const last=task.history.filter(h=>h.type==='analysis_answer').at(-1);assert.match(last.validationError,/Missing evidence/);assert.equal(task.analysisExchange,null);
  const r=await call('software_operations',ops('workspace'));assert.ok(!r.contentItems[0].text.includes('请先submit_analysis'));
 },async(tool,_args,{task})=>{if(tool==='workspace')return {checked:true};await task.analysisExchange.ask({validateAnswer:()=>{throw Error('Missing evidence');}});});
 f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(f.a.current.status,'failed');assert.equal(f.a.current.history.filter(h=>h.type==='analysis_answer').length,3);
});

test('large document/workspace results use the same lossless delivery without replaying the read',async t=>{
 const payload={rows:Array.from({length:500},(_,i)=>({id:i,value:'Approved data '+i+' 内容'.repeat(20)})),end:'LAST-ROW-RETAINED'};let reads=0;
 const f=await fixture(t,async({call})=>{const r=JSON.parse((await call('software_operations',ops('workspace'))).contentItems[0].text);assert.ok(r.contextDelivery);assert.equal(r.analysisRequired,undefined);assert.ok(JSON.stringify(r).length<1000);},async()=>{reads++;return payload;});
 f.a.start({request:'Read once'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(reads,1);assert.equal(f.steers,1);const delivered=JSON.parse(f.lastText.split('\n')[1]);assert.deepEqual(delivered.items[0].result,payload);
});

test('invalid design plan and review are corrected in-place without replaying renders or dropping skill rejection',async t=>{
 let runs=0,renders=0,applied=0;
 const composition=require('../services/design-composition.cjs'),{validateReview}=require('../services/design-visual-review.cjs');
 const group={id:'title'},request={pendingGroups:[group],designReviewSources:[{id:'graphic',required:true}]};
 const goodPlan={compositionPlan:[{groupId:'title',alternatives:[{approach:'Stack',consequence:'Clear hierarchy'},{approach:'Inline',consequence:'Wider group'}],chosen:0,reason:'Preserve hierarchy'}]};
 const review={groups:[{id:'title',verdict:'accept',reason:'Actual render'}],skillReviews:[{id:'graphic',verdict:'revise',evidence:'Title too wide'}]};
 const f=await fixture(t,async({call})=>{
  let r=JSON.parse((await call('software_operations',ops('design_layout'))).contentItems[0].text),id=r.analysisRequired.id;
  for(const answer of ['{',JSON.stringify({compositionPlan:[]})]){r=JSON.parse((await call('submit_analysis',{analysisId:id,answer})).contentItems[0].text);assert.equal(r.analysisCorrection.id,id);assert.equal(r.completedStagesRetained,true);assert.equal(r.analysisRequired,undefined);assert.equal(renders,1);}
  r=JSON.parse((await call('submit_analysis',{analysisId:id,answer:JSON.stringify(goodPlan)})).contentItems[0].text);id=r.analysisRequired.id;assert.equal(renders,2);
  r=JSON.parse((await call('submit_analysis',{analysisId:id,answer:JSON.stringify({...review,groups:[]})})).contentItems[0].text);assert.match(r.analysisCorrection.error,/完整分组/);
  r=JSON.parse((await call('submit_analysis',{analysisId:id,answer:JSON.stringify(review)})).contentItems[0].text);assert.match(r.analysisCorrection.error,/插件审验未通过/);
  review.groups[0].verdict='revise';r=JSON.parse((await call('submit_analysis',{analysisId:id,answer:JSON.stringify(review)})).contentItems[0].text);assert.equal(r.operationResult.needsRepair,true);
 },async(_tool,_args,{task})=>{runs++;renders++;
  const ask=(taskName,parseOutput)=>runStructuredTask({}, {mode:'local'},{localAnalysis:r=>task.analysisExchange.ask(r),buildPrompt:()=> 'Use actual image and all checks',outputSchema:{},parseOutput,taskName});
  await ask('design_layout',raw=>composition.validatePlan(JSON.parse(raw).compositionPlan,[{relationGroup:'title'}]));renders++;
  const review=await ask('design_visual_review',raw=>validateReview(raw,request));if(review.matches.groups[0].verdict==='accept')applied++;
  return {needsRepair:review.matches.groups[0].verdict==='revise'};
 });f.a.start({request:'Keep all approved copy'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(runs,1);assert.equal(renders,2);assert.equal(applied,0);assert.equal(f.a.current.performance.analysisCorrections,4);assert.equal(f.a.current.history.filter(h=>h.type==='tool_error').length,0);
});

test('analysis correction limit fails closed; cancellation invalidates retained pending answer',async()=>{
 let applied=0;const make=()=>{const e=new AnalysisExchange(async()=>{await e.ask({validateAnswer:()=>{throw Error('Missing evidence');}});applied++;});return e;};
 const e=make(),id=(await e.next()).analysisRequired.id;for(let i=0;i<2;i++)assert.ok((await e.submit(id,'{}')).analysisCorrection);await assert.rejects(e.submit(id,'{}'),/连续3次/);assert.equal(e.finished,true);assert.equal(applied,0);
 const cancelled=make(),cid=(await cancelled.next()).analysisRequired.id;await cancelled.submit(cid,'{}');cancelled.cancel();await cancelled.done;await assert.rejects(cancelled.submit(cid,'{}'),/已变化/);assert.equal(applied,0);
});

test('shared skill instructions are sent once per exact content in one session and resent after model change',async t=>{
 let turns=0;const observed=[];
 const f=await fixture(t,async({call})=>{for(const shared of ['Complete joint skills','Complete joint skills','Updated joint skills']){const r=JSON.parse((await call('software_operations',ops('design_layout'))).contentItems[0].text);observed.push(r.analysisRequired.sharedInstructions);await call('submit_analysis',{analysisId:r.analysisRequired.id,answer:'{}'});}turns++;},async(_tool,_args,{task})=>{const n=observed.length%3;await runStructuredTask({}, {mode:'local'},{analysisInstructions:n===2?'Updated joint skills':'Complete joint skills',localAnalysis:r=>task.analysisExchange.ask(r),buildPrompt:()=> 'Current image and schema',outputSchema:{},parseOutput:JSON.parse});return {accepted:1};});
 f.a.start({request:'Inspect all design skills'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;f.a.current.model='changed';f.a.followUp('Keep original requirements');await f.a.runPromise;
 assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(observed.length,6,JSON.stringify(observed));for(let i=0;i<2;i++){assert.equal(observed[i*3].text,'Complete joint skills');assert.equal(observed[i*3+1].alreadyProvided,true);assert.equal(observed[i*3+1].text,undefined);assert.equal(observed[i*3+2].text,'Updated joint skills');}assert.equal(turns,2);
});
test('native transport initializes once, serializes concurrent tools, strips API credentials and closes pending calls',async()=>{
 let child,spawned;const sent=[];let active=0,max=0;const session=new CodexAppSession({executable:'C:/codex.exe',env:{OPENAI_API_KEY:'secret',HOME:'home'},onRequest:async()=>{active++;max=Math.max(max,active);await tick();active--;return {contentItems:[],success:true};},spawnFn:(exe,args,opts)=>{spawned={exe,args,opts};child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};child.stdin=new Writable({write(chunk,enc,cb){const v=JSON.parse(chunk);sent.push(v);if(v.method==='initialize')queueMicrotask(()=>child.stdout.write(JSON.stringify({id:v.id,result:{}})+'\n'));cb();}});return child;}});await session.initialize();assert.equal(spawned.opts.env.OPENAI_API_KEY,undefined);assert.equal(spawned.opts.shell,false);assert.equal(sent[0].params.capabilities.experimentalApi,true);
 child.stdout.write(JSON.stringify({id:55,method:'item/tool/call',params:{}})+'\n'+JSON.stringify({id:56,method:'item/tool/call',params:{}})+'\n');await tick();await session.queue;assert.equal(max,1);assert.equal(sent.filter(v=>v.result?.success).length,2);const pending=session.request('missing',{});session.close();await assert.rejects(pending,/会话结束/);
});
test('analysis exchange returns exact schema and images, rejects stale IDs and resumes the same operation',async()=>{
 let writes=0;const e=new AnalysisExchange(async()=>{const a=await e.ask({prompt:'Full approved copy',outputSchema:{type:'object'},images:['actual'],taskName:'review'});assert.equal(a,'{"approved":true}');writes++;return {saved:1};});const waiting=await e.next();assert.equal(waiting.images[0],'actual');await assert.rejects(e.submit('stale','{}'),/已变化/);assert.equal(writes,0);assert.equal((await e.submit(waiting.analysisRequired.id,'{"approved":true}')).operationResult.saved,1);assert.equal(writes,1);
});
test('cancelled exchange never applies a late answer',async()=>{let applied=false;const e=new AnalysisExchange(async()=>{await e.ask({prompt:'Review'});applied=true;});const r=await e.next();e.cancel();await e.done;assert.equal(applied,false);await assert.rejects(e.submit(r.analysisRequired.id,'{}'),/已变化/);});
test('bounded software sequence executes without another host planning call, stops remaining writes on failure',async t=>{
 const executed=[];const f=await fixture(t,async({call})=>{const r=await call('software_operations',{operations:[...ops('workspace').operations,...ops('bind_copy').operations,...ops('edit_text').operations]});const value=JSON.parse(r.contentItems[0].text);assert.equal(value.executed,2);assert.equal(value.remaining,1);},async tool=>{executed.push(tool);if(tool==='bind_copy')throw Error('Binding rejected');return {checked:true};});f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.deepEqual(executed,['workspace','bind_copy']);assert.equal(f.starts,1);assert.equal(f.a.current.performance.nativeTurns,1);assert.equal(f.a.current.status,'failed');assert.match(f.a.current.error,/Binding rejected/);
});
test('invalid mixed analysis sequence is rejected before any operation',async t=>{const f=await fixture(t,async({call})=>{const r=await call('software_operations',{operations:[...ops('bind_copy').operations,...ops('design_layout').operations]});assert.equal(r.success,false);},()=>assert.fail('No writes'));f.a.start({request:'Check'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.equal(f.a.current.history.filter(h=>h.type==='tool_start').length,0);});
test('nested planning and review both use owning Codex, with no SDK or API requests',async t=>{
 let phases=0;const f=await fixture(t,async({call})=>{let r=await call('software_operations',ops('design_layout'));for(const phase of ['design','review']){const data=JSON.parse(r.contentItems[0].text);assert.equal(data.analysisRequired.taskName,phase);assert.equal(r.contentItems.length,1);r=await call('submit_analysis',{analysisId:data.analysisRequired.id,answer:'{"preserve":"Approved"}'});}assert.equal(JSON.parse(r.contentItems[0].text).operationResult.accepted,1);},async(tool,args,{task})=>{for(const taskName of ['design','review']){const r=await runStructuredTask({}, {mode:'local'},{localAnalysis:request=>task.analysisExchange.ask(request),images:['data:image/png;base64,aGVsbG8='],buildPrompt:()=> 'Complete original and supplement',outputSchema:{type:'object'},parseOutput:raw=>{const r=JSON.parse(raw);assert.equal(r.preserve,'Approved');return r;},taskName,loadSdk:()=>assert.fail('No nested model'),fetch:()=>assert.fail('No API')});assert.equal(r.analysisOwner,'current-local-codex');phases++;}return {accepted:1};});f.a.start({request:'Keep approved copy'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(phases,2);assert.equal(f.starts,1);assert.equal(f.steers,2);assert.equal(f.a.current.history.filter(h=>h.type==='analysis_answer').length,2);assert.deepEqual(Object.keys(f.a.current.performance.phases),['codex_native_inference']);
});
test('native user questions map to overlay, require all answers and preserve supplement on interruption',async()=>{
 const a=new AgentTask(),controller=new AbortController();a.current={id:'t',status:'running',history:[],revision:0};const params={questions:[{id:'language',question:'Language?',options:[{label:'English'}]},{id:'scope',question:'Scope?',options:[]}]};const request=a.nativeQuestion(params,controller.signal);assert.equal(a.public().status,'waiting');assert.equal(a.public().question.items.length,2);assert.throws(()=>a.answer({questionId:a.current.question.id,answers:{language:'English'}}),/所有/);a.answer({questionId:a.current.question.id,answers:{language:'English',scope:'Only this page'}});assert.deepEqual(await request,{answers:{language:{answers:['English']},scope:{answers:['Only this page']}}});
 const second=a.nativeQuestion(params,controller.signal);controller.abort();await assert.rejects(second,/已中断/);assert.ok(a.current.question);assert.equal(a.current.history.filter(h=>h.type==='user_answer').length,1);
});

test('cancellation before analysis begins rejects future asks without hanging or writing',async()=>{let release,writes=0;const wait=new Promise(r=>release=r);const e=new AnalysisExchange(async()=>{await wait;await e.ask({prompt:'late'});writes++;});e.cancel();release();await e.done;assert.equal(writes,0);assert.match(e.error.message,/暂停/);});

test('supplement during analysis preserves original constraints and executes only the new answer',async t=>{let pass=0,applied=0;const f=await fixture(t,async({call,task,params})=>{if(pass++===0){await call('software_operations',ops('design_layout'));f.a.supplement('Keep original price and use English');return;}assert.ok(params.input[0].text.includes('Original requirement'));assert.ok(params.input[0].text.includes('Keep original price'));const r=await call('software_operations',ops('design_layout'));const id=JSON.parse(r.contentItems[0].text).analysisRequired.id;await call('submit_analysis',{analysisId:id,answer:'{}'});},async(tool,args,{task})=>{await task.analysisExchange.ask({prompt:'Review'});applied++;return {accepted:1};});f.a.start({request:'Original requirement'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.equal(applied,1);assert.equal(f.starts,2);assert.equal(f.a.current.status,'completed',f.a.current.error);});

test('stop during a started write waits for its result and never starts following operation',async t=>{let release,started;const began=new Promise(r=>started=r),wait=new Promise(r=>release=r),executed=[];const f=await fixture(t,async({call})=>{await call('software_operations',{operations:[...ops('bind_copy').operations,...ops('edit_text').operations]});},async tool=>{executed.push(tool);started();await wait;return {bound:1};});f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await began;f.a.stop();release();await f.a.runPromise;assert.deepEqual(executed,['bind_copy']);assert.equal(f.a.current.status,'stopped');assert.ok(f.a.current.history.some(h=>h.type==='tool_result'&&h.result.bound===1));});

test('uncertain started write remains failed even when stop was requested',async t=>{let release,started;const began=new Promise(r=>started=r),wait=new Promise(r=>release=r);const f=await fixture(t,async({call})=>call('software_operations',ops('export_files')),async()=>{started();await wait;throw Object.assign(Error('Native result uncertain'),{uncertain:true});});f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await began;f.a.stop();release();await f.a.runPromise;assert.equal(f.a.current.status,'failed');assert.match(f.a.current.error,/uncertain/);});

test('invalid and oversized analysis answers never pollute history, valid response can still finish',async t=>{const f=await fixture(t,async({call,task})=>{const r=await call('software_operations',ops('design_layout')),id=JSON.parse(r.contentItems[0].text).analysisRequired.id;for(const answer of [null,'x'.repeat(2000001)]){const bad=await call('submit_analysis',{analysisId:id,answer});assert.equal(bad.success,false);assert.equal(task.history.filter(h=>h.type==='analysis_answer').length,0);}await call('submit_analysis',{analysisId:id,answer:'{}'});},async(tool,args,{task})=>{await task.analysisExchange.ask({prompt:'review'});return {accepted:1};});f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(f.a.current.history.filter(h=>h.type==='analysis_answer').length,1);});

test('same-task follow-up uses one persistent process and sends only new events, not full task replay',async t=>{let turns=0;const f=await fixture(t,async({call,params})=>{if(turns++===0){assert.ok(params.input[0].text.includes('Initial approved requirements'));await call('software_operations',ops('workspace'));}else{assert.ok(params.input[0].text.includes('New scope'));assert.ok(!params.input[0].text.includes('工具目录：'));}},async()=>({checked:true}));f.a.start({request:'Initial approved requirements'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;f.a.followUp('New scope');await f.a.runPromise;assert.equal(f.starts,1);assert.equal(f.a.current.status,'completed');assert.equal(f.a.current.performance.nativeTurns,2);assert.equal(f.a.current.performance.inputTokens,100);});

test('new desktop thread is received after its first completed turn, without replay on follow-up',async t=>{
 let turns=0;const received=[];const f=await fixture(t,async()=>{turns++;assert.equal(received.length,turns===1?0:1);},undefined,{syncThread:async id=>{assert.equal(turns,1);received.push(id);}});
 f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.deepEqual(received,['thread-1']);
 f.a.followUp('Continue');await f.a.runPromise;assert.equal(f.starts,1);assert.equal(f.a.current.performance.nativeTurns,2);assert.equal(received.length,1);assert.equal(f.a.current.status,'completed');
});
test('desktop receipt failure retains completed software work and reports a separate warning',async t=>{
 const f=await fixture(t,async({call})=>call('software_operations',ops('edit_text')),async()=>({saved:true}),{syncThread:async()=>{throw Error('Protocol handler missing');}});
 f.a.start({request:'Original'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(f.a.current.status,'completed',f.a.current.error);assert.ok(f.a.current.history.some(h=>h.type==='tool_result'&&h.result.saved));assert.ok(f.a.current.history.some(h=>h.type==='desktop_sync_warning'&&h.message.includes('Protocol handler missing')));assert.equal(f.starts,1);
});

test('startup preparation gathers workspace and one workbook without model planning',async t=>{const executed=[];const f=await fixture(t,async({params})=>{assert.ok(params.input[0].text.includes('prepared-workspace'));},async(tool,args)=>{executed.push({tool,args});return {data:'prepared-workspace'};});f.a.start({request:'Original',files:[{id:'book',path:'D:/book.xlsx'}]});await f.a.runPromise;assert.equal(executed.length,1);assert.equal(executed[0].tool,'read_batch');assert.deepEqual(executed[0].args.queries.map(q=>q.tool),['workspace','read_document']);assert.equal(f.a.current.status,'completed',f.a.current.error);});


test('configured project is prepared before thread creation and returned assignment is mandatory',async t=>{
 for(const mismatch of [false,true]){let prepared=0,turns=0,threadParams;
 const f=await fixture(t,async()=>{},undefined,{prepareProject:async(_session,p)=>{prepared++;assert.equal(p.key,'configured');return {...p,directory:'D:/project/Example',projectId:'project-confirmed'};},createSession:options=>({closed:false,queue:Promise.resolve(),initialize:async()=>{},close(){this.closed=true;},request:async(method,p)=>{if(method==='config/read')return {config:{}};if(method==='thread/start'){assert.equal(prepared,1);threadParams=p;return {thread:{id:'project-thread',projectId:mismatch?'unassigned':'project-confirmed'}};}if(method==='turn/start'){turns++;queueMicrotask(()=>{options.onEvent('item/completed',{threadId:'project-thread',item:{type:'agentMessage',text:JSON.stringify(complete)}});options.onEvent('turn/completed',{threadId:'project-thread',turn:{status:'completed'}});});return {turn:{id:'t'}};}throw Error(method);}})});
 f.a.start({request:'Project task',codexProject:{name:'Example',key:'configured',parentDirectory:'D:/project'}});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(threadParams.cwd,'D:/project/Example');assert.equal(threadParams.projectId,'project-confirmed');assert.equal(turns,mismatch?0:1);assert.equal(f.a.current.status,mismatch?'failed':'completed');assert.equal(f.a.public().codexProject.projectId,'project-confirmed');
 }
});

test('native operation errors and selection requirements fail tool receipts and stop the rest of the batch',async t=>{
 for(const result of [{error:'Rejected'},{ok:false,message:'Rejected'},{selectionRequired:true},{qualityPassed:false},{failed:1}]){let executions=0;const f=await fixture(t,async({call})=>{const r=await call('software_operations',{operations:[...ops('workspace').operations,...ops('attachments').operations]});assert.equal(r.success,false);const data=JSON.parse(r.contentItems[0].text);assert.equal(data.executed,1);assert.equal(data.remaining,1);},async tool=>{if(tool==='read_batch')return {prepared:true};executions++;return result;});f.a.start({request:'Test actual failure envelope'});await f.a.runPromise;assert.equal(f.a.current.status,'failed');assert.equal(executions,1);}
});

test('native software batch continues past workbook overview without a false tool failure',async t=>{
 const executed=[];const f=await fixture(t,async({call})=>{const r=await call('software_operations',{operations:[...ops('read_document',{fileId:'workbook'}).operations,...ops('workspace').operations]});assert.equal(r.success,true);const value=JSON.parse(r.contentItems[0].text);assert.equal(value.executed,2);assert.equal(value.remaining,0);assert.equal(value.items[0].result.selectionRequired,true);},async tool=>{executed.push(tool);return tool==='read_document'?{format:'xlsx',selectionRequired:true,sheets:[{name:'Copy',rows:2}]}:{files:[]};});f.a.start({request:'Inspect workbook tabs and current workspace',mode:'local'});await f.a.runPromise;assert.equal(f.a.current.status,'completed');assert.deepEqual(executed,['read_batch','read_document','workspace']);assert.equal(f.starts,1);
});

test('each analysis carries whole-page pixels again beside new crops; duplicates only collapse within that delivery',async t=>{
 const full='data:image/png;base64,WHOLE',crop='data:image/png;base64,CROP';let phases=0;
 const f=await fixture(t,async({call})=>{let r=await call('software_operations',ops('design_layout'));let d=JSON.parse(r.contentItems[0].text);assert.deepEqual(f.lastImages,[full]);assert.equal(d.images[0].attachedInThisDelivery,true);r=await call('submit_analysis',{analysisId:d.analysisRequired.id,answer:'{}'});d=JSON.parse(r.contentItems[0].text);assert.deepEqual(f.lastImages,[full,crop]);assert.ok(d.images.every(i=>i.attachedInThisDelivery&&!i.alreadyProvided));await call('submit_analysis',{analysisId:d.analysisRequired.id,answer:'{}'});const preview=await call('software_operations',ops('preview',{fileIndex:0}));assert.deepEqual(f.lastImages,[full]);assert.ok(JSON.parse(preview.contentItems[0].text).items[0].result.images[0].attachedInThisDelivery);},async(tool,args,{task})=>{if(tool==='preview')return {images:[full]};for(const images of [[full],[full,crop,full]]){await task.analysisExchange.ask({prompt:'Full page plus details',images,outputSchema:{}});phases++;}return {checked:true};});f.a.start({request:'Inspect actual final full-page JPEG'});f.a.current.history.push({type:'fixture'});await f.a.runPromise;assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(phases,2);assert.equal(f.steers,3);assert.equal(f.starts,1);
});

test('embedded assistant keeps a directory-bound session without desktop sync',async t=>{
 let synced=0;const f=await fixture(t,async()=>{},undefined,{prepareProject:async()=>({name:'Embedded',key:'embed',directory:path.resolve('work/embedded-fixture'),binding:'embedded'}),syncThread:async()=>{synced++;}});
 f.a.start({request:'Embedded context',codexProject:{name:'Embedded',key:'embed'}});f.a.current.history.push({type:'fixture'});await f.a.runPromise;
 assert.equal(f.a.current.status,'completed',f.a.current.error);assert.equal(f.a.current.codexProject.binding,'embedded');assert.equal(synced,0);assert.ok(f.a.current.nativeSession.threadId);
});
