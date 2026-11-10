const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {nativeCapture}=require('../illustrator-preview.cjs');
function capture(rect,{fail=false}={}){
 const calls=[],context={r:rect,d:{artboards:[{name:'海报 A',artboardRect:rect}],imageCapture(file,bounds,options){if(fail)throw Error('capture failed');calls.push({file:file.fsName,bounds:[...bounds],dpi:options.resolution});}},File:function(p){this.fsName=p;},Folder:function(p){this.fsName=p;this.exists=true;},RGBColor:function(){},ImageCaptureOptions:function(){Object.defineProperty(this,'resolution',{set(n){if(n<72)throw Error('minimum');this.dpi=n;},get(){return this.dpi;}});},write(p,value){context.manifest=JSON.parse(JSON.stringify(value));}};
 vm.runInNewContext(nativeCapture+';capture(d,r,"preview.png")',context);return {calls,manifest:context.manifest};
}
test('large separated artboards always capture at 72dpi while final preview stays bounded',()=>{
 const {calls,manifest:m}=capture([-9000,4000,10000,-4000]);assert.equal(calls.length,40);assert.ok(calls.every(c=>c.dpi===72&&c.bounds[2]-c.bounds[0]<=2048&&c.bounds[1]-c.bounds[3]<=2048));assert.ok(m.outputWidth*m.outputHeight<=6000000);assert.ok(m.outputWidth<=16384);assert.deepEqual(calls[0].bounds,[-9000,4000,-6952,1952]);assert.equal(calls.at(-1).bounds[2],10000);assert.equal(calls.at(-1).bounds[3],-4000);
});
test('small and fractional documents retain source coordinates without changing artwork',()=>{const {calls,manifest:m}=capture([.25,400.5,600.75,.25]);assert.equal(calls.length,1);assert.equal(m.width,600.5);assert.deepEqual(calls[0].bounds,[.25,400.5,600.75,.25]);});
test('capture failures name intersecting artboard and tile instead of a bare script line',()=>{assert.throws(()=>capture([0,600,600,0],{fail:true}),/画板：海报 A；分块 1,1；72 dpi/);assert.throws(()=>capture([0,0,0,0]),/范围无效/);});
