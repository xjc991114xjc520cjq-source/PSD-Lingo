const test=require('node:test'),assert=require('node:assert/strict');
const {targetBox,clampPosition}=require('../position.cjs');
const {hash,validatePlan,jsxForPlan}=require('../core.cjs');
function plan(position){const target='Exact target';return {version:1,records:[{id:'r',target,digest:hash(target)}],files:[{name:'test.psd',path:'C:/test.psd',fingerprint:'hash',jobs:[{layerId:1,font:'ArialMT',original:'原文',size:20,minSize:15,box:[10,20,200,50],recordId:'r',target,position}]}]};}
test('moving text changes target origin while preserving original source region',()=>{
  const box=[10,20,200,50];assert.deepEqual(targetBox(box,{x:80,y:100}),[80,100,200,50]);assert.deepEqual(box,[10,20,200,50]);
  assert.deepEqual(targetBox(box),box);const p=plan({x:80,y:100});validatePlan(p);assert.ok(jsxForPlan(p).includes('within(layer,targetBox)'));
});
test('position gestures clamp the whole allowed region to the canvas',()=>{
  assert.deepEqual(clampPosition([10,20,200,50],{x:-10,y:999},800,600),{x:0,y:550});
  assert.deepEqual(clampPosition([10,20,200,50],{x:12.345,y:45.678},800,600),{x:12.3,y:45.7});
});
test('export rejects invalid position numbers without changing source text validation',()=>{
  for(const position of [{x:NaN,y:1},{x:1,y:Infinity},{x:-300001,y:1},{x:1,y:300001}])assert.throws(()=>validatePlan(plan(position)),/位置/);
  const p=plan({x:50,y:60});p.files[0].jobs[0].target='changed';assert.throws(()=>validatePlan(p),/文档原文/);
});

test('negative allowed-region origins support aligning centered text while runtime fits only inside canvas',()=>{validatePlan(plan({x:-10,y:20}));assert.ok(jsxForPlan(plan({x:-10,y:20})).includes('Clip the fitting region, not glyphs'));});
