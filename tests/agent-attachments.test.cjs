const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createAttachments}=require('../services/agent-attachments.cjs');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agent-folder-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return {dir,store:createAttachments()};}
test('folder registration passes only a path, then discovers nested originals on demand',async t=>{
 const {dir,store}=await fixture(t);await fs.mkdir(path.join(dir,'nested'));const source=path.join(dir,'nested','source.ai');await fs.writeFile(source,'PRIVATE ARTWORK CONTENT');
 const root=await store.register(dir),task={files:[root]};assert.equal(root.type,'folder');assert.equal(root.bytes,0);assert.equal(JSON.stringify(root).includes('PRIVATE'),false);assert.equal(root.items,undefined);
 const first=await store.list({fileId:root.id},task);const nested=first.items[0];assert.equal(nested.type,'folder');const second=await store.list({fileId:nested.id},task);assert.equal(second.items[0].path,source);assert.equal(second.items[0].rootId,root.id);assert.equal((await store.get(second.items[0].id,task)).path,source);
 await assert.rejects(store.get(second.items[0].id,{files:[]}),/不属于本任务/);
});
test('directory contents stay fresh, changed files require fresh references, pagination is bounded',async t=>{
 const {dir,store}=await fixture(t),root=await store.register(dir),task={files:[root]};await fs.writeFile(path.join(dir,'a.txt'),'old');await fs.writeFile(path.join(dir,'b.txt'),'second');
 const page=await store.list({fileId:root.id,limit:1},task);assert.equal(page.total,2);assert.equal(page.nextOffset,1);assert.equal((await store.list({fileId:root.id,offset:1,limit:1},task)).items[0].name,'b.txt');
 await fs.writeFile(path.join(dir,'a.txt'),'updated content');await assert.rejects(store.get(page.items[0].id,task),/已变化/);assert.notEqual((await store.list({fileId:root.id},task)).items[0].id,page.items[0].id);
 await assert.rejects(store.list({fileId:root.id,limit:101},task),/分页/);
});
test('folder browsing does not follow junctions or grant unsupported binaries',async t=>{
 const {dir,store}=await fixture(t);await fs.mkdir(path.join(dir,'real'));await fs.symlink(path.join(dir,'real'),path.join(dir,'linked'),'junction');await fs.writeFile(path.join(dir,'unsafe.exe'),'binary');
 const root=await store.register(dir),list=await store.list({fileId:root.id},{files:[root]});for(const name of ['linked','unsafe.exe']){const entry=list.items.find(x=>x.name===name);assert.equal(entry.readable,false);assert.equal(entry.id,undefined);}
});

test('restart continuation restores original attachment and nested IDs without widening access',async t=>{
 const {dir,store}=await fixture(t);await fs.writeFile(path.join(dir,'copy.txt'),'Approved');const root=await store.register(dir),listing=await store.list({fileId:root.id},{files:[root]}),child=listing.items[0];const restarted=createAttachments();await restarted.restore([root],[{type:'tool_result',result:listing}]);assert.equal((await restarted.get(child.id,{files:[root]})).path,child.path);await assert.rejects(restarted.get(child.id,{files:[]}),/不属于/);
 await fs.writeFile(child.path,'Changed copy');await assert.rejects(createAttachments().restore([root],[{result:listing}]),/已变化/);
 const outside=path.join(path.dirname(dir),path.basename(dir)+'-outside.txt');await fs.writeFile(outside,'Outside');t.after(()=>fs.rm(outside,{force:true}));const stat=await fs.stat(outside);await assert.rejects(createAttachments().restore([root],[{id:'escape',path:outside,rootId:root.id,type:'file',bytes:stat.size,mtimeMs:stat.mtimeMs}]),/移出授权/);
});
