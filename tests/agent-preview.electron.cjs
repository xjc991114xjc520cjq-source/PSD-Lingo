// Full renderer import -> assistant preview on unbound synthetic AI and PSD originals.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out='D:/PSD-Lingo/work/agent-v47-preview';let win,integration;
app.setPath('userData',out+'/profile');
app.whenReady().then(async()=>{let exit=0;try{
 await fs.mkdir(out,{recursive:true});let preview='',format='AI';const requests=[],evidence=[],errors=[];
 const result=(kind,message,tool='',args={})=>({kind,message,tool,arguments:JSON.stringify(args),questions:[]});
 const settings={read:async()=>({apiKey:'fixture',apiBaseUrl:'https://fixture.invalid/v1'}),get:async()=>({mode:'api',apiModel:'fixture',hasApiKey:true}),credentials:async()=>({mode:'api',apiModel:'fixture',apiKey:'fixture',apiProtocol:'responses',apiBaseUrl:'https://fixture.invalid/v1'})};
 const safe=fn=>async(_,v)=>{try{return {ok:true,value:await fn(v)}}catch(e){return {ok:false,error:e.message}}};
 for(const [name,fn]of Object.entries({'load-codex-settings':settings.get,'service-ready':()=>true,'layout-memory-status':()=>({}),'status':()=>({active:true,version:'test',authorization:{active:true},updates:{}}),'import-psd':args=>[{name:'unbound.'+format.toLowerCase(),path:args.paths[0],format,fingerprint:'fixture-'+format,preview,metadata:{width:900,height:1800,bitsPerChannel:8,colorMode:3,layers:[{id:1,name:'Unbound title',original:'原稿标题',box:[80,120,600,160],size:48,font:'ArialMT',alignment:'left',color:'#ffffff',issues:[],visible:true}],containers:[]}}]}))ipcMain.handle(name,safe(fn));
 integration=require('../services/agent-integration.cjs').installAgent({ipcMain,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[out+'/source.'+format.toLowerCase()]})},window:()=>win,dataDirectory:()=>out,settings:()=>settings,safe,guard:()=>{},isBusy:()=>false,localEnv:async()=>process.env,fetch:async(url,options)=>{
  if(url.endsWith('/models'))return new Response(JSON.stringify({data:[{id:'fixture'}]}));
  const body=JSON.parse(options.body),input=typeof body.input==='string'?body.input:body.input[0].content.find(x=>x.type==='input_text').text,task=JSON.parse(input.split('任务状态（数据）：')[1].split('\n软件通信协议：')[0]);requests.push(body);
  const tools=task.history.filter(h=>h.type==='tool_start');let value;
  if(!tools.length)value=result('tool','导入未绑定原稿','import_source',{fileId:task.attachments[0].id});
  else if(tools.length===1)value=result('tool','直接查看整页原稿','preview',{fileIndex:task.originalRequest.includes('错误')?999:format==='AI'?0:1});
  else value=result('complete','已完成原稿预览检查，没有修改或导出。');
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 },importWorkbook:async()=>{},runPhotoshop:()=>assert.fail('No Adobe operation in fixture')});
 win=new BrowserWindow({show:false,width:1400,height:960,webPreferences:{preload:path.join(root,'preload.cjs'),contextIsolation:true}});
 win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
 await win.loadFile(path.join(root,'renderer/index.html'));const js=s=>win.webContents.executeJavaScript(s);
 async function wait(expression){await js(`new Promise((resolve,reject)=>{const start=Date.now(),timer=setInterval(()=>{if(${expression}){clearInterval(timer);resolve()}else if(Date.now()-start>15000){clearInterval(timer);reject(Error(${JSON.stringify(expression)}))}},25)})`)}
 await wait(`document.getElementById('openAgentSidebar')?.onclick`);
 preview=await js(`(()=>{const c=document.createElement('canvas');c.width=900;c.height=1800;const x=c.getContext('2d');x.fillStyle='#182030';x.fillRect(0,0,900,1800);x.fillStyle='white';x.font='48px Arial';x.fillText('ORIGINAL TITLE',80,180);return c.toDataURL('image/png')})()`);
 await fs.writeFile(out+'/source.ai','synthetic metadata fixture');await fs.writeFile(out+'/source.psd','synthetic metadata fixture');
 await js(`document.getElementById('openAgentSidebar').click()`);await wait(`document.querySelectorAll('#agentModelList option').length===1`);
 for(const mode of ['AI','PSD','error']){
  if(mode!=='AI')await js(`document.getElementById('agentNewTask').click();document.querySelectorAll('#agentFiles button').forEach(b=>b.click())`);format=mode==='error'?'AI':mode;
  await js(`document.getElementById('agentAddFiles').click()`);await wait(`document.querySelectorAll('#agentFiles .agent-file').length===1`);
  await js(`document.getElementById('agentRequest').value=${JSON.stringify(mode==='error'?'测试错误显示':'仅导入并检查原稿预览')};document.getElementById('agentStart').click()`);
  await wait(`document.getElementById('agentTranscript').textContent.startsWith(${JSON.stringify(mode==='error'?'测试错误显示':'仅导入并检查原稿预览')})&&['本轮任务已结束','任务未完成'].includes(document.getElementById('agentStatus').textContent)&&!document.getElementById('agentDialog').classList.contains('is-takeover')`);
  const state=(await js(`window.desktop.agentState()`)).value;
  if(mode==='error'){
   assert.equal(state.status,'failed');assert.match(state.error,/fileIndex/);
   assert.ok(await js(`document.querySelector('.agent-step').textContent.includes('fileIndex')`));evidence.push('unresolved tool error visible in central panel');
  }else{
   assert.equal(state.status,'completed',JSON.stringify(state));const image=state.history.find(h=>h.tool==='preview'&&h.type==='tool_result');
   assert.ok(image);assert.equal(image.result.evidence[0].quality,'original-source');assert.equal(state.history.some(h=>h.type==='tool_error'),false);
   assert.ok(JSON.stringify(requests.at(-1)).includes('input_image'));
   evidence.push(mode+' import -> unbound preview -> model receives image');
  }
  await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await fs.writeFile(out+'/'+mode+'-status.png',(await win.webContents.capturePage()).toPNG());
  assert.equal(await js(`document.getElementById('agentShowConversation').hidden`),false);
  await js(`document.getElementById('agentShowConversation').click()`);assert.equal(await js(`document.activeElement.id`),'agentTranscript');
  await fs.writeFile(out+'/'+mode+'.png',(await win.webContents.capturePage()).toPNG());
 }
 assert.deepEqual(errors.filter(e=>!e.includes('Content-Security-Policy')),[]);
 await fs.writeFile(out+'/verified.json',JSON.stringify({passed:true,evidence,requests:requests.length,errors},null,2));console.log('PASS unbound original preview integrated Electron',evidence);
 }catch(e){console.error(e);exit=1;if(win)await fs.writeFile(out+'/failed.png',(await win.webContents.capturePage()).toPNG());}finally{await integration?.close();win?.destroy();app.exit(exit)}});
