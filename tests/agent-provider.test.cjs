const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {thinkAgent}=require('../services/agent-provider.cjs'),{listLocalModels}=require('../services/agent-models.cjs');
const settings={get:async()=>({mode:'api',executable:'C:/codex.exe',localModel:'local-default',apiModel:'api-model',apiKey:'private-api-key'}),credentials:()=>assert.fail('Assistant must never request API credentials')};
test('main assistant reads live workflow rules on every step without requiring a matching artwork case',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'agent-live-knowledge-')),knowledgeDirectory=path.join(directory,'library');t.after(()=>fs.rm(directory,{recursive:true,force:true}));await fs.mkdir(knowledgeDirectory);
 const base=require('../services/localization-knowledge.json');
 for(const revision of [base.revision+1,base.revision+2]){
  await fs.writeFile(path.join(knowledgeDirectory,'live.json'),JSON.stringify({...base,revision,rules:[{...base.rules[0],recognize:'Current live rule '+revision}]}));
  await thinkAgent({},{prompt:'Retain original request',schema:{}},{directory,knowledgeDirectory,settings,fetch:()=>assert.fail('No API'),runTask:async(_,credentials,deps)=>{
   const p=deps.buildPrompt();assert.equal(credentials.mode,'local');assert.ok(p.includes('Current live rule '+revision));assert.ok(p.includes('"revision":'+revision));assert.ok(p.includes('未命中带图案例'));assert.ok(p.includes('不默认删除原有图案'));assert.ok(p.includes('Retain original request'));assert.ok(p.includes(require('../services/design-page-audit.cjs').interferencePolicy));return {matches:{kind:'complete'}};
  }});
 }
});
test('assistant selects local Codex even when general settings use API; passes complete history and image files',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'local-assistant-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const controller=new AbortController(),value={kind:'complete',message:'done',tool:'',arguments:'{}',questions:[]};
 const result=await thinkAgent({model:'selected-local',visuals:['data:image/png;base64,aGVsbG8=']},{signal:controller.signal,prompt:'Original request and supplement and full history',schema:{type:'object'}},{directory,settings,fetch:()=>assert.fail('No API'),runTask:async(_,c,d)=>{assert.deepEqual(c,{mode:'local',executable:'C:/codex.exe',localModel:'selected-local',model:'local-default'});assert.equal(d.signal,controller.signal);assert.match(d.buildPrompt(),/Original request and supplement and full history/);assert.equal(d.localImagePaths.length,1);assert.equal(await fs.readFile(d.localImagePaths[0],'utf8'),'hello');assert.ok(!JSON.stringify(c).includes('private-api-key'));return {matches:d.parseOutput(JSON.stringify(value))};}});assert.deepEqual(result,value);
});
test('local malformed planning retries boundedly without repeating software writes or switching provider',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'local-format-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 for(const recover of [true,false]){let calls=0;const value={kind:'tool',message:'read',tool:'workspace',arguments:'{}',questions:[]};const job=thinkAgent({},{prompt:'Original and preserved edits',schema:{type:'object'}},{directory,settings,runTask:async(_,c,d)=>{calls++;assert.equal(c.mode,'local');assert.match(d.buildPrompt(),/Original and preserved edits/);if(calls===2)assert.match(d.buildPrompt(),/没有执行/);return {matches:d.parseOutput(recover&&calls===2?JSON.stringify(value):'plain prose')};}});if(recover)assert.deepEqual(await job,value);else await assert.rejects(job,/本次未执行任何软件操作/);assert.equal(calls,2);}
});
test('local connection errors never retry or fall back to API',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'local-offline-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));let calls=0;
 await assert.rejects(thinkAgent({},{prompt:'Original',schema:{}},{directory,settings,fetch:()=>assert.fail('No API'),runTask:async(_,c)=>{calls++;assert.equal(c.mode,'local');throw Error('local offline');}}),/local offline/);assert.equal(calls,1);
});
test('local main assistant sees named reference and current images together in a stable order',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'local-images-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 await thinkAgent({referenceVisuals:[{fileId:'ref-a',name:'human.jpg',image:'data:image/jpeg;base64,aHVtYW4='}],visuals:['data:image/png;base64,Y3VycmVudA=='],currentVisualEvidence:[{stage:'current',crop:[0,0,100,200]}]},{prompt:'Compare',schema:{}},{directory,settings,runTask:async(_,c,d)=>{assert.equal(c.mode,'local');assert.equal(d.localImagePaths.length,2);assert.equal(await fs.readFile(d.localImagePaths[0],'utf8'),'human');assert.equal(await fs.readFile(d.localImagePaths[1],'utf8'),'current');assert.match(d.buildPrompt(),/human.jpg/);assert.match(d.buildPrompt(),/user-reference/);return {matches:{kind:'complete'}};}});
});
test('local discovery initializes app server and lists models without shell or API credentials',async()=>{
 const messages=[];let spawned;
 const result=await listLocalModels({executable:'C:/codex.exe'},{validate:async()=>{},env:{Path:'test',OPENAI_API_KEY:'secret'},spawnFn:(exe,args,opts)=>{spawned={exe,args,opts};const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{};child.stdin=new Writable({write(chunk,enc,cb){const msg=JSON.parse(chunk);messages.push(msg);if(msg.id===1)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:1,result:{}})+'\n'));if(msg.id===2)queueMicrotask(()=>child.stdout.write(JSON.stringify({id:2,result:{data:[{model:'a'},{model:'a'},{id:'b'}],nextCursor:null}})+'\n'));cb();}});return child;}});
 assert.deepEqual(result.models,['a','b']);assert.equal(spawned.opts.shell,false);assert.equal(spawned.opts.env.OPENAI_API_KEY,undefined);assert.deepEqual(spawned.args,['app-server']);assert.equal(messages.at(-1).method,'model/list');
});

test('production provider forwards native user questions and tool execution together',async()=>{const runTool=async()=>{},askUser=async()=>({answers:{}});const result=await thinkAgent({request:'Original'},{runTool,askUser},{nativeThink:async(task,deps)=>{assert.equal(deps.runTool,runTool);assert.equal(deps.askUser,askUser);return {kind:'complete'};}});assert.equal(result.kind,'complete');});
