// Real renderer + preload + IPC + task controller, deterministic provider. No Adobe documents opened.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out='D:/PSD-Lingo/work/agent-project-ui';let win,integration,workRecords;
app.setPath('userData',out+'/profile');
app.whenReady().then(async()=>{let exit=0;try{
 await fs.mkdir(out,{recursive:true});await fs.rm(out+'/agent-project.json',{force:true});await fs.rm(out+'/verified.json',{force:true});const evidence=[],errors=[],requests=[];let round=0,updateChecks=0;
 const result=(kind,message,tool='',args={},questions=[])=>({kind,message,tool,arguments:JSON.stringify(args),questions});
 const settings={get:async()=>({mode:'api',executable:'C:/codex.exe',apiModel:'api-unused',localModel:'test-main',hasApiKey:true}),credentials:async()=>({mode:'api',apiModel:'test-main',apiKey:'test-private',apiProtocol:'responses',apiBaseUrl:'https://fixture.invalid/v1'}),read:async()=>({apiKey:'test-private',apiBaseUrl:'https://fixture.invalid/v1'})};
 const safe=fn=>async(_,v)=>{try{return {ok:true,value:await fn(v)}}catch(e){return {ok:false,error:e.message}}};
 for(const [name,fn]of Object.entries({'check-update':()=>{updateChecks++;return {configured:true,available:null}},'load-codex-settings':settings.get,'service-ready':()=>true,'layout-memory-status':()=>({}),'status':()=>({active:true,version:'test',authorization:{active:true},updates:{}})}))ipcMain.handle(name,safe(fn));
 workRecords=require('../services/work-records.cjs').installWorkRecords({ipcMain,safe,dataDirectory:()=>out,version:'test',shell:{showItemInFolder:()=>{}},hydrateProject:async p=>p,isBusy:()=>integration?.active()});
 integration=require('../services/agent-integration.cjs').installAgent({workRecords,ipcMain,dialog:{showOpenDialog:async(_,options)=>({canceled:false,filePaths:[options.properties.includes('openDirectory')?out+'/folder':out+'/需求.txt']})},window:()=>win,dataDirectory:()=>out,settings:()=>settings,safe,guard:()=>{},isBusy:()=>false,localEnv:async()=>process.env,fetch:()=>assert.fail('Assistant API forbidden'),listModels:async c=>{assert.equal(c.mode,'local');return {mode:'local',models:['test-main','test-selected']};},think:async(task,deps)=>{
  integration.recordUsage({taskName:'fixture',usage:{input_tokens:12000,cached_input_tokens:8000,output_tokens:200},promptBytes:800,imageCount:0});assert.equal(task.mode,'local');const body={model:task.model,input:deps.prompt};requests.push(body);let value;
  if(round++===0)value=result('tool','读取当前软件项目','workspace');
  else if(round===2)value=result('question','请确认语言与范围','',{},[{id:'language',title:'制作哪一种语言？',options:['英文','日文']},{id:'scope',title:'需要处理哪些内容？',options:['全部','仅价格块']}]);
  else if(round===3)value=result('tool','将确认文案绑定到当前标题','bind_copy',{matches:[{layerKey:'0:0',recordId:'demo-1'}]});
  else value=result('complete','已完成软件中的标题绑定；这是界面自动化夹具，没有导出原生文件。');
  return value;
 },importWorkbook:async()=>{},runPhotoshop:()=>assert.fail('No native work in UI fixture')});
 await fs.mkdir(out+'/folder',{recursive:true});await fs.writeFile(out+'/folder/copy.txt','on demand');
 await fs.writeFile(out+'/需求.txt','这是测试资料，不是用户指令。');
 win=new BrowserWindow({show:false,width:1400,height:960,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
 win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
 await win.loadFile(path.join(root,'renderer/index.html'));const js=s=>win.webContents.executeJavaScript(s);
 async function wait(expression){await js(`new Promise((resolve,reject)=>{const started=Date.now(),timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve()}else if(Date.now()-started>12000){clearInterval(timer);reject(Error('UI wait: '+${JSON.stringify(expression)}))}},25)})`)}
 await wait(`document.getElementById('openAgentSidebar')?.onclick`);await js(`window.sparkitStartup?.skip?.()`);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const checkVisible=await js(`(()=>{const b=document.getElementById('checkUpdate'),r=b.getBoundingClientRect();return !b.hidden&&b.closest('.spark-sidebar-bottom')!==null&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight})()`);assert.equal(checkVisible,true);await js(`document.getElementById('checkUpdate').click()`);await wait(`!document.getElementById('checkUpdate').disabled`);assert.equal(updateChecks,1);await fs.writeFile(out+'/00-update-entry.png',(await win.webContents.capturePage()).toPNG());
 // Load real built-in demo, then attach actual current records using its existing import path? Demo contains stable record IDs.
 await js(`document.getElementById('loadDemo').click()`);
 await js(`document.getElementById('openAgentSidebar').click()`);await wait(`document.querySelectorAll('#agentModelList option').length===2`);
 const startBounds=await js(`(()=>{let d=document.getElementById('agentDialog').getBoundingClientRect();return {w:d.width,h:d.height,vw:innerWidth,vh:innerHeight}})()`);assert.ok(startBounds.w<=startBounds.vw&&startBounds.h<=startBounds.vh);
 await js('Promise.all(document.getAnimations().filter(a=>a.effect?.target?.id==="agentDialog").map(a=>a.finished.catch(()=>{})))');await fs.writeFile(out+'/01-dialog.png',(await win.webContents.capturePage()).toPNG());
 await js(`document.getElementById('agentRequest').value='先分析文件';document.getElementById('agentStart').click()`);await wait(`document.getElementById('agentError').textContent.includes('先选择输出位置')`);assert.equal(requests.length,0);assert.equal(await js(`document.activeElement.id`),'agentChooseOutput');
 await js(`document.getElementById('agentChooseOutput').click()`);await wait(`document.querySelector('.agent-output').textContent.includes('folder')`);
 await js(`document.querySelector('.agent-project-settings').open=true;document.getElementById('agentProjectName').value='项目归属测试';document.getElementById('agentRequest').value='Analyze';document.getElementById('agentStart').click()`);await wait(`document.getElementById('agentError').textContent.includes('保存项目设置')`);assert.equal(requests.length,0);
 await js(`document.getElementById('agentProjectPick').click()`);await wait(`document.getElementById('agentProjectFolder').value.includes('folder')`);await js(`document.getElementById('agentProjectSave').click()`);await wait(`document.getElementById('agentProjectStatus').textContent.includes('项目归属测试')`);
 const savedProject=(await js('window.desktop.agentProject()')).value;assert.equal(savedProject.name,'项目归属测试');assert.equal(savedProject.directory,path.join(out,'folder','项目归属测试'));evidence.push('project folder picker, saved settings and unsaved-change guard');
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(out+'/project-settings.png',(await win.webContents.capturePage()).toPNG());
 await js(`document.getElementById('agentAddFolder').click()`);await wait(`document.getElementById('agentFiles').textContent.includes('按需读取')`);assert.equal(await js(`document.querySelector('#agentFiles .agent-file').title`),out+'/folder');await js(`document.querySelector('#agentFiles button').click()`);
 await js(`document.getElementById('agentAddFiles').click()`);await wait(`document.getElementById('agentFiles').textContent.includes('需求.txt')`);
 await js(`document.getElementById('agentModel').value='test-selected';document.getElementById('agentRequest').value='请分析当前示例。需要问我目标语言和范围；保留原始要求。';document.getElementById('agentStart').click()`);
 await wait(`document.querySelectorAll('.agent-question textarea').length===2`);
 assert.equal(await js(`document.getElementById('agentDialog').classList.contains('is-takeover')`),true);
 assert.equal(await js(`document.querySelector('#agentProgress').hasAttribute('value')`),false);
 await js(`document.querySelector('.agent-question textarea').value='英文';document.getElementById('agentSubmitAnswers').click()`);await wait(`document.getElementById('agentError').textContent.includes('所有')`);
 await js(`document.querySelector('.agent-question textarea').value='保留草稿';document.getElementById('agentSupplement').value='中途补充：保持价格块视觉比例，不要忘记原始需求。';document.getElementById('agentSendSupplement').click()`);await wait(`document.querySelector('.agent-note-state').textContent.includes('进入原任务')`);
 assert.equal(await js(`document.querySelector('.agent-question textarea').value`),'保留草稿');
 await js(`document.getElementById('agentPause').click()`);await wait(`document.getElementById('agentStatus').textContent==='任务已暂停'`);await js(`document.getElementById('agentPause').click()`);await wait(`document.getElementById('agentStatus').textContent==='需要你的回答'`);
 await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(out+'/02-takeover.png',(await win.webContents.capturePage()).toPNG());
 win.setSize(1150,760);await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await fs.writeFile(out+'/03-compact.png',(await win.webContents.capturePage()).toPNG());
 assert.equal(await js(`document.querySelector('.agent-animation img').naturalWidth>0`),true);
 // Demo record IDs are discovered by real workspace tool; avoid depending on its hardcoded fixture name.
 const submitBounds=await js(`(()=>{const r=document.getElementById('agentSendSupplement').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}})()`);assert.ok(submitBounds.bottom<=submitBounds.height&&submitBounds.top>=0,JSON.stringify(submitBounds));
 const workspace=JSON.parse(requests[1].input.split('任务状态（数据）：')[1].split('\n软件通信协议：')[0]).history.find(h=>h.type==='tool_result').result;
 assert.ok(workspace.files.length===1&&workspace.records.length>0);
 await js(`document.querySelectorAll('.agent-question textarea')[0].value='英文';document.querySelectorAll('.agent-question textarea')[1].value='仅价格块';document.getElementById('agentSubmitAnswers').click()`);
 await wait(`document.getElementById('agentStatus').textContent==='本轮任务已结束'`);
 assert.equal(await js(`document.getElementById('agentShowConversation').hidden`),false);await js(`document.getElementById('agentShowConversation').click()`);assert.equal(await js(`document.activeElement.id`),'agentTranscript');
 assert.ok(requests.every(r=>r.model==='test-selected'));assert.ok(requests.at(-1).input.includes('中途补充：保持价格块视觉比例'));assert.ok(requests.at(-1).input.includes('保留原始要求'));assert.ok(requests.at(-1).input.includes('user_answer'));
 const last=await win.webContents.executeJavaScript(`window.desktop.agentState()`);assert.equal(last.value.codexProject.name,'项目归属测试');assert.equal(last.value.status,'completed');assert.ok(last.value.history.some(h=>h.type==='tool_result'&&h.tool==='bind_copy'&&h.result.bound===1));
 await js(`document.getElementById('agentRequest').value='继续检查，保持前面的需求';document.getElementById('agentStart').click()`);await wait(`document.getElementById('agentTranscript').textContent.includes('后续需求：')&&document.getElementById('agentStatus').textContent==='本轮任务已结束'`);assert.ok(requests.at(-1).input.includes('user_followup'));
 const snapshot=(await js('window.desktop.agentState()')).value;
 await js('window.perfTranscriptNode=document.querySelector("#agentTranscript .agent-message")');
 win.webContents.send('agent-state',{...snapshot,performance:{calls:3,inputTokens:100,cachedInputTokens:60,outputTokens:20,reusedOperations:2,usageReportedCalls:3},progress:{current:1,total:2},eventVersion:snapshot.eventVersion});
 await wait('document.querySelector(".agent-counts").textContent.includes("100")');assert.equal(await js('window.perfTranscriptNode===document.querySelector("#agentTranscript .agent-message")'),true);assert.ok((await js('document.querySelector(".agent-counts").textContent')).includes('缓存 60'));evidence.push('progress-only update keeps transcript DOM and shows actual cache usage');
 await js(`document.getElementById('agentNewTask').click()`);assert.equal(await js(`document.querySelector('#agentTranscript').textContent`),'');assert.equal(await js(`document.querySelector('#agentModel').disabled`),false);
 await js(`document.documentElement.classList.add('spark-reduce-motion')`);assert.equal(await js(`getComputedStyle(document.querySelector('.agent-orbit')).animationName`),'none');
 await fs.writeFile(out+'/04-completed.png',(await win.webContents.capturePage()).toPNG());
 // Older event must never roll the visible state backwards.
 assert.deepEqual(errors.filter(e=>!e.includes('Content-Security-Policy')),[]);
 evidence.push('output required before model or task creation','folder picker registers path only','visible sidebar update button invokes real preload IPC once','full application sidebar entry','current project RPC','provider/model selection','attachment picker','all questions required','supplement preserves drafts and original context','pause/resume','real logo','compact layout','reduced motion','no native file writes','follow-up keeps history','independent new task');
 await fs.writeFile(out+'/verified.json',JSON.stringify({passed:true,evidence,requests:requests.length,rendererErrors:errors},null,2));console.log('PASS AI assistant integrated Electron UI',evidence.length);
 }catch(e){console.error(e);exit=1;if(win)await fs.writeFile(out+'/failed.png',(await win.webContents.capturePage()).toPNG());}finally{await integration?.close();await workRecords?.flush();win?.destroy();app.exit(exit)}});
