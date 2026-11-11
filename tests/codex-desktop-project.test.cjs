const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {CodexDesktopProject,readRegistration}=require('../services/codex-desktop-project.cjs');
async function fixture(t){const home=await fs.mkdtemp(path.join(os.tmpdir(),'desktop-project-'));t.after(()=>fs.rm(home,{recursive:true,force:true}));const directory=path.join(home,'中文 & # + 任务');await fs.mkdir(directory);const file=path.join(home,'.codex-global-state.json');const state={
 'local-projects':{},'project-order':[],'app-server-project-id-by-legacy-project-id-by-host':{['local:'+home]:{}},unrelated:'preserve'
};const register=(legacy,backend,root=directory)=>{state['local-projects'][legacy]={id:legacy,name:'User renamed',rootPaths:[root]};state['project-order'].push(legacy);state['app-server-project-id-by-legacy-project-id-by-host']['local:'+home][legacy]=backend;};return {home,directory,file,state,register,save:()=>fs.writeFile(file,JSON.stringify(state))};}
test('first-time registration opens encoded official deep link once and waits for desktop-owned mapping',async t=>{
 const f=await fixture(t);await f.save();let opens=0,waits=0,status=0;
 const bridge=new CodexDesktopProject({open:async uri=>{opens++;const u=new URL(uri);assert.equal(u.protocol,'codex:');assert.equal(u.host,'threads');assert.equal(u.pathname,'/new');assert.deepEqual([...u.searchParams],[['path',f.directory]]);},wait:async()=>{waits++;f.register('desktop','backend');await f.save();}});
 assert.deepEqual(await bridge.ensure({...f,env:{CODEX_HOME:f.home},onStatus:()=>status++}),{projectId:'backend',desktopProjectId:'desktop'});assert.equal(opens,1);assert.equal(waits,1);assert.equal(status,1);
 const before=await fs.readFile(f.file,'utf8');assert.equal((await bridge.ensure({...f,env:{CODEX_HOME:f.home}})).projectId,'backend');assert.equal(opens,1);assert.equal(await fs.readFile(f.file,'utf8'),before);
});
test('desktop registry is authoritative over orphan IDs, wrong host maps, and matching names in other roots',async t=>{
 const f=await fixture(t);f.register('wrong-root','wrong',path.dirname(f.directory));f.register('first','first-backend');f.register('second','saved-backend');await f.save();
 assert.equal((await readRegistration(f.home,f.directory,'orphan')).projectId,'first-backend');assert.equal((await readRegistration(f.home,f.directory,'saved-backend')).projectId,'saved-backend');
 f.state['app-server-project-id-by-legacy-project-id-by-host']={['ssh:'+f.home]:{first:'remote'}};await f.save();assert.equal(await readRegistration(f.home,f.directory),null);
});
test('missing or partial registration never counts as success; malformed in-flight writes can recover',async t=>{
 const f=await fixture(t);assert.equal(await readRegistration(f.home,f.directory),null);f.register('legacy','backend');delete f.state['app-server-project-id-by-legacy-project-id-by-host']['local:'+f.home].legacy;await f.save();assert.equal(await readRegistration(f.home,f.directory),null);
 await fs.writeFile(f.file,'{');let waits=0;const bridge=new CodexDesktopProject({open:async()=>{},wait:async()=>{waits++;f.register('ready','ready-backend');await f.save();}});assert.equal((await bridge.ensure({...f,env:{CODEX_HOME:f.home}})).projectId,'ready-backend');assert.equal(waits,1);
});
test('timeout and missing protocol fail clearly, cancellation interrupts the first-run wait',async()=>{
 let tick=0,opens=0;const bridge=new CodexDesktopProject({read:async()=>null,open:async()=>opens++,wait:async ms=>tick+=ms,now:()=>tick,timeoutMs:10,pollMs:5});
 await assert.rejects(bridge.ensure({directory:path.resolve('.')}),/未创建对话或启动模型/);assert.equal(opens,1);
 bridge.open=async()=>{throw Error('No handler');};await assert.rejects(bridge.ensure({directory:path.resolve('.')}),/启用 codex:\/\//);
 const c=new AbortController();const cancelled=new CodexDesktopProject({read:async()=>null,open:async()=>{c.abort();}});await assert.rejects(cancelled.ensure({directory:path.resolve('.'),signal:c.signal}),{name:'AbortError'});
});
test('desktop thread receipt opens only the supplied persisted thread and rejects link injection',async()=>{
 const urls=[],bridge=new CodexDesktopProject({open:async uri=>urls.push(uri)}),id='01a1c979-1b55-71c0-8b67-7e2d4a14c3fc';
 await bridge.openThread(id);assert.deepEqual(urls,['codex://threads/'+id]);
 for(const bad of ['new?prompt=send','../settings','',undefined])await assert.rejects(bridge.openThread(bad),/编号无效/);
 assert.equal(urls.length,1);
});
