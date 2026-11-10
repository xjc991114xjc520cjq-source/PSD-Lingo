const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {hash,jsxForPlan}=require('../core.cjs'),{createTemplate,planForDocument}=require('../batch.cjs');
function fixture(){
 const target='Hello',p={text:target,breaks:[],font:'ArialMT',size:20,tracking:0,leading:24,weight:'regular',stretchX:100,stretchY:100,box:[20,20,100,24]};
 const edit={layerId:10,textLayerId:1,sourceBox:[10,10,120,40],box:[10,10,180,40]};
 const plan={version:1,records:[{id:'r',key:'title',target,digest:hash(target)}],files:[{name:'source.psd',path:'C:/source.psd',fingerprint:'source',width:1000,height:1000,containerEdits:[edit],jobs:[{layerId:1,original:'你好',font:'ArialMT',size:20,minSize:10,box:[20,20,100,24],recordId:'r',target,previewLayout:p}]}]};
 const template=createTemplate(plan,{name:'Container'}),doc={name:'German.txt',fingerprint:'doc',records:[{key:'title',target:'Hallo',digest:hash('Hallo')}]};
 return {template,doc,edit,layout:{...p,text:'Hallo',fileIndex:0,layerId:1}};
}
test('container transforms survive templates, per-language edits and native PSD export independently',()=>{
 const {template,doc,layout,edit}=fixture();const a=planForDocument(template,doc,{mode:'order',layouts:[layout]});assert.deepEqual(a.files[0].containerEdits,[edit]);
 a.files[0].containerEdits[0]={...edit,box:[15,10,210,48]};
 const b=planForDocument(template,doc,{mode:'order',manualPlan:a});assert.deepEqual(b.files[0].containerEdits[0].box,[15,10,210,48]);assert.deepEqual(template.plan.files[0].containerEdits[0].box,[10,10,180,40]);
 const jsx=jsxForPlan(b,{silent:true}),duplicate=jsx.indexOf('current = original.duplicate'),materialize=jsx.indexOf('var nativeEdits=materializeExtracted(current,item.extractedContainers||[],edits)'),apply=jsx.indexOf('applyContainers(current,nativeEdits)');assert.ok(duplicate>=0&&materialize>duplicate&&apply>materialize,'duplicate source, materialize virtual shapes, then apply mapped native edits');assert.ok(!/\.rasterize\(/.test(jsx));
});
test('batch reopening retains its own container edits and cancellation restores the main project',async()=>{
 const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/batch-preview.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
 const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 const {template,doc,layout}=fixture(),plan=planForDocument(template,doc,{mode:'order',layouts:[layout]});
 const main=[{path:'main',layers:[],containerEdits:[{layerId:90}]}],state={files:main,records:[]};
 const preview=sandbox.module.exports.createBatchPreview({state,parseImported:async item=>structuredClone(item),refresh(){},makePlan:async()=>plan});
 const input={items:[{path:'C:/source.psd',layers:[{id:1,box:[20,20,100,24]}]}],plan};
 await preview.enter(input,'de');assert.equal(state.files[0].layers[0].containerId,10);state.files[0].containerEdits[0].box=[25,30,220,60];const savedLayers=preview.getLayers();preview.exit();assert.equal(state.files,main);
 await preview.enter({...input,savedLayers},'de');assert.equal(JSON.stringify(state.files[0].containerEdits[0].box),'[25,30,220,60]');preview.exit();
 await preview.enter(input,'fr');assert.equal(JSON.stringify(state.files[0].containerEdits[0].box),'[10,10,180,40]');preview.exit();
});
