const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/batch-preview.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
function fixture(){
 const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 const files=[{path:'source.psd',layers:[{id:1,customText:'original-main-edit'}]}],records=[{id:'main',target:'original'}],state={files,records,docName:'main.txt',scale:.5,settings:{mode:'api'}};let savedArgs,restored;
 const preview=sandbox.module.exports.createBatchPreview({state,parseImported:async item=>JSON.parse(JSON.stringify(item)),makePlan:async args=>{savedArgs=args;return {files:state.files};},refresh(){},getView:()=>({left:41}),restoreView:v=>restored=v});
 const result={items:[{path:'source.psd',layers:[{id:1,box:[0,0,30,20],aspectScale:1},{id:2}]}],plan:{docName:'German.txt',docFingerprint:'doc',records:[{id:'batch:0',target:'Deutsch'}],files:[{path:'source.psd',jobs:[{layerId:1,recordId:'batch:0',previewLayout:{text:'Deutsch',box:[50,60,90,30],font:'Arial',size:24,tracking:0,leading:28,weight:'regular',stretchX:100,stretchY:100}}]}]}};
 return {preview,state,files,records,result,getArgs:()=>savedArgs,getRestored:()=>restored};
}
test('language edits and cancellation restore original project by reference without mutations',async()=>{
 const f=fixture();await f.preview.enter(f.result,'german');assert.notEqual(f.state.files,f.files);assert.equal(f.state.files[0].layers[0].manual.size,24);assert.equal(f.state.files[0].layers[1].skipExport,true);
 f.state.files[0].layers[0].customText='edited German';f.state.settings.mode='local';f.preview.exit();assert.equal(f.state.files,f.files);assert.equal(f.state.records,f.records);assert.equal(f.files[0].layers[0].customText,'original-main-edit');assert.equal(f.state.settings.mode,'local');assert.equal(f.state.scale,.5);assert.equal(f.getRestored().left,41);
});
test('saved language layer state can reopen including all-skipped layers without leaking into another language',async()=>{
 const f=fixture();await f.preview.enter(f.result,'german');const l=f.state.files[0].layers[0];l.customText='manual';l.position={x:300,y:400};l.skipExport=true;
 const saved=f.preview.getLayers();await f.preview.capture();assert.equal(f.getArgs().allowEmpty,true);f.preview.exit();
 await f.preview.enter({...f.result,savedLayers:saved},'german');assert.equal(f.state.files[0].layers[0].customText,'manual');assert.equal(f.state.files[0].layers[0].skipExport,true);assert.equal(f.state.files[0].layers[0].position.x,300);f.preview.exit();
 await f.preview.enter(f.result,'french');assert.equal(f.state.files[0].layers[0].customText,undefined);assert.equal(f.state.files[0].layers[0].skipExport,false);f.preview.exit();
});
test('invalid preparation does not replace the main project and nested previews are rejected',async()=>{
 const f=fixture();await assert.rejects(f.preview.enter({...f.result,plan:{...f.result.plan,files:[]}},'bad'),/不一致/);assert.equal(f.state.files,f.files);assert.equal(f.preview.isActive(),false);
 await f.preview.enter(f.result,'german');await assert.rejects(f.preview.enter(f.result,'other'),/先保存/);assert.equal(f.state.batchPreviewId,'german');f.preview.exit();
});

test('persistent work records reconstruct the preview base so return restores the original workspace',async()=>{
 const f=fixture();await f.preview.enter(f.result,'german');const saved=JSON.parse(JSON.stringify(f.preview.captureWork()));
 f.state.files[0].layers[0].customText='translated edit';await f.preview.restoreWork(saved);
 assert.equal(f.preview.isActive(),true);assert.equal(f.state.files[0].layers[0].customText,'translated edit');
 f.preview.exit();assert.equal(f.state.files[0].layers[0].customText,'original-main-edit');assert.equal(f.state.records[0].target,'original');assert.equal(f.getRestored().left,41);
 await f.preview.restoreWork(null);assert.equal(f.preview.isActive(),false);
});
test('language workspace retains source provenance and an adjustable minimum instead of locking translated size',async()=>{
 const f=fixture();f.result.plan.files[0].jobs[0].box=[0,0,30,20];f.result.plan.files[0].jobs[0].minSize=13;await f.preview.enter(f.result,'german');
 const l=f.state.files[0].layers[0];assert.equal(l.minSize,13);assert.deepEqual(Array.from(l.sourceBox),[0,0,30,20]);assert.deepEqual(Array.from(l.box),[50,60,90,30]);assert.equal(f.files[0].layers[0].minSize,undefined);f.preview.exit();
});
test('extracted background shapes survive per-language capture and reopen without changing source metadata',async()=>{
 const f=fixture(),shape={id:-1,name:'拆分矩形',box:[0,0,180,90],radii:[12,12,12,12],fill:'#ffffff',background:'#eeeeee',anchorTextId:1,sourceFingerprint:'fp'};
 f.result.items[0].layers[0].parentId=10;f.result.items[0].layers[0].stackIndex=3;
 f.result.items[0].containers=[{id:10,kind:'shape',box:[0,0,300,300],issues:[]}];
 f.result.plan.files[0].extractedContainers=[shape];
 await f.preview.enter(f.result,'german');
 assert.equal(f.state.files[0].containers.length,2);const virtual=f.state.files[0].containers.find(c=>c.id===-1);
 assert.equal(virtual.extracted,true);assert.equal(virtual.parentId,10);assert.equal(virtual.stackIndex,3.5);
 f.state.files[0].extractedContainers[0].radii[0]=20;const saved=f.preview.getLayers();f.preview.exit();
 assert.equal(shape.radii[0],12);assert.equal(f.result.items[0].containers.length,1);
 await f.preview.enter({...f.result,savedLayers:saved},'german');assert.equal(f.state.files[0].containers.find(c=>c.id===-1).radii[0],20);f.preview.exit();
 await f.preview.enter(f.result,'french');assert.equal(f.state.files[0].containers.find(c=>c.id===-1).radii[0],12);f.preview.exit();
});

test('language template reconstructs native additions without saved renderer layers and retains source removals',async()=>{
 const f=fixture();Object.assign(f.result.items[0],{format:'PSD',width:500,height:800});const source=f.result.plan.files[0];source.textActions=[{layerId:2,mode:'clear',reason:'Approved duplicate removal'}];
 source.jobs.push({layerId:-7,name:'New price',recordId:'batch:0',original:'',font:'Arial',size:24,minSize:18,box:[40,150,200,70],target:'Deutsch',alignment:'center',nativeCreation:{color:'#123456',boardBox:[0,0,500,800],boardName:'画布'},previewLayout:{text:'Deutsch',box:[40,150,150,30],font:'Arial',size:24,weight:'regular',tracking:0,leading:28,stretchX:100,stretchY:100}});
 await f.preview.enter(f.result,'german');const l=f.state.files[0].layers.find(l=>l.id===-7);assert.ok(l);assert.equal(l.nativeCreation.color,'#123456');assert.equal(l.recordId,'batch:0');assert.equal(l.manual.size,24);assert.equal(f.state.files[0].layers.find(l=>l.id===2).nativeDisposition,'clear');f.preview.exit();assert.equal(f.files[0].layers.length,1);
});
