const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/import-cleanup.js')],bundle:true,format:'cjs',platform:'node',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}},exports:{}};sandbox.exports=sandbox.module.exports;vm.runInNewContext(code,sandbox);
const {removeImportedFile,clearImportedFiles,clearImportedDocument}=sandbox.module.exports;
function fixture(){return {files:[0,1,2].map(i=>({path:`source-${i}.psd`,preview:`original-${i}`,fingerprint:`hash-${i}`,containerEdits:[{layerId:9}],layers:[{id:i,recordId:'r1',suggestedId:'r2',customText:'manual text',transformSelected:true,position:{x:20,y:30},manual:{size:21},containerId:9,skipExport:true}]})),records:[{id:'r1',target:'copy'}],docName:'copy.csv',docFingerprint:'doc-hash',sourceDocument:{rawText:'copy'},fileIndex:1,layerIndex:0,chosen:'r1',checked:true,comparing:{old:true},settings:{apiMode:'local'}};}
test('removing a different source preserves the active source and its edits',()=>{
 const state=fixture(),selected=state.files[1],records=state.records;
 assert.equal(removeImportedFile(state,0),true);assert.equal(state.fileIndex,0);assert.equal(state.files[0],selected);assert.equal(state.chosen,'r1');assert.equal(state.records,records);assert.equal(selected.layers[0].customText,'manual text');assert.equal(state.checked,false);assert.equal(state.comparing,undefined);
});
test('removing selected source chooses the nearest survivor and removes stale layer selection',()=>{
 const state=fixture();state.layerIndex=10;state.chosen='obsolete';state.files[2].layers[0].recordId='r3';
 assert.equal(removeImportedFile(state,1),true);assert.equal(state.fileIndex,1);assert.equal(state.layerIndex,0);assert.equal(state.chosen,'r3');
 removeImportedFile(state,1);assert.equal(state.fileIndex,0);assert.equal(state.chosen,'r1');removeImportedFile(state,0);assert.equal(state.files.length,0);assert.equal(state.chosen,null);assert.equal(state.fileIndex,0);assert.equal(state.layerIndex,0);
});
test('invalid removals are inert and cannot remove the final file via negative index',()=>{
 const state=fixture(),before=JSON.stringify(state);for(const index of [-1,3,NaN,undefined,'1',1.5])assert.equal(removeImportedFile(state,index),false);assert.equal(JSON.stringify(state),before);
});
test('clear all source imports retains the independent document and settings',()=>{
 const state=fixture(),document=state.sourceDocument,records=state.records,settings=state.settings,detached=state.files[0],before=JSON.stringify(detached);
 assert.equal(clearImportedFiles(state),true);assert.equal(state.files.length,0);assert.equal(state.records,records);assert.equal(state.sourceDocument,document);assert.equal(state.settings,settings);assert.equal(state.docFingerprint,'doc-hash');assert.equal(state.chosen,null);assert.equal(JSON.stringify(detached),before);assert.equal(clearImportedFiles(state),false);
});
test('clear document removes all replacement bindings, overrides and container edits while retaining PSD imports',()=>{
 const state=fixture(),files=state.files,position=files[0].layers[0].position,manual=files[0].layers[0].manual;
 assert.equal(clearImportedDocument(state),true);assert.equal(state.files,files);assert.equal(state.records.length,0);assert.equal(state.docName,'');assert.equal(state.docFingerprint,'');assert.equal(state.sourceDocument,null);assert.equal(state.chosen,null);assert.equal(state.checked,false);
 for(const file of state.files){assert.equal(file.containerEdits,undefined);assert.ok(file.preview.startsWith('original-'));for(const layer of file.layers){assert.equal(layer.recordId,null);assert.equal(layer.suggestedId,null);assert.equal(layer.customText,undefined);assert.equal(layer.transformSelected,undefined);assert.equal(layer.skipExport,true);assert.equal(layer.containerId,9);}}
 assert.equal(files[0].layers[0].position,position);assert.equal(files[0].layers[0].manual,manual);assert.equal(clearImportedDocument(state),false);
});
test('clear document handles image-only sources and cleans orphan replacement bindings',()=>{
 const state=fixture();state.files.push({path:'art.psb'});state.records=[];state.docName='';state.docFingerprint='';state.sourceDocument=null;
 assert.equal(clearImportedDocument(state),true);assert.equal(state.files[0].layers[0].recordId,null);assert.equal(state.files.length,4);assert.equal(clearImportedDocument(state),false);
});
