const {test}=require('node:test'),assert=require('node:assert/strict');
const {createScriptQueue,bridgeError}=require('../services/illustrator-connection.cjs');
test('native scripts are serialized and a failed script does not poison the queue',async()=>{
 const run=createScriptQueue(),events=[];let release;const first=run(async()=>{events.push('first');await new Promise(r=>release=r);throw Error('busy');});const rejected=assert.rejects(first,/busy/);const second=run(async()=>events.push('second'));await Promise.resolve();assert.deepEqual(events,['first']);release();await rejected;await second;assert.deepEqual(events,['first','second']);
});
test('connection failures distinguish unsubmitted script from an unknown dispatched result',()=>{
 const before=bridgeError('preflight RPC failed',20),after=bridgeError('script RPC failed',21);assert.equal(before.uncertain,false);assert.equal(before.nativePhase,'preflight');assert.equal(after.uncertain,true);assert.equal(after.nativePhase,'script');
});
test('unknown Illustrator write preserves output and prevents later files from starting',async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module'),{EventEmitter}=require('node:events');
 const root=await fs.mkdtemp(path.join(process.env.TEMP||require('node:os').tmpdir(),'ai-uncertain-')),input=path.join(root,'source.ai'),output=path.join(root,'exports/source-localized.ai');await fs.writeFile(input,'fixture');const local=createRequire(path.resolve(__dirname,'../illustrator.cjs'));let calls=0;
 const mod={exports:{}};vm.runInNewContext(await fs.readFile(path.resolve(__dirname,'../illustrator.cjs'),'utf8'),{Buffer,module:mod,exports:mod.exports,__dirname:path.resolve(__dirname,'..'),require:name=>name==='node:child_process'?{spawn:()=>{calls++;const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();setImmediate(async()=>{await fs.writeFile(output,'saved before communication failed');child.stderr.emit('data',Buffer.from('RPC response lost'));child.emit('close',21);});return child;}}:name==='./core.cjs'?{validatePlan:p=>p}:local(name)});
 const plan={files:[{path:input,name:'source.ai',jobs:[{previewLayout:{}}]},{path:input,name:'later.ai',jobs:[{previewLayout:{}}]}]};
 try{const results=await mod.exports.runPlan(path.join(root,'job'),plan,path.join(root,'exports'));assert.equal(calls,1);assert.equal(results[0].uncertain,true);assert.equal(results[0].pendingOutput,output);assert.equal(await fs.readFile(output,'utf8'),'saved before communication failed');assert.equal(results[1].status,'未执行');}finally{await fs.rm(root,{recursive:true,force:true});}
});
