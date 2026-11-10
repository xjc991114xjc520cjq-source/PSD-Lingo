const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {AgentProject,validateProject}=require('../services/agent-project.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agent-project-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,store:new AgentProject(dir)};}
test('project settings persist across restart and unchanged saves retain project identity',async t=>{
 const {dir,store}=await fixture(t);const initial=await store.save({name:'中文项目',parentDirectory:dir});let creates=0;
 const session={request:async(method,args)=>{if(method==='project/create'){creates++;return {project:{id:'persisted',roots:args.roots}};}assert.equal(method,'project/read');assert.equal(args.projectId,'persisted');return {project:{id:'persisted',name:'Manually renamed',roots:[{path:initial.directory}]}};}};
 const first=await store.prepare(session,initial);assert.equal(first.projectId,'persisted');assert.equal((await fs.stat(first.directory)).isDirectory(),true);
 const restarted=new AgentProject(dir),same=await restarted.save({name:initial.name,parentDirectory:dir});assert.equal(same.projectId,'persisted');assert.equal((await restarted.prepare(session,same)).projectId,'persisted');assert.equal(creates,1);
 const changed=await restarted.save({name:'第二项目',parentDirectory:dir});assert.notEqual(changed.key,first.key);assert.equal(changed.projectId,undefined);
 // Completing the old task cannot replace a manually changed destination.
 await restarted.prepare(session,first);assert.equal((await restarted.get()).name,'第二项目');
});
test('project failure, moved root or unsupported CLI never silently falls back to unassigned chat',async t=>{
 const {dir,store}=await fixture(t),p=await store.save({name:'Project',parentDirectory:dir});
 await assert.rejects(store.prepare({request:async()=>{throw Error('Unknown method');}},p),/未创建项目外对话/);
 await assert.rejects(store.prepare({request:async()=>({project:{id:'wrong',roots:[{path:path.dirname(dir)}]}})},p),/目录与已保存位置不同/);
 assert.equal((await store.get()).projectId,undefined);
});
test('stable idempotency survives an interrupted first creation without duplicate project request keys',async t=>{
 const {dir,store}=await fixture(t),keys=[];const session={request:async(_m,p)=>{keys.push(p.idempotencyKey);throw Error('Transport ended');}};
 for(const s of [store,new AgentProject(dir)])await assert.rejects(s.prepare(session,await s.get()));assert.equal(keys[0],keys[1]);
 const other=new AgentProject(path.join(dir,'another-profile'));assert.notEqual((await other.get()).key,(await store.get()).key);
});
test('project input rejects path traversal and invalid Windows names before filesystem mutation',()=>{
 for(const name of ['../escape','..','CON','bad/name','bad\\name','x.','x ',''])assert.throws(()=>validateProject({name,parentDirectory:path.resolve('.'),key:'test'}));
 assert.throws(()=>validateProject({name:'good',parentDirectory:'relative',key:'test'}));
});
