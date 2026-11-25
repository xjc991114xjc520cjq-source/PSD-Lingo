const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {AgentProject,validateProject}=require('../services/agent-project.cjs');
test('embedded Codex binds the chosen task directory without fabricating desktop membership',async t=>{
 const {dir,store,desktop}=await fixture(t),saved=await store.save({name:'Embedded',parentDirectory:dir});
 desktop.ensure=()=>assert.fail('Embedded runtime must not require desktop registration');
 await store.write({...saved,projectId:'existing-desktop'});
 const p=await store.prepare({request:()=>assert.fail()},await store.get(),{embedded:true});
 assert.equal(p.directory,saved.directory);assert.equal(p.binding,'embedded');assert.equal(p.projectId,undefined);assert.equal((await store.get()).projectId,'existing-desktop');
});
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agent-project-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));let id='desktop';const desktop={ensure:async()=>({projectId:id})};return {dir,store:new AgentProject(dir,{desktop}),desktop,setId:v=>id=v};}
test('registered desktop identity persists; unchanged settings reuse it and old task cannot overwrite new settings',async t=>{
 const {dir,store,desktop}=await fixture(t),initial=await store.save({name:'中文项目',parentDirectory:dir});let reads=0;
 const session={request:async(method,args)=>{reads++;assert.equal(method,'project/read');assert.equal(args.projectId,'desktop');return {project:{id:'desktop',name:'Manually renamed',roots:[{path:initial.directory}]}};}};
 const first=await store.prepare(session,initial);assert.equal(first.projectId,'desktop');assert.equal((await fs.stat(first.directory)).isDirectory(),true);
 const restarted=new AgentProject(dir,{desktop}),same=await restarted.save({name:initial.name,parentDirectory:dir});assert.equal(same.projectId,'desktop');await restarted.prepare(session,same);assert.equal(reads,2);
 const changed=await restarted.save({name:'第二项目',parentDirectory:dir});assert.notEqual(changed.key,first.key);assert.equal(changed.projectId,undefined);
 await restarted.prepare(session,first);assert.equal((await restarted.get()).name,'第二项目');
});
test('desktop failure, backend mismatch and moved roots block before any conversation or model call',async t=>{
 const {dir,store,desktop}=await fixture(t),p=await store.save({name:'Project',parentDirectory:dir});
 desktop.ensure=async()=>{throw Error('Registration timed out');};await assert.rejects(store.prepare({request:()=>assert.fail()},p),/未创建项目外对话/);
 desktop.ensure=async()=>({projectId:'desktop'});
 await assert.rejects(store.prepare({request:async()=>({project:{id:'other',roots:[{path:p.directory}]}})},p),/编号不一致/);
 await assert.rejects(store.prepare({request:async()=>({project:{id:'desktop',roots:[{path:path.dirname(dir)}]}})},p),/目录与已保存位置不同/);
 assert.equal((await store.get()).projectId,undefined);
});
test('desktop-registered project wins over saved orphan backend id without project creation',async t=>{
 const {dir,store,desktop}=await fixture(t),p=await store.save({name:'Task conversations',parentDirectory:dir});await store.write({...p,projectId:'orphan'});
 desktop.ensure=async options=>{assert.equal(options.projectId,'orphan');return {projectId:'real-desktop'};};
 const result=await store.prepare({request:async(method,args)=>{assert.equal(method,'project/read');assert.equal(args.projectId,'real-desktop');return {project:{id:'real-desktop',roots:[{path:p.directory}]}};}},await store.get());assert.equal(result.projectId,'real-desktop');assert.equal((await store.get()).projectId,'real-desktop');
});
test('cancelled registration never starts project reads or overwrites saved identity',async t=>{
 const {dir,store,desktop}=await fixture(t),p=await store.save({name:'Task',parentDirectory:dir}),controller=new AbortController();
 desktop.ensure=async()=>{controller.abort();return {projectId:'desktop'};};await assert.rejects(store.prepare({request:()=>assert.fail()},p,{signal:controller.signal}));assert.equal((await store.get()).projectId,undefined);
});
test('project input rejects path traversal and invalid Windows names before filesystem mutation',()=>{
 for(const name of ['../escape','..','CON','bad/name','bad\\name','x.','x ',''])assert.throws(()=>validateProject({name,parentDirectory:path.resolve('.'),key:'test'}));
 assert.throws(()=>validateProject({name:'good',parentDirectory:'relative',key:'test'}));
});
