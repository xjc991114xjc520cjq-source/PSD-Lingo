const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const Module=require('node:module');
const {buildSync}=require('esbuild');
const source=path.resolve(__dirname,'../renderer/batch-layout-runtime.js');
const compiled=buildSync({entryPoints:[source],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const runtimeModule=new Module(source,module);runtimeModule.filename=source;runtimeModule.paths=module.paths;runtimeModule._compile(compiled,source);
const {createBatchLayoutRuntime}=runtimeModule.exports;
const clone=value=>JSON.parse(JSON.stringify(value));
function prepared(overlapReplacement=false){
 const box=overlapReplacement?[60,10,20,10]:[10,10,20,10];
 const layer=(id,b)=>({id,name:'text-'+id,box:b,sourceBox:[...b],size:10,minSize:10,font:'Arial',alignment:'left',visible:true,issues:[]});
 return {items:[{path:'source.psd',name:'source.psd',width:100,height:100,layers:[layer(1,box),layer(2,[60,10,20,10]),layer(3,[62,12,20,10])],containers:[]}],plan:{records:[{id:'r',target:'Approved copy'}],files:[{path:'source.psd',name:'result.psd',jobs:[{layerId:1,recordId:'r',box,previewLayout:{box,size:10,font:'Arial',weight:'original',tracking:0,leading:12,stretchX:100,stretchY:100,text:'Approved copy'}}]}]}};
}
const runtime=createBatchLayoutRuntime({parseImported:async item=>clone(item),fitText:(layer,record)=>({ok:true,text:record.target,breaks:[],size:10,width:20,height:10,tracking:0,leading:12}),call:async()=>{throw Error('unexpected IPC');},getSettings:()=>({}),document:{},Image:class {}});
test('batch export preserves overlapping original layers when neither is replaced',async()=>{
 const result=await runtime({prepared:prepared(),document:{name:'English'},useAi:false});
 assert.equal(result.plan.files[0].jobs.length,1);
 assert.equal(result.plan.files[0].jobs[0].previewLayout.text,'Approved copy');
});
test('batch export still blocks replacement text overlapping an unchanged original layer',async()=>{
 await assert.rejects(runtime({prepared:prepared(true),document:{name:'English'},useAi:false}),/文字重叠/);
});
