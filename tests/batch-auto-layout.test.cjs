const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/batch-auto-layout.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);const {autoLayoutBatch}=sandbox.module.exports;
const doc=(id,overflow=0)=>({id,name:id+'.csv',computed:{layouts:[{layerId:1}],overflow}});
const plan=id=>({files:[{name:id+'.psd',jobs:[{layerId:1,target:id}]}]});
test('every selected language is adapted sequentially including template overflow, confirmed manual layout preserved',async()=>{
 const documents=[doc('English',3),doc('German',2),{...doc('French'),manualPlan:plan('manual')}],calls=[],order=[];let active=0;
 const result=await autoLayoutBatch({documents,template:{},options:{mode:'order'},call:async(name,p)=>{calls.push([name,p]);return {id:p.id};},autoLayoutLanguage:async({prepared,useAi})=>{assert.equal(++active,1);await Promise.resolve();order.push(prepared.id);active--;assert.equal(useAi,true);return {plan:plan(prepared.id),layers:[{path:prepared.id}]};}});
 assert.deepEqual(order,['English','German']);assert.equal(result.planned.length,3);assert.equal(result.issues.length,0);assert.equal(documents[0].manualPlan.files[0].name,'English.psd');assert.equal(documents[2].manualPlan.files[0].name,'manual.psd');assert.equal(calls.length,2);
});
test('cancellation after preparation never invokes planner and never exports',async()=>{
 let cancelled=false,planned=0;const result=await autoLayoutBatch({documents:[doc('English'),doc('German')],options:{},isCancelled:()=>cancelled,call:async()=>{cancelled=true;return {};},autoLayoutLanguage:async()=>{planned++;return {plan:plan('x')};}});
 assert.equal(result.cancelled,true);assert.equal(planned,0);assert.equal(result.planned.length,0);
});
test('cancellation after AI reply discards that result and keeps input language unchanged',async()=>{
 let cancelled=false;const document=doc('English');const result=await autoLayoutBatch({documents:[document],options:{},isCancelled:()=>cancelled,call:async()=>({}),autoLayoutLanguage:async()=>{cancelled=true;return {plan:plan('x')};}});
 assert.equal(result.cancelled,true);assert.equal(document.manualPlan,undefined);
});
test('one preparation or analysis failure is isolated and reported while other languages finish',async()=>{
 const documents=[doc('BadSource'),doc('BadAI'),doc('German')];const result=await autoLayoutBatch({documents,options:{},call:async(_,p)=>{if(p.id==='BadSource')throw Error('source unavailable');return {id:p.id};},autoLayoutLanguage:async({prepared})=>{if(prepared.id==='BadAI')throw Error('AI unavailable');return {plan:plan('German'),layers:[],issues:['needs visual review']};}});
 assert.equal(result.planned.length,1);assert.equal(result.issues.length,3);assert.equal(result.issues.filter(i=>i.blocked).length,2);assert.equal(documents[2].autoPlanned,true);assert.equal(documents[1].manualPlan,undefined);
});
test('local-only preference reaches planner, repeated run reuses completed language layouts',async()=>{
 const documents=[doc('English')];let count=0;const args={documents,options:{},useAi:false,call:async()=>({}),autoLayoutLanguage:async({useAi})=>{assert.equal(useAi,false);count++;return {plan:plan('English'),layers:[]};}};
 await autoLayoutBatch(args);await autoLayoutBatch(args);assert.equal(count,1);
});
