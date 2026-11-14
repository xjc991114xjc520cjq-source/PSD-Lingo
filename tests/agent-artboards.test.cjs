const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createArtboardOperations}=require('../services/agent-artboards.cjs'),{hashFile}=require('../photoshop-file-io.cjs');
test('invalid output and verification before delivery stop before expensive native work',async()=>{
 let runs=0;const operate=createArtboardOperations({run:async()=>{runs++;return {boards:[{name:'One'}]};},directory:()=>'.',requireOutput:async()=>{throw Error('输出位置不可用');}}),input={source:{path:'fixture.psb',fingerprint:'h'},plan:{},action:'export'},task={id:'isolated'};
 await assert.rejects(operate(input,task),/输出位置/);assert.equal(runs,0);
 // Preview validates inputs before the view selection, so it establishes the
 // prepared cache even though this deliberately empty visual is invalid.
 await assert.rejects(operate({...input,action:'preview',boardName:'Missing'},task),/画板名称/);assert.equal(runs,1);
 await assert.rejects(operate({...input,action:'verify'},task),/尚未导出/);assert.equal(runs,1);
});
test('artboard export reuses native work without overwriting another result, verifies delivered bytes, and isolates tasks',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'artboard-export-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let nativeRuns=0;const source=path.join(dir,'source.psb');await fs.writeFile(source,'original');const sourceFingerprint=await hashFile(source);
 const run=async({source:s,prepared,directory})=>{assert.equal(await hashFile(s.path),s.fingerprint,'source fingerprint must still match');if(prepared)return {...prepared,reused:true};nativeRuns++;await fs.mkdir(directory,{recursive:true});const output=path.join(directory,'draft.psd'),image=path.join(directory,'board.jpg');await fs.writeFile(output,'editable output');await fs.writeFile(image,'proof bytes');return {output,fingerprint:await hashFile(output),format:'PSD',boards:[{name:'One',box:[0,0,100,100],image}],delivery:{verified:true,reopened:true}};};
 const operate=createArtboardOperations({run,directory:()=>path.join(dir,'cache'),requireOutput:async d=>assert.equal(d,dir)}),input={action:'export',source:{path:source,fingerprint:sourceFingerprint},plan:{documentName:'Named'}},task={id:'task-one',outputDirectory:dir};
 const first=await operate(input,task);assert.equal(nativeRuns,1);assert.equal(path.basename(first.output),'Named.psd');assert.equal(first.delivery.boards[0].image,first.boards[0].image);const repeat=await operate(input,task);assert.equal(repeat.reused,true);assert.equal(nativeRuns,1);assert.equal(repeat.output,first.output);assert.equal((await operate({...input,action:'verify'},task)).verified,true);
 await fs.writeFile(first.boards[0].image,'changed proof');await assert.rejects(operate({...input,action:'verify'},task),/交付文件已变化/);await assert.rejects(operate(input,task),/未覆盖/);assert.equal(await fs.readFile(first.boards[0].image,'utf8'),'changed proof');
 await assert.rejects(operate({...input,action:'verify'},{...task,id:'task-two'}),/缓存已失效/);const second=await operate(input,{...task,id:'task-two'});assert.equal(nativeRuns,2);assert.notEqual(second.output,first.output);await fs.writeFile(source,'source changed');await assert.rejects(operate(input,task),/source fingerprint/);
});
