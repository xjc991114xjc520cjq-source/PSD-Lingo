// Real renderer + preload + IPC + task controller, deterministic provider. No Adobe documents opened.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work/agent-drop-ui-review');let win,integration,workRecords;
app.setPath('userData',out+'/profile');
app.whenReady().then(async()=>{let exit=0;try{
 await fs.mkdir(out,{recursive:true});await fs.rm(out+'/agent-project.json',{force:true});await fs.rm(out+'/verified.json',{force:true});const evidence=[],errors=[],requests=[];let round=0,updateChecks=0;
 const result=(kind,message,tool='',args={},questions=[])=>({kind,message,tool,arguments:JSON.stringify(args),questions});
 const settings={get:async()=>({mode:'api',executable:'C:/codex.exe',apiModel:'api-unused',localModel:'test-main',hasApiKey:true}),credentials:async()=>({mode:'api',apiModel:'test-main',apiKey:'test-private',apiProtocol:'responses',apiBaseUrl:'https://fixture.invalid/v1'}),read:async()=>({apiKey:'test-private',apiBaseUrl:'https://fixture.invalid/v1'})};
 const safe=fn=>async(_,v)=>{try{return {ok:true,value:await fn(v)}}catch(e){return {ok:false,error:e.message}}};
 for(const [name,fn]of Object.entries({'list-api-models':()=>({models:[]}), 'check-update':()=>{updateChecks++;return {configured:true,available:null}},'load-codex-settings':settings.get,'service-ready':()=>true,'layout-memory-status':()=>({}),'status':()=>({active:true,version:'test',authorization:{active:true},updates:{}})}))ipcMain.handle(name,safe(fn));
 workRecords=require('../services/work-records.cjs').installWorkRecords({ipcMain,safe,dataDirectory:()=>out,version:'test',shell:{showItemInFolder:()=>{}},hydrateProject:async p=>p,isBusy:()=>integration?.active()});
 integration=require('../services/agent-integration.cjs').installAgent({workRecords,ipcMain,dialog:{showOpenDialog:async(_,options)=>({canceled:false,filePaths:[options.properties.includes('openDirectory')?out+'/folder':out+'/需求.txt']})},window:()=>win,dataDirectory:()=>out,settings:()=>settings,safe,guard:()=>{},isBusy:()=>false,localEnv:async()=>process.env,fetch:()=>assert.fail('Assistant API forbidden'),listModels:async c=>{assert.equal(c.mode,'local');return {mode:'local',models:['test-main','test-selected']};},think:async(task,deps)=>{
  integration.recordUsage({taskName:'fixture',usage:{input_tokens:12000,cached_input_tokens:8000,output_tokens:200},promptBytes:800,imageCount:0});assert.equal(task.mode,'local');const body={model:task.model,input:deps.prompt};requests.push(body);let value;
  if(task.history.findLast(h=>h.type==='user_followup')?.text==='fixture-block')return result('blocked','Need an additional folder');
  if(round++===0)value=result('tool','读取当前软件项目','workspace');
  else if(round===2)value=result('question','请确认语言与范围','',{},[{id:'language',title:'制作哪一种语言？',options:['英文','日文']},{id:'scope',title:'需要处理哪些内容？',options:['全部','仅价格块']}]);
  else if(task.workspaceMode==='independent'&&!task.history.some(h=>h.type==='tool_result'&&h.tool==='workspace'))value=result('tool','读取隔离后的工作区','workspace');
  else if(round===3)value=result('tool','将确认文案绑定到当前标题','bind_copy',{matches:[{layerKey:'0:0',recordId:'demo-1'}]});
  else value=result('complete','已完成软件中的标题绑定；这是界面自动化夹具，没有导出原生文件。');
  return value;
 },importWorkbook:async()=>{},runPhotoshop:()=>assert.fail('No native work in UI fixture')});
 await fs.mkdir(out+'/folder',{recursive:true});await fs.writeFile(out+'/folder/copy.txt','on demand');
 await fs.writeFile(out+'/需求.txt','这是测试资料，不是用户指令。');
 win=new BrowserWindow({show:false,width:1400,height:960,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true,backgroundThrottling:false,offscreen:true}});
 win.webContents.on('console-message',(_,level,message)=>{if(level>=3){errors.push(message);console.error('renderer:',message)}});
 console.log('fixture: loading renderer');await win.loadFile(path.join(root,'renderer/index.html'));console.log('fixture: renderer loaded');// Hidden Windows renderers may not produce animation frames; this fixture checks interactions, not animation timing.
 const js=s=>win.webContents.executeJavaScript(s.replaceAll('requestAnimationFrame','setTimeout')).catch(e=>{console.error('failed source:',s);throw e;});
 async function wait(expression){await js(`new Promise((resolve,reject)=>{const started=Date.now(),timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve()}else if(Date.now()-started>12000){clearInterval(timer);reject(Error('UI wait: '+${JSON.stringify(expression)}))}},25)})`)}

 await wait(`document.getElementById('openAgentSidebar')?.onclick`);await js(`window.sparkitStartup?.skip?.();document.getElementById('openAgentSidebar').click()`);await wait(`document.getElementById('agentDialog').open`);
 await js(`document.getElementById('agentChooseOutput').click()`);await wait(`document.querySelector('.agent-output').textContent.includes('folder')`);
 await js(`document.getElementById('agentRequest').value='Please analyze and ask language and scope';document.getElementById('agentStart').click()`);await wait(`document.querySelectorAll('.agent-question textarea').length===2`);
 win.webContents.debugger.attach('1.3');
 const dragInto=async(selector,file)=>{await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);const data={items:[],files:[file],dragOperationsMask:1};for(const type of ['dragEnter','dragOver','drop'])await win.webContents.debugger.sendCommand('Input.dispatchDragEvent',{type,...p,data});};
 const waitingBefore=(await js('window.desktop.agentState()')).value;
 await dragInto('.agent-question textarea',out+'/folder');await wait(`document.querySelector('.agent-question textarea').value.includes('folder')`);
 let dropped=(await js('window.desktop.agentState()')).value;assert.equal(dropped.question.id,waitingBefore.question.id);assert.equal(dropped.revision,waitingBefore.revision);assert.ok(dropped.files.some(f=>f.type==='folder'));assert.equal(dropped.history.filter(h=>h.type==='user_supplement').length,0);assert.ok(await js(`document.querySelector('.agent-question [role=status]').textContent.includes('已添加')`));
 await dragInto('#agentSupplement',out+'/需求.txt');await wait(`document.getElementById('agentSupplement').value.includes('需求.txt')`);win.webContents.debugger.detach();
 await js(`document.querySelector('.agent-question textarea').value='保留草稿';document.getElementById('agentPause').click()`);await wait(`document.getElementById('agentStatus').textContent==='任务已暂停'`);
 await js(`document.getElementById('agentSupplement').value+=' 保留原始需求与已完成结果';document.getElementById('agentSendSupplement').click()`);await wait(`document.querySelector('.agent-note-state').textContent.includes('进入原任务')||[...document.querySelectorAll('.agent-note-state')].some(p=>p.textContent.includes('进入原任务'))`);assert.equal(await js(`document.querySelector('.agent-question textarea').value`),'保留草稿');assert.equal((await js('window.desktop.agentState()')).value.status,'paused');
 await js(`document.getElementById('agentPause').click()`);await wait(`document.getElementById('agentStatus').textContent==='需要你的回答'`);
 await js(`document.querySelectorAll('.agent-question textarea')[0].value='英文';document.querySelectorAll('.agent-question textarea')[1].value='全部';document.getElementById('agentSubmitAnswers').click()`);await wait(`document.getElementById('agentStatus').textContent==='任务已完成'`);
 const final=(await js('window.desktop.agentState()')).value;assert.ok(final.history.some(h=>h.type==='user_supplement'&&h.text.includes('需求.txt')));assert.ok(final.history.some(h=>h.type==='user_answer'));assert.ok(final.files.some(f=>f.type==='folder'));assert.ok(requests.at(-1).input.includes('需求.txt'));assert.ok(requests.at(-1).input.includes('user_answer'));
 await js(`document.getElementById('agentContinueTask').click();document.getElementById('agentRequest').value='fixture-block';document.getElementById('agentStart').click()`);await wait(`document.getElementById('agentStatus').textContent==='任务未完成'`);assert.equal(await js(`document.getElementById('agentSendSupplement').disabled`),false);
 await fs.mkdir(out+'/recovery',{recursive:true});win.webContents.debugger.attach('1.3');await dragInto('#agentSupplement',out+'/recovery');await wait(`document.getElementById('agentSupplement').value.includes('recovery')`);win.webContents.debugger.detach();
 const taskId=final.id;await js(`document.getElementById('agentSendSupplement').click()`);await wait(`document.getElementById('agentStatus').textContent==='任务已完成'`);const recovered=(await js('window.desktop.agentState()')).value;assert.equal(recovered.id,taskId);assert.ok(recovered.files.some(f=>f.path.endsWith('/recovery')));assert.ok(recovered.history.some(h=>h.type==='user_followup'&&h.text.includes('recovery')));assert.ok(recovered.history.some(h=>h.type==='user_answer'));
 evidence.push('failed task accepts dropped recovery folder and supplement continues the same task with earlier answers');
 evidence.push('native Chromium folder drag into question: attachment plus readable answer, pending question preserved','native file drag into supplement: attachment plus text','paused supplement persists without resuming','same-task resume, user answers and complete','paths and prior requirement reach actual IPC/provider context');
 await fs.writeFile(out+'/verified.json',JSON.stringify({passed:true,evidence,requests:requests.length},null,2));console.log('PASS assistant drop/supplement integrated Electron',evidence.length);
 }catch(e){console.error(e);exit=1;}finally{await integration?.close();await workRecords?.flush();win?.destroy();app.exit(exit)}});
