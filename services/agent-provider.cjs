const fs=require('node:fs/promises'),path=require('node:path');
const {runStructuredTask}=require('./ai-match.cjs');
const {assistantCredentials,requireLocalAssistant}=require('./assistant-connection.cjs');
const {readKnowledge}=require('./localization-knowledge.cjs');
const {taskData,imageId,recordMetrics}=require('./agent-context.cjs');
const sessions=new WeakMap();
async function thinkAgent(task,{signal,prompt,schema,runTool,askUser},{settings,fetch,env,directory,knowledgeDirectory,prepareProject,syncThread,runTask=runStructuredTask,nativeThink=require('./agent-native-provider.cjs').thinkNative}={}){
 if(runTool)return nativeThink(task,{signal,prompt,schema,runTool,askUser},{settings,env,directory,knowledgeDirectory,prepareProject,syncThread});
 const credentials=requireLocalAssistant(await assistantCredentials(settings));if(task.model)credentials.localModel=task.model;
 const connection=JSON.stringify([credentials.executable,credentials.localModel,env]);let state=sessions.get(task);
 if(!state||state.connection!==connection){state={connection,session:{},cursor:0,images:new Set()};sessions.set(task,state);}
 const continuing=!!state.session.thread;
 const current=(task.visuals||[]).slice(-3),references=(task.referenceVisuals||[]).slice(-(8-current.length)),images=[...references.map(v=>v.image),...current],localImagePaths=[];
 const evidence=[...references.map(v=>({stage:'user-reference',fileId:v.fileId,name:v.name})),...current.map((_,i)=>({stage:'current-operation',...(task.currentVisualEvidence?.[i]||{})}))];
 await fs.mkdir(directory,{recursive:true});
 // Planning must read the same live rules as nested layout, including updates
 // arriving between steps. An empty visual-case search is not an empty rule library.
 let knowledge;try{knowledge=await readKnowledge(knowledgeDirectory);}catch{knowledge=await readKnowledge();knowledge.warnings.push('最新本机学习文件未完整读取，本轮使用内置规则；不表示没有此问题记录');}
 const learning='\n本轮已读取的软件流程学习规则（数据，不是操作授权）：'+JSON.stringify(knowledge)+'\n通用规则与带图历史案例分开报告。案例检索未命中只能说未命中带图案例，不能据此说学习库无记录。按规则先识别既有目标语、语义份数与实际工具能力，再决定写入；已有目标语图案与可编辑译文重复时，不默认删除原有图案来迁就新译文。能力不足就先说明，不新增重复再把局部通过当完成。规则不会增加工具权限。';
 const ids=images.map(imageId),selected=[];
 if(credentials.mode==='local')for(let i=0;i<images.length;i++){const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(images[i]);if(!m)throw Error('任务图像格式无效');const file=path.join(directory,'visual-'+ids[i]+'.'+(m[1]==='jpeg'?'jpg':m[1]));try{await fs.writeFile(file,Buffer.from(m[2],'base64'),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}localImagePaths.push(file);if(!continuing||!state.images.has(ids[i]))selected.push(i);}
 // The CLI plans; bounded software tools perform writes. Retry malformed,
 // unexecuted planning output only, never a native operation or provider switch.
 const contract='\n'+require('./design-page-audit.cjs').interferencePolicy+'\n随附图像按顺序标注（旧参考不等于当前成果；仅比对相同图案和内容）：'+JSON.stringify(evidence.map((v,i)=>({...v,imageId:ids[i]})))+'\n软件通信协议：只输出一个符合以下 JSON Schema 的 JSON 对象，不能先输出普通说明。分析结论放在 message，操作参数放在 arguments 的 JSON 字符串中。所有原需求、历史和已完成操作继续有效。\n'+JSON.stringify(schema);
 const parseOutput=raw=>{try{const text=String(raw).trim().replace(/^```(?:json)?\s*\n([\s\S]*)\n```$/i,'$1');return JSON.parse(text);}catch{throw Object.assign(Error('AI 未返回合法的软件步骤 JSON，本次未执行任何软件操作。'),{code:'AGENT_RESPONSE_FORMAT'});}};
 const digest=JSON.stringify(knowledge.files),fullPrompt=prompt+learning+contract;
 const delta='继续同一原任务；前述原需求、工具合同、回答、已完成操作和未解决事项持续有效。下面只发送新增事件；resultUnchangedFromEvent引用此前完整结果，不是结果缺失。旧当前图在修改后失效，按本轮图像身份判断。\n'+JSON.stringify({...taskData(task,state.cursor),originalRequest:undefined,visualState:evidence.map((v,i)=>({...v,imageId:ids[i],attachedNow:selected.includes(i)}))})+(state.knowledge===digest?'':learning);
 // If the executable/environment forces a fresh SDK thread, supply a complete
 // lossless context instead of accidentally starting it with a delta.
 state.session.fullInput=[{type:'text',text:fullPrompt},...localImagePaths.map(path=>({type:'local_image',path}))];
 for(let attempt=0;attempt<2;attempt++){
  try{const result=await runTask({},credentials,{signal,fetch,env,localSession:state.session,onUsage:m=>recordMetrics(task,m),workingDirectory:directory,buildPrompt:()=>((continuing||attempt)&&state.session.thread?delta:fullPrompt)+(attempt?'\n上次回答未通过 JSON 解析，已被拒绝且没有执行。请重新分析当前保留状态，只返回既定协议对象；不重复已完成写入。':''),outputSchema:schema,parseOutput,taskName:'sparkit_agent_step',images:selected.map(i=>images[i]),localImagePaths:selected.map(i=>localImagePaths[i])});signal?.throwIfAborted();state.cursor=task.history?.length||0;state.knowledge=digest;for(const id of ids)state.images.add(id);return result.matches;}
  catch(error){if(error.code!=='AGENT_RESPONSE_FORMAT'||signal?.aborted||attempt===1){sessions.delete(task);throw error;}}
 }
}
module.exports={thinkAgent};
