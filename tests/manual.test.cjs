const test=require('node:test'),assert=require('node:assert/strict');
const {hash,validatePlan,jsxForPlan}=require('../core.cjs');
function plan(){const target='Exact supplied words';return {version:1,records:[{id:'r',target,digest:hash(target)}],files:[{name:'test.psd',path:'C:/test.psd',fingerprint:'hash',jobs:[{layerId:1,font:'OriginalFont',original:'原文',size:40,minSize:30,box:[0,0,300,80],recordId:'r',target,manual:{enabled:true,font:'ArialMT',weight:'bold',size:22,tracking:25,leading:28}}]}],skipped:[{file:'test.psd',layerId:2,name:'hidden',reasons:['用户主动跳过']}]};}
test('manual target font is separate from original provenance and preserves document text',()=>{
  const p=plan();validatePlan(p);const jsx=jsxForPlan(p);
  assert.ok(jsx.includes('OriginalFont'));assert.ok(jsx.includes('ArialMT'));
  assert.ok(jsx.includes('if(manual){minimum=startSize;'));
  assert.ok(jsx.includes('manual.weight!=="original"'));assert.ok(jsx.includes('用户确认跳过'));
  p.files[0].jobs[0].target='rewritten';assert.throws(()=>validatePlan(p),/文档原文/);
});
test('manual parameter bounds reject malformed or out-of-range controls',()=>{
  for(const bad of [{size:0},{size:NaN},{size:2001},{leading:0},{tracking:-201},{tracking:1001},{font:''},{weight:'unknown'},{enabled:false}]){
    const p=plan();Object.assign(p.files[0].jobs[0].manual,bad);assert.throws(()=>validatePlan(p),/手动排版/);
  }
});

test('explicit stretch percentages are bounded independently of font size',()=>{for(const field of ['stretchX','stretchY']){for(const value of [NaN,0,9,1001,'80']){const p=plan();p.files[0].jobs[0].manual[field]=value;assert.throws(()=>validatePlan(p),/拉伸/);}const p=plan();p.files[0].jobs[0].manual[field]=80;validatePlan(p);assert.ok(jsxForPlan(p).includes('ti.horizontalScale'));}});
