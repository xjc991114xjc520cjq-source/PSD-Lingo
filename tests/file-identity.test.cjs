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
