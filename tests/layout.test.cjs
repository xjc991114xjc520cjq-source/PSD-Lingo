const test=require('node:test');
const assert=require('node:assert/strict');
const {smartFit,insertBreaks,canonicalText}=require('../layout.cjs');
const {validatePlan,hash}=require('../core.cjs');
const measure=(text,size,tracking)=>({width:[...text].length*size*.6+Math.max(0,[...text].length-1)*tracking*size/1000,height:size*.75,ascent:size*.6});
const input={size:24,minSize:18,width:220,height:70,tracking:0,leading:30,allowWrap:true,allowLeading:true,trackingLimit:30};
test('word wrap resolves overflow which minimum font shrink alone cannot fix',()=>{
  const text='SharkMAX mouse solution',fit=smartFit({...input,text},measure);
  assert.ok(fit.ok);assert.equal(fit.size,24);assert.equal(fit.lines.length,2);assert.ok(fit.breaks.length);
  assert.equal(fit.text,insertBreaks(text,fit.breaks));assert.ok(fit.text.includes('SharkMAX'));assert.ok(!fit.text.includes('Shark\nMAX'));
});
test('bounded tracking can fit an unbreakable model number without stretching glyphs',()=>{
  const text='ABCDEFGHIJKLMNOP',fit=smartFit({...input,text,size:20,minSize:20,width:185,height:20,trackingLimit:30},measure);
  assert.ok(fit.ok);assert.equal(fit.size,20);assert.ok(fit.tracking<0&&fit.tracking>=-30);assert.deepEqual(fit.breaks,[]);
});
test('leading adjustment fits authored multi-line copy while preserving source breaks',()=>{
  const text='One\nTwo',fit=smartFit({...input,text,size:20,minSize:20,width:100,height:40,leading:40},measure);
  assert.ok(fit.ok);assert.deepEqual(fit.breaks,[]);assert.equal(fit.text,text);assert.ok(fit.leading<40);
});
test('explicit wrap and spacing locks are respected',()=>{
  const fit=smartFit({...input,text:'SharkMAX mouse solution',allowWrap:false,trackingLimit:0},measure);
  assert.equal(fit.ok,false);assert.deepEqual(fit.breaks,[]);assert.equal(fit.tracking,0);assert.ok(fit.size>=input.minSize);
});
test('impossible text returns measured diagnostics and a bounded suggestion, without dropping characters',()=>{
  const text='不可改写文字'.repeat(80),fit=smartFit({...input,text},measure);
  assert.equal(fit.ok,false);assert.ok(fit.width>input.width||fit.height>input.height);assert.ok(fit.suggestedMinSize>=8);
  assert.equal(fit.text,insertBreaks(text,fit.breaks));
});
test('authored whitespace, accents, emoji and original CRLF are preserved in layout data',()=>{
  const text='  Pokémon 😊 Collaboration  \r\nDaily care',fit=smartFit({...input,text,width:180,height:100},measure);
  assert.equal(fit.text,insertBreaks(canonicalText(text),fit.breaks));assert.ok(!fit.text.includes('\ud83d\n\ude0a'));
});
test('plan rejects out-of-policy tracking changes',()=>{
  const target='Exact copy',p={version:1,records:[{id:'r',target,digest:hash(target)}],files:[{path:'x.psd',fingerprint:'x',jobs:[{layerId:1,recordId:'r',target,original:'原文',font:'F',size:20,minSize:15,box:[0,0,100,40],smart:{allowWrap:true,allowLeading:true,trackingLimit:31}}]}]};
  assert.throws(()=>validatePlan(p),/排版约束/);p.files[0].jobs[0].smart.trackingLimit=30;validatePlan(p);
});
