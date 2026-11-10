const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events');
const {createLearningBackground}=require('../services/learning-background.cjs');
test('hung learning is bounded and never holds an export result; later jobs complete independently',async()=>{
 const events=[],background=createLearningBackground({notify:e=>events.push(e),limit:2});
 const first=background.start(()=>new Promise(()=>{}));assert.equal(first.pending,true);
 const second=background.start(async()=>({operationComplete:true}));assert.equal(second.pending,true);assert.equal(background.start(()=>{}).skipped,true);
 for(let i=0;i<5;i++)await Promise.resolve();assert.equal(events.length,1);assert.equal(events[0].taskId,second.taskId);assert.equal(events[0].outcome.operationComplete,true);assert.equal(background.pending,1);
});
test('failed learning and failed notification are isolated without unhandled rejection',async()=>{
 const events=[],background=createLearningBackground({notify:e=>{events.push(e);throw Error('window closed');}});
 background.start(()=>{throw Error('disk unavailable');});for(let i=0;i<5;i++)await Promise.resolve();assert.equal(background.pending,0);assert.match(events[0].outcome.error,/不影响已生成文件/);
});
function mainFixture(finalize){
 const root=path.resolve(__dirname,'..'),results=[{file:'source.psd',output:'D:/out/source.psd'}],writes=[];
 const mocks={electron:{app:{isPackaged:false,getPath:()=> 'D:/mock-data',whenReady:()=>({then(){}}),on(){}},ipcMain:{on(){},handle(){}}},'node:fs/promises':{mkdir:async()=>{},writeFile:async(file)=>writes.push(file),readFile:async()=>JSON.stringify(results)},'node:child_process':{spawn(){const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();process.nextTick(()=>child.emit('close',0));return child;}},'./services/authorization.cjs':{helper:async()=>{}},'./services/layout-learning-pipeline.cjs':{createLearningPipeline:()=>({finalize}),verifyPsdOutput:async()=>true}};
 const context={require:n=>Object.hasOwn(mocks,n)?mocks[n]:require(n.startsWith('.')?path.resolve(root,n):n),module:{exports:{}},__dirname:root,process,Buffer,structuredClone,console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'main.cjs'),'utf8')+'\nprotectedAction=()=>{};checkPlan=async p=>validatePlan(p);module.exports={runPhotoshop,getBusy:()=>psBusy};',context);
 const record={id:'r',target:'Approved words',digest:require('../core.cjs').hash('Approved words')},plan={version:1,records:[record],files:[{name:'source.psd',path:'D:/source.psd',fingerprint:'source',jobs:[{layerId:1,recordId:'r',target:record.target,font:'ArialMT',original:'原稿',size:30,minSize:20,box:[10,10,300,60]}]}]};
 return {api:context.module.exports,plan,writes};
}
test('real Photoshop export handler returns saved files and releases busy lock while learning never resolves',async()=>{
 const f=mainFixture(()=>new Promise(()=>{}));const first=await f.api.runPhotoshop(f.plan,'D:/out');assert.equal(first.saved,1);assert.equal(first.failed,0);assert.equal(first.learning.pending,true);assert.equal(f.api.getBusy(),false);
 const second=await f.api.runPhotoshop(f.plan,'D:/out2');assert.equal(second.saved,1);assert.equal(f.api.getBusy(),false);assert.equal(f.writes.length,4);
});
test('learning storage failure cannot turn successful PSD generation into an export error',async()=>{
 const f=mainFixture(async()=>{throw Error('database unavailable');});const result=await f.api.runPhotoshop(f.plan,'D:/out');assert.equal(result.saved,1);assert.equal(result.failed,0);assert.equal(f.api.getBusy(),false);
});
