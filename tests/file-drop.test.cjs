const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const path=require('node:path');
const {buildSync}=require('esbuild');
const compiled=buildSync({entryPoints:[path.join(__dirname,'../renderer/file-drop.js')],bundle:true,format:'cjs',write:false,platform:'node'}).outputFiles[0].text;
const context={exports:{},module:{exports:{}},window:{desktop:{}}};context.exports=context.module.exports;
vm.runInNewContext(compiled,context);
const {bindFileDrop,preventFileNavigation}=context.module.exports;
class Surface{
 constructor(){this.listeners={};this.classes=new Set();this.classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};}
 addEventListener(name,callback){(this.listeners[name]??=new Set()).add(callback);}
 removeEventListener(name,callback){this.listeners[name]?.delete(callback);}
 async send(name,event){for(const callback of this.listeners[name]||[])await callback(event);}
}
function event(paths=['C:\\test.psd'],extra={}){
 return {prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},dataTransfer:{types:['Files'],files:paths.map(path=>({path})),items:[],...extra}};
}
function setup(options={}){
 const zone=new Surface(),calls=[],errors=[];
 const unbind=bindFileDrop(zone,{extensions:['psd','psb'],desktop:{getDroppedPaths:files=>files.map(file=>file.path)},onPaths:paths=>calls.push(Array.from(paths)),onError:message=>errors.push(message),...options});
 return {zone,calls,errors,unbind};
}

test('assistant can forward mixed folder and file paths without reading directory contents',async()=>{
 const f=setup({multiple:true,allowDirectories:true});await f.zone.send('drop',event(['C:\\Project.folder','C:\\copy.txt'],{items:[{kind:'file',webkitGetAsEntry:()=>({isDirectory:true})}]}));
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.calls,[['C:\\Project.folder','C:\\copy.txt']]);
});
test('drop consumer receives the original input target for question and supplement attachment handling',async()=>{
 const target={id:'agentAnswer-folder'};let received;const f=setup({onPaths:(paths,context)=>{received={paths:Array.from(paths),target:context.target};}});const e=event();e.target=target;await f.zone.send('drop',e);assert.equal(received.target,target);assert.deepEqual(received.paths,['C:\\test.psd']);
});
test('nested file drags keep highlight until last leave and accept case-insensitive paths',async()=>{
 const {zone,calls,errors}=setup();
 await zone.send('dragenter',event());await zone.send('dragenter',event());
 await zone.send('dragleave',event());assert.equal(zone.classes.has('drop-active'),true);
 const over=event();await zone.send('dragover',over);assert.equal(over.dataTransfer.dropEffect,'copy');
 await zone.send('drop',event(['C:\\图稿.PSB']));
 assert.deepEqual(calls,[['C:\\图稿.PSB']]);assert.deepEqual(errors,[]);assert.equal(zone.classes.has('drop-active'),false);
});
test('wrong extension rejects entire multiple drop, single zones reject multiple files',async()=>{
 const multi=setup({multiple:true});await multi.zone.send('drop',event(['C:\\a.psd','C:\\a.txt']));assert.equal(multi.calls.length,0);assert.match(multi.errors[0],/仅支持/);
 const single=setup();await single.zone.send('drop',event(['C:\\a.psd','C:\\b.psb']));assert.equal(single.calls.length,0);assert.match(single.errors[0],/一个文件/);
 await multi.zone.send('drop',event(['C:\\a.psd','C:\\b.psb']));assert.equal(multi.calls[0].length,2);
});
test('folders and inaccessible paths provide errors without loading',async()=>{
 const folder=setup();await folder.zone.send('drop',event(['C:\\folder.psd'],{items:[{kind:'file',webkitGetAsEntry:()=>({isDirectory:true})}]}));assert.match(folder.errors[0],/文件夹/);assert.equal(folder.calls.length,0);
 const missing=setup({desktop:{getDroppedPaths:()=>['']}});await missing.zone.send('drop',event());assert.match(missing.errors[0],/文件路径/);assert.equal(missing.calls.length,0);
});
test('busy and in-flight operations reject duplicate drops and recover after failure',async()=>{
 const busy=setup({isBusy:()=>true});await busy.zone.send('dragenter',event());assert.equal(busy.zone.classes.size,0);await busy.zone.send('drop',event());assert.match(busy.errors[0],/等待/);assert.equal(busy.calls.length,0);
 let finish,count=0;const pending=setup({onPaths:()=>{count++;return new Promise(resolve=>{finish=resolve;});}});
 const first=pending.zone.send('drop',event());await pending.zone.send('drop',event());assert.equal(count,1);assert.match(pending.errors[0],/等待/);finish();await first;
 const failing=setup({onPaths:()=>{throw new Error('测试错误');}});await failing.zone.send('drop',event());await failing.zone.send('drop',event());assert.deepEqual(failing.errors,['测试错误','测试错误']);
});
test('text drags remain untouched; global file guard and listener cleanup work',async()=>{
 const {zone,unbind}=setup(),document=new Surface(),remove=preventFileNavigation(document);
 const text=event([],{types:['text/plain']});await zone.send('dragenter',text);await zone.send('drop',text);await document.send('drop',text);assert.equal(text.prevented,false);assert.equal(text.stopped,false);
 const file=event();await document.send('dragover',file);assert.equal(file.prevented,true);
 remove();const after=event();await document.send('drop',after);assert.equal(after.prevented,false);
 await zone.send('dragenter',event());unbind();assert.equal(zone.classes.size,0);assert.equal([...Object.values(zone.listeners)].every(listeners=>listeners.size===0),true);
});
