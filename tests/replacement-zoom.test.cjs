const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
function load(name){const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer',name)],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);return sandbox.module.exports;}
const {restoreReplacementZoom,replacementScale}=load('replacement-zoom.js');
const {createBatchPreview}=load('batch-preview.js');
// HTMLSelectElement clears its selection when assigned a missing option value.
// A plain object with a value property would hide the original regression.
function select(){let current='1';const options=[{value:'1',textContent:'适合窗口'}];return {options,append(option){options.push(option);},get value(){return options.some(o=>o.value===current)?current:'';},set value(value){value=String(value);current=options.some(o=>o.value===value)?value:'';}};}
const option=()=>({value:'',textContent:''});
test('replacement zoom restores a value whose mutable custom option was overwritten',()=>{
 const zoom=select(),custom=option();custom.value='1.37';zoom.append(custom);zoom.value='1.37';const saved=zoom.value;
 custom.value='2.19';zoom.value='2.19';zoom.value=saved;assert.equal(zoom.value,'');
 assert.equal(restoreReplacementZoom(zoom,saved,option),1.37);assert.equal(zoom.value,'1.37');
 const count=zoom.options.length;restoreReplacementZoom(zoom,saved,option);assert.equal(zoom.options.length,count);
 assert.ok(replacementScale(1080,600,zoom.value)>0);
});
test('invalid saved zoom recovers to fit without collapsing the replacement canvas',()=>{
 for(const value of ['',null,undefined,0,-1,'NaN',NaN,Infinity,'Infinity']){
  const zoom=select();assert.equal(restoreReplacementZoom(zoom,value,option),1);assert.equal(zoom.value,'1');
  assert.equal(replacementScale(1080,600,value),(600-32)/1080);
 }
 assert.equal(replacementScale(1080,600,'2'),2*(600-32)/1080);
 assert.equal(replacementScale(1080,2000,'1'),1);
});
test('hidden or invalid preview geometry defers drawing until a usable viewport exists',()=>{
 for(const width of [0,-1,NaN,Infinity])assert.equal(replacementScale(width,600,1),null);
 for(const viewport of [0,16,32,-1,NaN,Infinity])assert.equal(replacementScale(1080,viewport,1),null);
 const scale=replacementScale(1080,33,1);assert.ok(Number.isFinite(scale)&&scale>0);
});
test('batch preview exit and reopening retain visible zoom and saved language typography',async()=>{
 const zoom=select(),custom=option();custom.value='1.37';zoom.append(custom);zoom.value='1.37';
 const mainFiles=[{path:'source.psd',layers:[{id:1,customText:'main edit'}]}],state={files:mainFiles,records:[],scale:.5};
 const input={items:[{path:'source.psd',layers:[{id:1,box:[10,20,300,40]}]}],plan:{docName:'German.txt',records:[{id:'r1',target:'Deutsch'}],files:[{path:'source.psd',jobs:[{layerId:1,recordId:'r1',box:[10,20,300,40],previewLayout:{text:'Deutsch',box:[50,60,400,50],size:24,font:'Arial',weight:'regular',tracking:0,leading:28,stretchX:100,stretchY:100}}]}]}};
 const preview=createBatchPreview({state,parseImported:async item=>JSON.parse(JSON.stringify(item)),makePlan:async()=>({files:state.files}),refresh(){},getView:()=>({zoom:zoom.value}),restoreView:view=>restoreReplacementZoom(zoom,view.zoom,option)});
 await preview.enter(input,'german');const layer=state.files[0].layers[0];layer.customText='edited German';layer.position={x:200,y:300};layer.manual.size=31;
 custom.value='2.19';zoom.value='2.19';const savedLayers=preview.getLayers();preview.exit();
 assert.equal(state.files,mainFiles);assert.equal(zoom.value,'1.37');assert.ok(replacementScale(1080,600,zoom.value)>0);
 await preview.enter({...input,savedLayers},'german');const reopened=state.files[0].layers[0];
 assert.equal(reopened.customText,'edited German');assert.equal(reopened.position.x,200);assert.equal(reopened.position.y,300);assert.equal(reopened.manual.size,31);
 assert.equal(JSON.stringify(reopened.sourceBox),'[10,20,300,40]');assert.equal(zoom.value,'1.37');assert.ok(replacementScale(1080,600,zoom.value)>0);preview.exit();
});
