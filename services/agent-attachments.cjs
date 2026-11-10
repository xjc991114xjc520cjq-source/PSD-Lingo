const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const supported=p=>/\.(ai|psd|psb|xlsx|docx|csv|tsv|txt|json|png|jpe?g|webp)$/i.test(p);
// Register paths only. Folder contents and file bytes are read on explicit tool requests.
function createAttachments(){
 const entries=new Map(),realPaths=new Map();
 async function register(p,rootId){
  if(typeof p!=='string'||!path.isAbsolute(p))throw Error('附加文件路径无效');
  const s=await fs.stat(p);if(!s.isFile()&&!s.isDirectory())throw Error('该路径不是普通文件或文件夹');
  if(s.isFile()&&!supported(p))throw Error('该附件格式暂不支持');
  const actual=await fs.realpath(p),type=s.isDirectory()?'folder':'file';
  const previous=[...entries.values()].find(f=>f.path===p&&f.rootId===rootId&&f.type===type&&(type==='folder'||f.bytes===s.size&&f.mtimeMs===s.mtimeMs));
  if(previous&&realPaths.get(previous.id)===actual)return previous;
  const f={id:crypto.randomUUID(),path:p,name:path.basename(p),type,bytes:type==='folder'?0:s.size,mtimeMs:s.mtimeMs,...(rootId?{rootId}:{})};entries.set(f.id,f);realPaths.set(f.id,actual);return f;
 }
 async function get(id,task){
  const f=entries.get(id);if(!f)throw Error('只能读取用户已附加的文件或文件夹');
  if(task&&!task.files.some(x=>x.id===(f.rootId||f.id)))throw Error('文件不属于本任务');
  const s=await fs.stat(f.path),actual=await fs.realpath(f.path);
  if(actual!==realPaths.get(id)||s.isDirectory()!==(f.type==='folder')||f.type!=='folder'&&(s.size!==f.bytes||s.mtimeMs!==f.mtimeMs))throw Error('附加文件已变化，请重新添加：'+f.name);
  if(f.rootId){const root=await get(f.rootId,task),relative=path.relative(await fs.realpath(root.path),actual);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('文件已移出用户选择的文件夹');}
  return f;
 }
 async function list({fileId,offset=0,limit=100},task){
  const folder=await get(fileId,task);if(folder.type!=='folder')throw Error('请选择文件夹附件');
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('目录分页参数无效，每次最多 100 项');
  const names=(await fs.readdir(folder.path,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  const items=[];for(const entry of names.slice(offset,offset+limit)){
   if(entry.isSymbolicLink()){items.push({name:entry.name,type:'link',readable:false});continue;}
   if(!entry.isDirectory()&&!entry.isFile()||entry.isFile()&&!supported(entry.name)){items.push({name:entry.name,type:entry.isFile()?'file':'other',readable:false});continue;}
   const f=await register(path.join(folder.path,entry.name),folder.rootId||folder.id);await get(f.id,task);items.push({...f,readable:true});
  }
  return {path:folder.path,items,total:names.length,offset,nextOffset:offset+limit<names.length?offset+limit:null};
 }
 return {register,get,list};
}
module.exports={createAttachments};
