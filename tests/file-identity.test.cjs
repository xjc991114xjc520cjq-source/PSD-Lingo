const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fileKey}=require('../services/file-identity.cjs');
test('Windows paths fold case while APFS distinct names remain distinct',()=>{assert.equal(fileKey('C:/Data/A.psd','win32'),fileKey('c:/data/a.psd','win32'));assert.notEqual(fileKey('/tmp/A.psd','darwin'),fileKey('/tmp/a.psd','darwin'));});
test('native Mac template pool never reuses a case-distinct document',()=>{
 const existing={saved:true,fullName:{fsName:'/tmp/A.psd'}},opened=[];
 function File(p){this.fsName=p;this.exists=true;}
 const c=vm.createContext({$:{os:'Macintosh OS'},File,app:{documents:[existing],open:f=>{opened.push(f.fsName);return {fullName:f};}}});
 vm.runInContext(require('../sku-template-native.cjs').templatePoolNative,c);
 c.tplOpenTemplates([{templateFileId:'a',scanId:'s',template:{path:'/tmp/a.psd'}}],[]);assert.deepEqual(opened,['/tmp/a.psd']);
});
test('Mac template roots share one physical document and retain distinct template keys',()=>{
 const docs=[],closed=[],opened=[];
 function File(p){this.fsName=p;this.exists=true;}
 const c=vm.createContext({$:{os:'Macintosh OS'},File,app:{documents:docs,open:f=>{opened.push(f.fsName);const d={saved:true,fullName:f,close:()=>closed.push(f.fsName)};docs.push(d);return d;}},SaveOptions:{DONOTSAVECHANGES:0}});
 vm.runInContext(require('../sku-template-native.cjs').templatePoolNative,c);
 const pool=[];c.tplOpenTemplates(['gift','plain'].map(templateKey=>({templateKey,templateFileId:'same',scanId:'scan',template:{path:'/Volumes/中文 资料/Template.psd'}})),pool);
 assert.equal(opened.length,1);assert.equal(pool.length,2);for(const templateKey of ['gift','plain'])assert.equal(c.tplPoolDoc(pool,{templateKey,templateFileId:'same',scanId:'scan'}),docs[0]);
 assert.throws(()=>c.tplPoolDoc(pool,{templateKey:'foreign',templateFileId:'same',scanId:'scan'}),/路由/);c.tplCloseTemplates(pool);assert.equal(closed.length,1);
});
test('Mac background template validation does not accept case-distinct paths',{skip:process.platform!=='darwin'},()=>{
 const {validateBackgroundTemplates}=require('../services/sku-template-background-inputs.cjs');
 const entries=['gift','plain'].map(templateKey=>({templateKey,templateFileId:'same',scanId:'scan',template:{path:'/Volumes/中文 资料/A.psd',fingerprint:'hash'}}));
 validateBackgroundTemplates({templates:entries},entries);const foreign=structuredClone(entries);foreign[1].template.path='/Volumes/中文 资料/a.psd';assert.throws(()=>validateBackgroundTemplates({templates:entries},foreign),/完整模板清单/);
});
test('project binding preserves mixed case in its registered directory',async t=>{
 const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'Sparkit-MAC-Project-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const {AgentProject,rootOf}=require('../services/agent-project.cjs');
 const project=new AgentProject(directory,{desktop:{ensure:async()=>({projectId:'fixture'})}});
 const saved=await project.save({name:'MixedCase',parentDirectory:directory});
 const result=await project.prepare({request:async()=>({project:{id:'fixture',roots:[{path:rootOf(saved)}]}})},saved);
 assert.equal(result.directory,rootOf(saved));
});
test('Mac attachments preserve two case-distinct file identities',{skip:process.platform!=='darwin'},()=>{
 const {mergeAttachments}=require('../services/agent-attachments.cjs');
 assert.equal(mergeAttachments([{path:'/tmp/A.psd',id:'A'}],[{path:'/tmp/a.psd',id:'a'}]).length,2);
});
