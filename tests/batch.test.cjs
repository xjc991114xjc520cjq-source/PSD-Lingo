const test=require('node:test'),assert=require('node:assert/strict');
const {hash,jsxForPlan}=require('../core.cjs');const {createTemplate,validateTemplate,matchDocument,planForDocument,outputName}=require('../batch.cjs');
function fixture(){const target='Document reference',override='Confirmed edited reference';return {version:1,records:[{id:'r',key:'title',target,digest:hash(target)},{id:'s',key:'note',target:'Skipped note',digest:hash('Skipped note')}],files:[{name:'产品.psd',path:'C:/产品.psd',fingerprint:'source-hash',jobs:[{layerId:1,original:'原文',font:'SourceFont',size:30,minSize:15,box:[10,20,50,30],recordId:'r',target:override,documentText:target,override:{enabled:true,text:override,sourceDigest:hash(target)},position:{x:100,y:200},manual:{enabled:true,font:'ArialMT',size:30,tracking:0,leading:36,weight:'regular'},previewLayout:{text:override,breaks:[],font:'ArialMT',size:30,tracking:0,leading:36,weight:'regular',stretchX:100,stretchY:100,box:[100,200,300,60]}}]}],skipped:[{file:'产品.psd',layerId:2,name:'note'}]};}
function template(){return createTemplate(fixture(),{name:'Test',annotations:[{path:'C:/产品.psd',layerId:1,name:'Title',alignment:'center',aspectScale:1}]});}
function doc(){return {name:'法语.txt',fingerprint:'doc-hash',records:[{key:'title',target:'Bonjour',digest:hash('Bonjour')},{key:'note',target:'Remarque',digest:hash('Remarque')}]};}
function layout(){return {fileIndex:0,layerId:1,text:'Bonjour',breaks:[],font:'ArialMT',size:27,tracking:0,leading:32.4,weight:'regular',stretchX:100,stretchY:100,box:[110,200,100,25]};}
test('templates persist ordinal mapping and confirmed style independent of original geometry',()=>{const t=validateTemplate(JSON.parse(JSON.stringify(template())));assert.equal(t.bindings[0].recordIndex,0);assert.equal(t.bindings[0].alignment,'center');assert.equal(t.plan.files[0].jobs[0].previewLayout.box[0],100);assert.equal(t.plan.skipped.length,1);});
test('new language replaces reference overrides without changing source provenance or skipped layers',()=>{const p=planForDocument(template(),doc(),{mode:'order',layouts:[layout()]});const j=p.files[0].jobs[0];assert.equal(j.target,'Bonjour');assert.equal(j.documentText,'Bonjour');assert.equal(j.override,undefined);assert.equal(j.position,undefined);assert.equal(j.manual,undefined);assert.equal(j.original,'原文');assert.equal(j.font,'SourceFont');assert.deepEqual(j.box,[10,20,50,30]);assert.equal(p.skipped[0].layerId,2);assert.equal(p.files[0].name,'产品_法语.psd');});
test('order rejects shifted counts, key mapping permits reordered rows but refuses duplicate or missing IDs',()=>{const t=template(),d=doc();d.records.reverse();assert.equal(matchDocument(t,d,'key')[0].record.target,'Bonjour');d.records.pop();assert.throws(()=>matchDocument(t,d,'order'),/条目数/);assert.throws(()=>matchDocument(t,d,'key'),/缺少/);d.records=[...doc().records,doc().records[0]];assert.throws(()=>matchDocument(t,d,'key'),/重复/);});
test('batch cannot rewrite text, change font, escape template region or exceed shrink limits',()=>{for(const patch of [{text:'Invented'},{font:'Other'},{size:10},{box:[0,200,100,25]},{box:[100,200,500,25]},{stretchX:200},{leading:200}])assert.throws(()=>planForDocument(template(),doc(),{mode:'order',layouts:[{...layout(),...patch}]}));const d=doc();d.records[0].target='Changed';assert.throws(()=>matchDocument(template(),d,'order'),/校验/);});
test('fixed typography is exact; adaptive options and malformed templates are rejected',()=>{assert.throws(()=>planForDocument(template(),doc(),{mode:'order',fitMode:'fixed',layouts:[layout()]}),/参数/);const p={...layout(),size:30,leading:36};assert.doesNotThrow(()=>planForDocument(template(),doc(),{mode:'order',fitMode:'fixed',layouts:[p]}));const t=template();t.bindings.push({...t.bindings[0]});assert.throws(()=>validateTemplate(t),/绑定/);});
test('batch JSX takes one explicit output directory, stays silent and protects source copies',()=>{const p=planForDocument(template(),doc(),{mode:'order',layouts:[layout()]});const script=jsxForPlan(p,{outputDirectory:'C:/Exports/语言',silent:true});assert.ok(script.includes('new Folder("C:/Exports/语言")'));assert.ok(!script.includes('Folder.selectDialog'));assert.ok(script.includes('if(false)alert'));assert.ok(script.includes('original.duplicate'));assert.ok(script.includes('while (out.exists)'));assert.equal(outputName('test.psd','a:b?.txt'),'test_a_b_.psd');});
test('language preview allows overflow for editing while normal automatic export retains fit constraints',()=>{
 const layouts=[{...layout(),box:[100,200,700,100]}];
 assert.throws(()=>planForDocument(template(),doc(),{mode:'order',layouts}),/区域/);
 const p=planForDocument(template(),doc(),{mode:'order',layouts,preview:true});assert.equal(p.files[0].jobs[0].previewLayout.box[2],700);
 assert.throws(()=>planForDocument(template(),doc(),{mode:'order',layouts:[{...layouts[0],size:NaN}],preview:true}),/预览排版/);
});
test('confirmed language edits preserve document provenance and allow typography, position and copy overrides',()=>{
 const t=template(),d=doc(),edited=planForDocument(t,d,{mode:'order',layouts:[layout()]}),e=edited.files[0].jobs[0];
 e.override={enabled:true,sourceDigest:d.records[0].digest,text:'Bonjour modifié'};e.target=e.override.text;
 e.previewLayout={...e.previewLayout,text:e.target,font:'OtherInstalledFont',size:40,stretchX:125,box:[500,400,900,100]};
 const p=planForDocument(t,d,{mode:'order',manualPlan:edited}),j=p.files[0].jobs[0];
 assert.equal(j.target,'Bonjour modifié');assert.equal(j.documentText,'Bonjour');assert.equal(j.original,'原文');assert.equal(j.font,'SourceFont');assert.equal(j.previewLayout.font,'OtherInstalledFont');assert.equal(j.previewLayout.box[0],500);assert.equal(p.batch.fitMode,'edited');
});
test('language edits cannot replace source files, original text, document source or layer bindings',()=>{
 for(const alter of [p=>{p.files[0].fingerprint='changed';},p=>{p.files[0].jobs[0].original='changed';},p=>{p.records[0].target='Changed';p.records[0].digest=hash('Changed');p.files[0].jobs[0].target='Changed';p.files[0].jobs[0].previewLayout.text='Changed';},p=>{p.files[0].jobs[0].layerId=999;},p=>{p.files[0].jobs[0].recordId='batch:1';}]){
  const p=planForDocument(template(),doc(),{mode:'order',layouts:[layout()]});alter(p);assert.throws(()=>planForDocument(template(),doc(),{mode:'order',manualPlan:p}));
 }
});
test('language editing records omitted template text layers as skipped',()=>{
 const t=template(),j=structuredClone(t.plan.files[0].jobs[0]);j.layerId=3;t.plan.files[0].jobs.push(j);t.bindings.push({...t.bindings[0],layerId:3,layerName:'Second'});
 const p=planForDocument(t,doc(),{mode:'order',layouts:[layout(),{...layout(),layerId:3}]});p.files[0].jobs.pop();
 const result=planForDocument(t,doc(),{mode:'order',manualPlan:p});assert.equal(result.files[0].jobs.length,1);assert(result.skipped.some(s=>s.layerId===3));
});
test('language preview capture keeps source geometry while edited visible geometry exports independently',async()=>{
 const vm=require('node:vm'),path=require('node:path'),fs=require('node:fs');
 const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/batch-preview.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
 const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
 const t=template(),d=doc(),plan=planForDocument(t,d,{mode:'order',layouts:[layout()]}),source=fixture().files[0],j=source.jobs[0];
 const state={files:[],records:[]};
 const preview=sandbox.module.exports.createBatchPreview({state,parseImported:async item=>structuredClone(item),refresh(){},makePlan:async()=>({version:1,records:state.records,files:state.files.map(f=>({...source,jobs:f.layers.filter(l=>!l.skipExport).map(l=>({layerId:l.id,original:l.original,font:l.font,size:l.size,minSize:j.minSize,box:l.sourceBox||l.box,recordId:l.recordId,target:state.records.find(r=>r.id===l.recordId).target,previewLayout:{...plan.files[0].jobs[0].previewLayout,box:l.box}}))}))})});
 await preview.enter({items:[{path:source.path,layers:[{id:j.layerId,original:j.original,font:j.font,size:j.size,box:j.box}]}],plan},'language');
 assert.deepEqual(Array.from(state.files[0].layers[0].sourceBox),[10,20,50,30]);assert.deepEqual(Array.from(state.files[0].layers[0].box),[110,200,100,25]);
 state.files[0].layers[0].box=[250,300,200,60];
 const captured=await preview.capture(),exported=planForDocument(t,d,{mode:'order',manualPlan:captured});
 assert.deepEqual(exported.files[0].jobs[0].box,[10,20,50,30]);assert.deepEqual(exported.files[0].jobs[0].previewLayout.box,[250,300,200,60]);
 assert.match(fs.readFileSync(path.join(__dirname,'../renderer/app.js'),'utf8'),/box:l\.sourceBox\|\|l\.box/);
});
