const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {assistantCredentials}=require('./assistant-connection.cjs');
const {AgentTask}=require('./agent-task.cjs'),{thinkAgent}=require('./agent-provider.cjs');
const {recordMetrics}=require('./agent-context.cjs');
const {readKnowledge}=require('./localization-knowledge.cjs');
function installAgent({ipcMain,dialog,window:windowFn,dataDirectory,settings,fetch,localEnv,guard,isBusy,importWorkbook,runPhotoshop,safe,cancelAi=()=>{},think=thinkAgent,listModels=require('./agent-models.cjs').listLocalModels}={}){
 const attached=require('./agent-attachments.cjs').createAttachments(),rpcs=new Map();let selectedOutput='',agent;
 const projectStore=new (require('./agent-project.cjs').AgentProject)(dataDirectory());
 const exportOnce=require('./agent-export-cache.cjs').createExportCache(runPhotoshop);
 const deliveryResults=new Map();
 async function requireOutput(candidate){if(!candidate||!path.isAbsolute(candidate))throw Error('请先选择输出位置，再开始任务');let stat;try{stat=await fs.stat(candidate);await fs.access(candidate,require('node:fs').constants.W_OK);}catch{throw Error('输出位置不存在或不可写，请重新选择后开始任务');}if(!stat.isDirectory())throw Error('输出位置不是文件夹，请重新选择');return candidate;}
 const notify=s=>windowFn()?.webContents.send('agent-state',s);
 const renderer=(tool,args,task)=>new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timeout=setTimeout(()=>{rpcs.delete(id);reject(Object.assign(Error('软件操作未返回，不能确定执行结果。请检查 Adobe 与输出文件，勿盲目重试。'),{uncertain:true}));},30*60*1000);rpcs.set(id,{resolve,reject,timeout,taskId:task.id});windowFn()?.webContents.send('agent-command',{id,taskId:task.id,tool,args,model:task.model});});
 const file=(id,task)=>attached.get(id,task);
 async function execute(tool,args,{task,progress}){
  if(tool==='read_batch'){
   const allowed=['workspace','attachments','list_folder','read_document','artwork_objects'];
   if(!Array.isArray(args.queries)||!args.queries.length||args.queries.length>4||args.queries.some(q=>!q||!allowed.includes(q.tool)||!q.arguments||typeof q.arguments!=='object'||Array.isArray(q.arguments)))throw Error('批量检查只允许1至4项只读数据查询，不能包含改字、预览或导出');
   for(const q of args.queries)if(q.tool==='read_document'&&/\.(png|jpe?g|webp)$/i.test((await file(q.arguments.fileId,task)).path))throw Error('参考图片请单独read_document，批量检查仅处理文字和结构数据');
   const items=[];for(const q of args.queries){try{items.push({tool:q.tool,arguments:q.arguments,result:await execute(q.tool,q.arguments,{task,progress})});}catch(e){items.push({tool:q.tool,arguments:q.arguments,error:String(e.message||e).slice(0,6000)});}}return {items,failed:items.filter(i=>i.error).length};
  }
  if(tool==='attachments')return task.files;
  if(tool==='list_folder')return attached.list(args,task);
  if(['read_document','import_source','import_document'].includes(tool)){
   const f=await file(args.fileId,task);if(f.type==='folder')throw Error('请先用 list_folder 查看文件夹，再选择其中的文件');
   if(tool==='import_source'){if(!/\.(ai|psd|psb)$/i.test(f.path))throw Error('请选择 AI/PSD/PSB 原稿');return renderer(tool,{path:f.path},task);}
   if(tool==='import_document')return renderer(tool,{path:f.path,selection:args.selection,attachmentIdentity:JSON.stringify([f.id,f.bytes,f.mtimeMs]),replaceExisting:args.replaceExisting===true},task);
   if(/\.(png|jpe?g|webp)$/i.test(f.path)){if(f.bytes>8*1024*1024)throw Error('参考图大于 8 MB，请提供较小预览图');const ext=path.extname(f.path).slice(1).replace('jpg','jpeg');return {name:f.name,images:['data:image/'+ext+';base64,'+(await fs.readFile(f.path)).toString('base64')]};}
   if(/\.xlsx$/i.test(f.path))return importWorkbook(f.path,args.sheet?{page:{sheet:args.sheet,rowStart:args.rowStart,rowEnd:args.rowEnd}}:{});
   if(/\.(ai|psd|psb)$/i.test(f.path))throw Error('原稿请使用 import_source 后查看 workspace 和 preview，不能把大型源文件当文本上传');
   if(!/\.(txt|csv|tsv|docx|json)$/i.test(f.path)||f.bytes>20*1024*1024)throw Error('该文件暂不支持直接解析，请添加 TXT/DOCX/XLSX 或预览图片');
   const b=await fs.readFile(f.path),text=/\.docx$/i.test(f.path)?await require('../document-reader.cjs').readDocxText(b):b.toString('utf8');if(text.length>120000)throw Error('文档内容过长，请按任务拆分文档');return {name:f.name,text};
  }
  if(tool==='export_files'){if(!task.outputDirectory)throw Error('未选择输出目录，请让用户点击蒙版中的“选择输出位置”');}
  return renderer(tool,args,task);
 }
 const get=()=>agent||(agent=new AgentTask({directory:path.join(dataDirectory(),'agent-tasks'),notify,execute,think:async(task,deps)=>{guard();if(task.mode!=='local')throw Error('此旧任务使用 API，请新建本机 Codex 任务');await requireOutput(task.outputDirectory);const env=await localEnv();return think(task,deps,{settings:settings(),fetch,env,prepareProject:(session,project)=>projectStore.prepare(session,project),knowledgeDirectory:path.join(dataDirectory(),'localization-knowledge','library'),directory:path.join(dataDirectory(),'agent-context',task.id)});}}));
 ipcMain.on('agent-command-result',(event,result)=>{if(event.sender!==windowFn()?.webContents)return;const p=rpcs.get(result?.id);if(!p||p.taskId!==get().current?.id)return;clearTimeout(p.timeout);rpcs.delete(result.id);result.ok?p.resolve(result.value):p.reject(Error(String(result.error||'软件操作失败')));});
 const handle=(name,fn)=>ipcMain.handle(name,safe(fn));
 handle('agent-project',()=>projectStore.get());
 handle('agent-project-save',async input=>{if(get().active()||get().executing)throw Error('请等待当前任务结束后修改项目设置');return projectStore.save(input);});
 handle('agent-project-folder',async()=>{if(get().active())throw Error('请等待当前任务结束后修改项目设置');const r=await dialog.showOpenDialog(windowFn(),{title:'选择 Codex 项目所在的盘位和文件夹',properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];});
 handle('agent-state',()=>get().public());
 handle('agent-cache-context',async()=>{const t=get().current;if(!get().active())return null;const knowledge=await readKnowledge(path.join(dataDirectory(),'localization-knowledge','library'));return {taskId:t.id,revision:t.revision,model:t.model||(await settings().get()).localModel,knowledge:knowledge.files,warnings:knowledge.warnings};});
 handle('agent-files',async input=>{
  if(input?.paths&&(!Array.isArray(input.paths)||input.paths.some(p=>typeof p!=='string'||!path.isAbsolute(p))))throw Error('附加文件路径无效');
  const folder=input?.kind==='folder',r=input?.paths?{canceled:false,filePaths:input.paths}:await dialog.showOpenDialog(windowFn(),folder?{title:'添加任务文件夹（仅引用路径，按需读取）',properties:['openDirectory','multiSelections']}:{title:'添加任务文件（原稿、翻译表、需求文档或参考图）',properties:['openFile','multiSelections'],filters:[{name:'任务文件',extensions:['ai','psd','psb','xlsx','docx','csv','tsv','txt','json','png','jpg','jpeg','webp']}]});
  if(r.canceled)return [];if(r.filePaths.length>24)throw Error('一次最多添加 24 个文件或文件夹');
  const list=[];for(const p of r.filePaths)list.push(await attached.register(p));
  if(get().active()){const added=list.filter(f=>!get().current.files.some(x=>x.id===f.id));if(get().current.files.length+added.length>24)throw Error('每个任务最多附加 24 个文件或文件夹');get().current.files.push(...added);if(added.length)get().supplement('用户在任务中追加了文件或文件夹路径，请结合原任务按需查看：'+added.map(f=>f.path+' (fileId='+f.id+')').join('、'));}return list;
 });
 handle('agent-output',async()=>{const r=await dialog.showOpenDialog(windowFn(),{title:'选择接管任务输出位置（每个任务创建新文件夹）',properties:['openDirectory','createDirectory']});if(r.canceled)return null;selectedOutput=await requireOutput(r.filePaths[0]);if(get().active()){get().current.outputDirectory=selectedOutput;get().supplement('用户已选择新的输出位置。后续导出请使用该位置的新任务文件夹，不覆盖原稿。');}return selectedOutput;});
 handle('agent-models',async()=>{const c=await assistantCredentials(settings());const result=await listModels(c);return {...result,mode:'local',connectionKey:['local',c.executable,c.localModel].join('|'),selected:c.localModel};});
 handle('agent-start',async input=>{guard();if(isBusy())throw Error('请等待当前 AI 或 Adobe 任务结束');const outputDirectory=await requireOutput(selectedOutput);const c=await assistantCredentials(settings());if(!Array.isArray(input?.fileIds)||input.fileIds.length>24)throw Error('任务附件无效');const files=[];for(const id of input.fileIds)files.push(await file(id));if(get().current)require('./agent-native-provider.cjs').closeNativeTask(get().current);return get().start({request:input.request,model:input.model||'',files,mode:c.mode,outputDirectory,codexProject:await projectStore.get()});});
 const interruptPlanningTool=()=>{if(['auto_bind','design_layout','export_files'].includes(get().current?.currentTool))cancelAi();};
 handle('agent-followup',async input=>{guard();if(isBusy()||get().active()||get().executing)throw Error('请等待当前 AI 或 Adobe 任务结束');const t=get().current;if(!t)throw Error('请先开始任务');const outputDirectory=await requireOutput(selectedOutput||t.outputDirectory);if(t.mode!=='local')throw Error('此旧任务使用 API，请新建本机 Codex 任务；历史及输出仍保留');if(!Array.isArray(input?.fileIds)||input.fileIds.length>24)throw Error('附件无效');const added=[];for(const id of input.fileIds)if(!t.files.some(f=>f.id===id))added.push(await file(id));if(t.files.length+added.length>24)throw Error('每个任务最多附加 24 份文件');t.files.push(...added);t.outputDirectory=outputDirectory;if(added.length)get().add('user_supplement',{text:'后续需求追加附件：'+added.map(f=>f.name+' (fileId='+f.id+')').join('、')});return get().followUp(input.text);});
 handle('agent-pause',()=>{const s=get().pause();interruptPlanningTool();return s;});handle('agent-resume',async()=>{if(get().current)await requireOutput(get().current.outputDirectory);return get().resume();});handle('agent-stop',()=>{const s=get().stop();interruptPlanningTool();return s;});handle('agent-supplement',text=>{const s=get().supplement(text);interruptPlanningTool();return s;});handle('agent-answer',value=>get().answer(value));
 // All writes still enter the original validated business path. The model never chooses an arbitrary output path.
 handle('agent-export',async plan=>{const t=get().current;if(!get().active()||!t.inTool||t.currentTool!=='export_files')throw Error('当前没有接管导出步骤');if(t.paused||t.stopping)throw Error('任务已暂停或终止，未开始导出');await requireOutput(t.outputDirectory);const dir=path.join(t.outputDirectory,'Sparkit-'+t.id);await fs.mkdir(dir,{recursive:true});const result=await exportOnce(t,plan,dir);deliveryResults.clear();for(const r of result.results||[])if(r.delivery?.verified&&!r.error)deliveryResults.set(r.output,{taskId:t.id,result:r});return result;});
 handle('agent-delivery-visual',async input=>{const t=get().current,entry=deliveryResults.get(input?.output);if(!get().active()||!t.inTool||t.currentTool!=='export_files'||t.paused||t.stopping||entry?.taskId!==t.id)throw Error('当前没有可审验的原生交付图');return require('../illustrator-delivery.cjs').deliveryVisual(entry.result,input);});
 handle('agent-tool-progress',value=>{if(get().current?.inTool)get().progress(value);return true;});
 return {analysisProvider:()=>{const t=get().current;if(!t?.nativeMode)return undefined;if(!t.analysisExchange)throw Error('当前直连工作步骤没有待交回的模型分析，未启动其他模型');return request=>t.analysisExchange.ask(request);},recordUsage:metric=>{if(get().active())recordMetrics(get().current,metric);},active:()=>get().active(),references(ids=[]){if(!get().active())return [];if(!Array.isArray(ids)||ids.length>3||new Set(ids).size!==ids.length)throw Error('参考图列表无效');return ids.map(id=>{const v=get().current.referenceVisuals?.find(v=>v.fileId===id);if(!v)throw Error('参考图尚未读取或已离开缓存，请重新read_document：'+id);const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(v.image);if(!m)throw Error('参考图格式无效');return {bytes:Buffer.from(m[2],'base64'),url:v.image,extension:m[1],metadata:{stage:'user-reference',fileId:id,name:v.name}};});},close(){if(get().current)require('./agent-native-provider.cjs').closeNativeTask(get().current);get().stop();for(const p of rpcs.values()){clearTimeout(p.timeout);p.reject(Error('软件窗口已关闭；请检查输出文件后再续做'));}rpcs.clear();return get().runPromise||get().pending;}};
}
module.exports={installAgent};
