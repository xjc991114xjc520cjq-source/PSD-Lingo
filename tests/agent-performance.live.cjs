// Opt-in real local Codex protocol acceptance. Software operations are isolated
// fixtures; no Adobe process, customer document, or user application is touched.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {AgentTask}=require('../services/agent-task.cjs'),{thinkNative,closeNativeTask}=require('../services/agent-native-provider.cjs'),{runStructuredTask}=require('../services/ai-match.cjs');
if(process.env.SPARKIT_PERFORMANCE_LIVE!=='1')throw Error('Set SPARKIT_PERFORMANCE_LIVE=1 for local Codex acceptance');
(async()=>{
 const directory='D:/PSD-Lingo/work/assistant-performance-live',executable=(await require('../services/codex-discovery.cjs').discoverCodex()).path;
 await fs.mkdir(directory,{recursive:true});const settings={get:async()=>({mode:'local',executable,localModel:'gpt-6.1-sol'})};
 const skills=require('../services/design-review-plugins.cjs').loadReviewPlugins(),skill=require('../services/design-skill.cjs').loadDesignSkill();
 const shared=require('../services/design-skill.cjs').skillPrompt({designSkill:skill})+require('../services/design-review-plugins.cjs').reviewPluginPrompt(skills)+'\n仅用于协议验收的共同规范识别码：joint-review-7319。';
 const image='data:image/png;base64,'+(await fs.readFile(path.join(__dirname,'../renderer/assets/demo-preview.png'))).toString('base64');
 let operations=0,analyses=0,validations=0;const calls=[],answers=[];
 const a=new AgentTask({directory,think:(task,deps)=>thinkNative(task,deps,{settings,env:process.env,directory:directory+'/context'}),execute:async(tool,args,{task})=>{
  calls.push(tool);if(tool==='read_batch'||tool==='workspace')return {fixture:true,note:'Only design_layout is needed once; no artwork mutation or export.'};
  if(tool!=='design_layout')throw Error('Read-only protocol fixture only');operations++;
  for(const phase of ['plan','review']){
   analyses++;const result=await runStructuredTask({}, {mode:'local'},{localAnalysis:q=>task.analysisExchange.ask(q),analysisInstructions:shared,taskName:phase,images:[image],
    outputSchema:{type:'object',additionalProperties:false,properties:{marker:{type:'string'},description:{type:'string'}},required:['marker','description']},
    buildPrompt:()=>`只读协议验收阶段${phase}，不是海报改稿。请从共同规范读取识别码到marker，并简述实际附图的可见构图到description。必须查看图像，不能声称完成制作或独立第三方审阅。本夹具会在首次回答注入一次校验失败，用于验证原阶段重交而不是重跑。`,
    parseOutput:raw=>{const v=JSON.parse(raw);assert.equal(v.marker,'joint-review-7319');assert.ok(v.description?.length>5);if(validations++===0)throw Error('夹具注入一次回答校验失败；保留当前分析与图片，以相同id重新提交完整JSON');return v;},fetch:()=>assert.fail('No API'),loadSdk:()=>assert.fail('No nested SDK')});answers.push(result.matches);
  }return {fixture:true,accepted:0,protocolVerified:true,note:'Read-only protocol acceptance; no artwork generated'};
 }});
 try{a.start({request:'只读本机Codex通信验收。调用一次design_layout，亲自回答软件的两个阶段和可能的analysisCorrection，使用同一analysisId重交。禁止重启design_layout。最后workspace核对并结束，注明没有改稿或导出。',model:'gpt-6.1-sol'});await a.runPromise;
  assert.equal(a.current.status,'completed',a.current.error);assert.equal(operations,1);assert.equal(analyses,2);assert.equal(answers.length,2);assert.equal(a.current.performance.analysisCorrections,1);assert.equal(a.current.performance.nativeTurns,1);
  const verified={passed:true,operations,analyses,answers,calls,performance:a.current.performance,sharedInstructionBytes:Buffer.byteLength(shared),scope:'Real local Codex + actual demo image, injected validation error, software fixture, no Adobe'};await fs.writeFile(directory+'/verified.json',JSON.stringify(verified,null,2));console.log(JSON.stringify(verified));
 }finally{closeNativeTask(a.current);}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
