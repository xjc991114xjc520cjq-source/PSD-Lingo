const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createLearningPipeline,matchesExport,verifyPsdOutput}=require('../services/layout-learning-pipeline.cjs');
function fixture(){const fingerprint='a'.repeat(64),doc='b'.repeat(64),layer={id:1,original:'原稿',target:'Hello',box:[10,20,100,30],layoutBox:[10,20,100,30],font:'Arial',size:20,alignment:'left',fit:{size:20,width:60,height:24,leading:24,tracking:0,lines:['Hello']}};
 const after={layers:[layer],containers:[],containerEdits:[]};return {sample:{version:1,projectId:fingerprint,context:{fileFingerprint:fingerprint,documentDigest:doc,width:500,height:1000,batchLanguage:'English.csv'},before:{...structuredClone(after),layers:[{...structuredClone(layer),position:{x:5,y:20}}]},after,stages:{source:after,substituted:after,final:after},visual:{quality:'estimated'}},plan:{docFingerprint:doc,files:[{name:'sample.psd',fingerprint,jobs:[{layerId:1,target:'Hello',previewLayout:{box:[10,20,60,24],size:20,tracking:0,leading:24,font:'Arial',weight:'original',stretchX:100,stretchY:100}}]}]}};
}
test('unfinished operations stay local drafts; only successful exact PSD layout becomes an example',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lingo-gate-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const gate=createLearningPipeline({directory,verifyOutput:async()=>true}),{sample,plan}=fixture();
 let status=await gate.stage(sample);assert.equal(status.total,0);assert.equal(status.draftTotal,1);assert.equal((await gate.retrieve()).length,0);
 const failedRun=await gate.finalize(plan,[{file:'sample.psd',error:'failed'}]);assert.equal(failedRun.operationComplete,false);assert.equal(failedRun.widespreadError,true);assert.equal((await gate.status()).total,0);
 const stale=structuredClone(plan);stale.files[0].jobs[0].previewLayout.size=30;assert.equal((await gate.finalize(stale,[{file:'sample.psd',output:'out.psd'}])).confirmed,0);
 const result=await gate.finalize(plan,[{file:'sample.psd',output:'out.psd'}]);assert.equal(result.confirmed,1);assert.equal(result.operationComplete,true);assert.equal(result.widespreadError,false);assert.equal(result.total,1);assert.equal(result.draftTotal,0);assert.equal((await gate.retrieve())[0].stageCoverage,'three-stage');
 assert.equal((await gate.finalize(plan,[{file:'sample.psd',output:'out.psd'}])).confirmed,0);
});

test('an isolated batch export error still completes the operation and records successful PSDs',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lingo-partial-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const gate=createLearningPipeline({directory,verifyOutput:async()=>true});const {sample,plan}=fixture();
 const second=structuredClone(sample);second.context.batchLanguage='French.csv';second.projectId='c'.repeat(64);second.context.fileFingerprint='c'.repeat(64);
 const secondPlan=structuredClone(plan);secondPlan.files[0].name='second.psd';secondPlan.files[0].fingerprint='c'.repeat(64);
 const third=structuredClone(second);third.context.batchLanguage='German.csv';third.projectId='d'.repeat(64);third.context.fileFingerprint='d'.repeat(64);
 const thirdPlan=structuredClone(plan);thirdPlan.files[0].name='third.psd';thirdPlan.files[0].fingerprint='d'.repeat(64);
 await gate.stage(sample);await gate.stage(second);await gate.stage(third);
 const batch={docFingerprint:plan.docFingerprint,files:[plan.files[0],secondPlan.files[0],thirdPlan.files[0]]};
 const result=await gate.finalize(batch,[{file:'sample.psd',output:'one.psd'},{file:'second.psd',error:'isolated'},{file:'third.psd',output:'three.psd'}]);
 assert.equal(result.confirmed,2);assert.equal(result.operationComplete,true);assert.equal(result.widespreadError,false);assert.equal(result.errorCount,1);assert.equal(result.totalCount,3);
});
test('batch languages, changed text, transforms and containers never promote a different draft',()=>{const {sample,plan}=fixture();assert.equal(matchesExport(sample,plan.files[0],plan),true);
 for(const mutate of [p=>p.docFingerprint='c'.repeat(64),p=>p.files[0].jobs[0].target='Bonjour',p=>p.files[0].jobs[0].previewLayout.box[0]=50,p=>p.files[0].jobs[0].previewLayout.stretchX=120,p=>p.files[0].containerEdits=[{layerId:3,box:[0,0,30,20]}]]){const p=structuredClone(plan);mutate(p);assert.equal(matchesExport(sample,p.files[0],p),false);}});
test('half or mostly failed generation never writes successful drafts before evaluating the run',async t=>{
 for(const failures of [1,2]){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lingo-major-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const gate=createLearningPipeline({directory,verifyOutput:async()=>true}),{sample,plan}=fixture();await gate.stage(sample);
  const p=structuredClone(plan);for(let i=0;i<failures;i++)p.files.push({...structuredClone(p.files[0]),name:'failed-'+i+'.psd'});
  const result=await gate.finalize(p,[{file:'sample.psd',output:'one.psd'},...p.files.slice(1).map(f=>({file:f.name,error:'failed'}))]);
  assert.equal(result.operationComplete,false);assert.equal(result.widespreadError,true);assert.equal(result.confirmed,0);assert.equal(result.total,0);assert.equal(result.draftTotal,1);assert.equal((await gate.retrieve()).length,0);
  const retry=await gate.finalize(plan,[{file:'sample.psd',output:'retry.psd'}]);assert.equal(retry.confirmed,1);assert.equal(retry.draftTotal,0);
 }
});
test('cancelled, missing or unreadable output remains a draft and never certifies an operation',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lingo-empty-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const {sample,plan}=fixture();
 const gate=createLearningPipeline({directory,verifyOutput:async()=>{throw Error('unreadable');}});await gate.stage(sample);
 for(const results of [[],[{file:'sample.psd',output:'unreadable.psd'}]]){const r=await gate.finalize(plan,results);assert.equal(r.operationComplete,false);assert.equal(r.confirmed,0);assert.equal(r.draftTotal,1);}
});
test('a fake or missing output cannot certify learning; real PSD header required',async t=>{const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lingo-header-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const p=path.join(dir,'out.psd');await fs.writeFile(p,'not a PSD');assert.equal(await verifyPsdOutput(p),false);const b=Buffer.alloc(30);b.write('8BPS');b.writeUInt16BE(2,4);await fs.writeFile(p,b);assert.equal(await verifyPsdOutput(p),true);});
test('copy-only export cannot promote a rewrite into layout learning',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lingo-copy-only-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const gate=createLearningPipeline({directory,verifyOutput:async()=>true}),{sample,plan}=fixture();sample.before=structuredClone(sample.after);sample.before.layers[0].target='Old words';
 assert.equal((await gate.stage(sample)).ignored,'no-layout-change');assert.equal((await gate.status()).draftTotal,0);assert.equal((await gate.finalize(plan,[{file:'sample.psd',output:'out.psd'}])).confirmed,0);assert.equal((await gate.status()).total,0);
});
