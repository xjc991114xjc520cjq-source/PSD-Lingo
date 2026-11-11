const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function harness(){
 const root=path.resolve(__dirname,'..'),handlers={},promoted=[];let total=0;
 const store={status:async()=>({total,draftTotal:10-total}),finalize:async(plan,results,options)=>{assert.equal(options.maxErrorRatio,1);const confirmed=results.filter(r=>r.output&&!r.error).length;promoted.push(plan.docFingerprint);total+=confirmed;return {confirmed,unmatched:0,total};}};
 const mocks={electron:{app:{isPackaged:false,getPath:()=>'/mock-data',whenReady:()=>new Promise(()=>{}),on(){}},ipcMain:{on(){},handle(name,fn){handlers[name]=fn;}}},'./services/layout-learning-pipeline.cjs':{createLearningPipeline:()=>store,verifyPsdOutput:async output=>{if(output==='unreadable.psd')throw Error('missing');return output!=='invalid.psd';}}};
 const context={require:n=>Object.hasOwn(mocks,n)?mocks[n]:require(n.startsWith('.')?path.resolve(root,n):n),module:{exports:{}},__dirname:root,process,Buffer,structuredClone,console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'main.cjs'),'utf8')+'\nmodule.exports={finalizeLanguageBatchLearning};',context);
 const tasks=Array.from({length:3},(_,i)=>({id:String(i),plan:{docFingerprint:'language-'+i,files:[{name:'source.psd'}]}}));
 const success=i=>({id:String(i),results:[{file:'source.psd',output:'valid-'+i+'.psd'}]});
 const failed=i=>({id:String(i),error:'Photoshop failed',results:[]});
 return {api:context.module.exports,tasks,promoted,success,failed};
}
test('whole-language batch failures are evaluated before any successful language is submitted',async()=>{
 const {api,tasks,promoted,success,failed}=harness();const result=await api.finalizeLanguageBatchLearning(tasks,[success(0),failed(1),failed(2)]);
 assert.equal(result.operationComplete,false);assert.equal(result.widespreadError,true);assert.equal(result.errorCount,2);assert.equal(result.totalCount,3);assert.equal(result.confirmed,0);assert.equal(promoted.length,0);
});
test('healthy complete batch submits independently matched language plans after aggregate gate',async()=>{
 const {api,tasks,promoted,success,failed}=harness(),documents=[success(0),failed(1),success(2)];const result=await api.finalizeLanguageBatchLearning(tasks,documents);
 assert.equal(result.operationComplete,true);assert.equal(result.confirmed,2);assert.equal(result.errorCount,1);assert.equal(promoted.join(','),'language-0,language-2');assert.equal(documents[0].learning.confirmed,1);
});
test('cancelled or unprocessed languages keep every batch sample as a draft despite healthy produced output',async()=>{
 for(const options of [{cancelled:true},{unprocessed:1}]){const {api,tasks,promoted,success}=harness();const result=await api.finalizeLanguageBatchLearning(tasks,tasks.map((_,i)=>success(i)),options);assert.equal(result.operationComplete,false);assert.equal(result.incomplete,true);assert.equal(promoted.length,0);}
 const {api,tasks,promoted,success}=harness();const result=await api.finalizeLanguageBatchLearning(tasks,[success(0),success(1)]);assert.equal(result.incomplete,true);assert.equal(promoted.length,0);
});
test('invalid, unreadable or incorrectly named PSD output cannot pass aggregate batch health gate',async()=>{
 for(const mutate of [r=>r.output='invalid.psd',r=>r.output='unreadable.psd',r=>r.file='wrong.psd']){const {api,tasks,promoted,success}=harness(),documents=tasks.map((_,i)=>success(i));mutate(documents[0].results[0]);mutate(documents[1].results[0]);const result=await api.finalizeLanguageBatchLearning(tasks,documents);assert.equal(result.operationComplete,false);assert.equal(result.errorCount,2);assert.equal(promoted.length,0);}
});
test('exactly half failed whole batch does not submit any successful language',async()=>{
 const {api,tasks,promoted,success,failed}=harness();const result=await api.finalizeLanguageBatchLearning(tasks.slice(0,2),[success(0),failed(1)]);assert.equal(result.errorRatio,.5);assert.equal(result.widespreadError,true);assert.equal(promoted.length,0);
});
