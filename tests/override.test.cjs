const test=require('node:test'),assert=require('node:assert/strict');
const {hash,validatePlan,jsxForPlan}=require('../core.cjs');
function plan(){const source='Document original',edited='User edited text\nSecond line';return {version:1,records:[{id:'r',target:source,digest:hash(source)}],files:[{name:'test.psd',path:'C:/test.psd',fingerprint:'hash',jobs:[{layerId:1,font:'ArialMT',original:'原文',size:20,minSize:15,box:[10,20,200,80],recordId:'r',documentText:source,target:edited,override:{enabled:true,text:edited,sourceDigest:hash(source)}}]}]};}
test('explicit edited replacement keeps immutable document provenance',()=>{
  const p=plan();validatePlan(p);assert.equal(p.records[0].target,'Document original');
  assert.ok(jsxForPlan(p).includes('editedText:job.override?job.target:null'));
  delete p.files[0].jobs[0].override;assert.throws(()=>validatePlan(p),/文档原文/);
});
test('edited replacement rejects stale sources, different targets and empty text',()=>{
  for(const mutate of [j=>j.override.sourceDigest='wrong',j=>j.override.enabled=false,j=>j.override.text='',j=>j.target='other',j=>j.documentText='changed']){
    const p=plan();mutate(p.files[0].jobs[0]);assert.throws(()=>validatePlan(p));
  }
});
