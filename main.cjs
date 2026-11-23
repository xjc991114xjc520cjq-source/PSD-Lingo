const { app, BrowserWindow, ipcMain, dialog, net, session } = require('electron');
const fs = require('node:fs/promises');
const {validateCreation,validateTextActions}=require('./native-text-objects.cjs');
const {inspectFile,hashFile}=require('./photoshop-file-io.cjs');
const {readPhotoshopMetadata}=require('./photoshop-metadata.cjs');
const illustrator=require('./illustrator.cjs');
const path = require('node:path');
// Keep the existing profile, device namespace and update identity across the rebrand.
if(app.isPackaged&&!app.commandLine.hasSwitch('user-data-dir'))app.setPath('userData',path.join(app.getPath('appData'),'PSD Lingo'));
const primaryInstance=!app.isPackaged||app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
const {revealWindow,watchWindowStartup}=require('./services/app-startup.cjs');
require('./services/process-logging.cjs').installProcessLogging({directory:path.join(app.getPath('userData'),'diagnostics')});
const windowsBrand=require('./services/windows-brand.cjs');
const { spawn } = require('node:child_process');
const { hash, parseCsv, recordsFromRows, recordsFromText, resplitRecords, validatePlan, jsxForPlan } = require('./core.cjs');
const {extractLayers,extractContainers} = require('./metadata.cjs');
const {validateContainerEdits}=require('./container-edit.cjs');
const {validateExtractedContainers,extractedMetadata}=require('./container-extraction.cjs');
const {createLearningPipeline,verifyPsdOutput}=require('./services/layout-learning-pipeline.cjs');
let layoutMemory,learningCloud;
const {createLearningCloud}=require('./services/learning-cloud.cjs');
function learningDirectory(){return path.join(app.getPath('userData'),'layout-memory');}
function learningStore(){return layoutMemory||(layoutMemory=createLearningPipeline({directory:learningDirectory(),cloud:learningCloud}));}
const learningBackground=require('./services/learning-background.cjs').createLearningBackground({notify:value=>win?.webContents?.send?.('learning-progress',value)});
const {readDocxText} = require('./document-reader.cjs');
const importWorkbook=require('./translation-import.cjs').createWorkbookImporter();
const {createBackground,installedFonts,decodeBridgeOutput} = require('./photoshop-preview.cjs');
const {helper}=require('./services/authorization.cjs');
const {CodexSettings}=require('./services/codex-settings.cjs');
const {matchCopy}=require('./services/ai-match.cjs');
const {listApiModels}=require('./services/api-models.cjs');
const {withLocalCodexProxy}=require('./services/local-codex-proxy.cjs');
const {discoverCodex}=require('./services/codex-discovery.cjs');
let codexSettings;
const {createTemplate,validateTemplate,planForDocument}=require('./batch.cjs');
let activeBatchTemplate=null,batchDocuments=new Map(),batchBusy=false,batchCancelled=false;
let win, codexAbort, psBusy = false;
const productConfig=require('./services/product-config.cjs');
const diagnostics=require('./services/diagnostic-cloud.cjs').createDiagnosticCloud({directory:path.join(app.getPath('userData'),'diagnostics','cloud'),version:app.getVersion(),enabled:productConfig.authorizationEnabled,ready:()=>!!authorization?.status().active,upload:reports=>authorization.uploadDiagnostics(reports),environment:()=>({platform:process.platform,arch:process.arch,os:require('node:os').release()}),onChange:status=>{if(win&&!win.isDestroyed())win.webContents.send('diagnostic-status',status);}});
const captureDiagnostic=input=>diagnostics.record(input).catch(()=> '');
const reportAgentState=require('./services/diagnostic-cloud.cjs').createAgentDiagnostics(captureDiagnostic);
process.on('uncaughtExceptionMonitor',error=>{try{const folder=path.join(app.getPath('userData'),'diagnostics');require('node:fs').mkdirSync(folder,{recursive:true});const value=require('./services/diagnostic-schema.cjs').diagnostic({error,id:require('node:crypto').randomUUID(),at:Date.now(),version:app.getVersion(),kind:'process-crash',operation:'main'});require('node:fs').writeFileSync(path.join(folder,'pending-fatal.json'),JSON.stringify(value));}catch{}});
app.on('before-quit',()=>{void diagnostics.close();});
const {Authorization}=require('./services/authorization.cjs');
const {Updates}=require('./services/updates.cjs');
let authorization,updates,knowledgeCloud;
const helperPath=app.isPackaged?path.join(process.resourcesPath,'psd-lingo-service.exe'):path.join(__dirname,'services/bin/psd-lingo-service.exe');
const changed=()=>{if(win&&!win.isDestroyed())win.webContents.send('service-state',serviceStatus());if(authorization?.status().active)void knowledgeCloud?.sync();};
function serviceStatus(){return {version:app.getVersion(),authorization:authorization?.status(),updates:updates?.status(),knowledge:knowledgeCloud?.status()};}
function protectedAction(feature){if(!authorization||!updates)throw new Error('服务正在初始化，请稍候');updates.assert();authorization.assert(feature);}
const {validateArtworkHides}=require('./artwork-visibility.cjs');
const imported = new Map(),importedMetadata=new Map();
async function importFilePath(value, extensions, label) {
  if(typeof value!=='string'||!value.trim()||value.includes('\0')||!path.isAbsolute(value))throw new Error(label+'路径无效，请拖入本机文件。');
  const selected=path.normalize(value),ext=path.extname(selected).toLowerCase();
  if(!extensions.includes(ext))throw new Error(label+'格式不支持，请选择 '+extensions.join(' / ')+' 文件。');
  const stat=await fs.stat(selected);
  if(!stat.isFile())throw new Error('请拖入'+label+'文件，不能使用文件夹。');
  return selected;
}
function safeOperation(operation,handler){return safe(handler,operation);}
function safe(handler,operation='ipc') { return async (_, ...args) => { try { return {ok: true, value: await handler(...args)}; } catch (e) { const reportId=e.diagnosticId||await captureDiagnostic({operation,error:e,environment:e.nativeEnvironment});return {ok: false, error: String(e.message || e),reportId,...require('./services/operation-error.cjs').errorDetails(e)}; } }; }
async function readPsd(filePath,{preview=true}={}) {
  if(illustrator.isIllustrator(filePath)){
    if(psBusy||batchBusy)throw Error('原生文件任务正在运行，请稍后导入 AI');
    psBusy=true;let sourceFingerprint;try{const fingerprint=sourceFingerprint=await hashFile(filePath),result=await illustrator.readIllustrator(path.join(app.getPath('userData'),'previews','ai-'+Date.now()),filePath,{preview});if(await hashFile(filePath)!==fingerprint)throw Error('AI 原稿在读取期间发生变化，请重新导入');for(const item of result.metadata.layers.filter(l=>l.metadataReadFailure)){void captureDiagnostic({kind:'native-object',operation:'import_source',message:item.metadataReadFailure.error,code:String(item.metadataReadFailure.number||''),phase:item.metadataReadFailure.stage,environment:result.metadata.nativeHost,source:{format:'AI',fingerprint}});}imported.set(filePath,fingerprint);importedMetadata.set(filePath,{fingerprint,metadata:structuredClone(result.metadata)});return {path:filePath,name:path.basename(filePath),fingerprint,format:'AI',...result};}catch(error){error.diagnosticId=await captureDiagnostic({kind:'native-import',operation:'import_source',error,environment:error.nativeEnvironment,source:{format:'AI',fingerprint:sourceFingerprint,bytes:await fs.stat(filePath).then(s=>s.size,()=>undefined)}});throw error;}finally{psBusy=false;}
  }
  const result=await require('./photoshop-import.cjs').readPhotoshopInput(filePath,{inspect:inspectFile,read:fs.readFile,checksum:hashFile,reserve:()=>{if(psBusy||batchBusy)throw new Error('Photoshop 正忙，请等待当前任务完成后读取大文件。');psBusy=true;return ()=>{psBusy=false;};},native:async()=>{
    const directory=path.join(app.getPath('userData'),'previews','import-'+Date.now()),metadata=await readPhotoshopMetadata(directory,filePath,{helperPath}),image=preview?await createBackground(directory,filePath,[],{helperPath,scalePreview:true}):undefined;return {metadata,preview:image};
  }});
  const readProblems=new Set();for(const item of result.metadata?.layers||[]){for(const problem of [item.metadataReadFailure,...(item.metadataReadWarnings||[])].filter(Boolean)){const key=JSON.stringify([problem.stage,problem.number,problem.error]);if(readProblems.has(key))continue;readProblems.add(key);void captureDiagnostic({kind:'native-object',operation:'import_source',message:problem.error,code:String(problem.number||''),phase:problem.stage,environment:result.metadata.nativeHost,source:{format:result.format||path.extname(filePath).slice(1).toUpperCase(),fingerprint:result.fingerprint}});}}
  imported.set(filePath,result.fingerprint);if(result.metadata)importedMetadata.set(filePath,{fingerprint:result.fingerprint,metadata:structuredClone(result.metadata)});else importedMetadata.delete(filePath);
  return {path:filePath,name:path.basename(filePath),...result};
}

async function actualMetadata(file){
  const cached=importedMetadata.get(file.path);
  if(cached&&cached.fingerprint===file.fingerprint)return cached.metadata;
  if(illustrator.isIllustrator(file))throw Error('AI 元数据未验证，请重新导入 AI 原稿');
  const info=await inspectFile(file.path);if(require('./photoshop-file.cjs').needsNativePhotoshop(info))throw new Error('大文件元数据尚未验证，请重新导入原稿。');
  const psd=require('ag-psd').readPsd(await fs.readFile(file.path),{skipLayerImageData:true,skipCompositeImageData:true,skipThumbnail:true,skipLinkedFilesData:true});
  return {width:psd.width,height:psd.height,layers:extractLayers(psd),containers:extractContainers(psd)};
}
async function checkPlan(plan) {
  validatePlan(plan);
  for (const file of plan.files) {
    if (imported.get(file.path) !== file.fingerprint) throw new Error('请重新导入原 PSD，文件未在当前会话中验证。');
    if(await hashFile(file.path)!==file.fingerprint)throw new Error('原 PSD / PSB 已发生变化，请重新导入并确认绑定。');
    const metadata=await actualMetadata(file),actual=metadata.layers,{width,height}=metadata;
    if(illustrator.isIllustrator(file)&&file.format!=='AI'||!illustrator.isIllustrator(file)&&file.format==='AI')throw Error('文件格式与原稿不一致');
    validateTextActions(file.textActions,{layers:actual,jobs:file.jobs});
    validateArtworkHides(file.artworkHides,{objects:metadata.artworkObjects||[],textActions:file.textActions,jobs:file.jobs,format:file.format});
    if(illustrator.isIllustrator(file))require('./illustrator-containers.cjs').assertContainerKinds(file);
    validateExtractedContainers(file.extractedContainers,{width,height,fingerprint:file.fingerprint,layers:metadata.layers});
    validateContainerEdits(file.containerEdits,{width,height,textIds:file.jobs.map(j=>j.layerId),containers:[...(metadata.containers||[]),...extractedMetadata(file.extractedContainers)]});
    for (const job of file.jobs) {
      if(job.nativeCreation){validateCreation(job,{width,height,layers:illustrator.isIllustrator(file)?actual:undefined,artworkObjects:metadata.artworkObjects,artboards:metadata.artboards});continue;}
      const l = actual.find(l => l.id === job.layerId);
      if (!l || !l.supported || l.original !== job.original || l.font !== job.font || l.size !== job.size || JSON.stringify(l.box) !== JSON.stringify(job.box)) throw new Error('文字层元数据校验失败，请重新导入并确认：' + job.layerId);
      if(job.position&&(job.position.x>=width||job.position.y>=height||job.position.x+job.box[2]<=0||job.position.y+job.box[3]<=0))throw new Error('文字目标区域超出画布：'+l.name);
    }
  }
  return plan;
}
app.whenReady().then(async () => {
  if(!primaryInstance)return;
  app.setAppUserModelId('PSDLingo');
  codexSettings=new CodexSettings({dataDir:app.getPath('userData'),helperPath});
  const options={config:productConfig,version:app.getVersion(),dataDir:app.getPath('userData'),fetch:(...args)=>net.fetch(...args),onChange:changed};
  authorization=new Authorization({...options,helperPath});updates=new Updates(options);
  diagnostics.start();void (async()=>{const file=path.join(app.getPath('userData'),'diagnostics','pending-fatal.json');try{const value=JSON.parse(await fs.readFile(file,'utf8'));await diagnostics.record(value);await fs.unlink(file);}catch{}})();
  knowledgeCloud=require('./services/knowledge-sync.cjs').createKnowledgeSync({directory:path.join(app.getPath('userData'),'localization-knowledge','library'),authorization,config:productConfig,enabled:productConfig.learningCloudEnabled===true&&productConfig.authorizationEnabled});knowledgeCloud.start();
  learningCloud=require('./services/learning-case-cloud.cjs').createCaseCloud({directory:learningDirectory(),enabled:productConfig.learningCloudEnabled===true&&productConfig.authorizationEnabled,ready:()=>!!authorization.lease&&authorization.status().active,upload:record=>authorization.uploadCase(record),encode:async bytes=>{let image=require('electron').nativeImage.createFromBuffer(bytes);if(image.isEmpty())throw Error('案例截图无法解码');const size=image.getSize();if(size.width>640||size.height>480)image=image.resize({width:Math.max(1,Math.round(size.width*Math.min(640/size.width,480/size.height))),quality:'best'});const result=image.toJPEG(70);if(result.length>100000)throw Error('案例截图压缩后仍过大，已保留本机待处理');return 'data:image/jpeg;base64,'+result.toString('base64');},summary:createLearningCloud({directory:learningDirectory(),enabled:productConfig.learningCloudEnabled===true&&productConfig.authorizationEnabled,ready:()=>!!authorization.lease&&authorization.status().active,upload:samples=>authorization.uploadLearning(samples)})});learningCloud.start();
  win = new BrowserWindow({width: 1510, height: 980, minWidth: 1150, minHeight: 760, show:false, title: '灵搭 Sparkit '+app.getVersion()+' · 文案与排版工作台', icon:path.join(__dirname,'renderer/assets/sparkit.ico'), backgroundColor: '#191a1e', titleBarStyle:'hidden', titleBarOverlay:{color:'#191a1e',symbolColor:'#eceae6',height:38}, autoHideMenuBar: true,
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true}});
  watchWindowStartup(win,{onTimeout:()=>console.warn('主窗口首帧事件未触发，已启用启动显示保障')});
  windowsBrand.install({app,icon:path.join(__dirname,'renderer/assets/sparkit.ico'),isUpdating:()=>updates.phase==='restarting'});
  win.setMenu(null);
  win.webContents.on('render-process-gone',(_,details)=>{void captureDiagnostic({kind:'renderer-crash',operation:'renderer',message:details.reason,code:String(details.exitCode)});});
  await updates.init();
  win.on('focus',()=>updates.check(false).catch(()=>{}));
  await win.loadFile(path.join(__dirname, 'renderer/index.html'));
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  authorization.init().catch(e=>console.error('授权初始化失败：'+e.message));
}).catch(error=>{console.error('应用启动失败：',error);dialog.showErrorBox('灵搭 Sparkit 启动失败','启动未完成：'+error.message+'\n项目与原稿未被清除。请保留诊断记录后重试。');app.quit();});
app.on('second-instance',()=>revealWindow(win,{focus:true}));
app.on('window-all-closed', async () => { codexAbort?.abort();authorization?.close();updates?.close();learningCloud?.close();knowledgeCloud?.close();try{await agentIntegration.close();await workRecords.flush();}catch(e){console.error('关闭时保存工作记录失败：'+e.message);}app.quit(); });
let bulkEngine;
function bulk(){return bulkEngine||(bulkEngine=new (require('./photoshop-bulk.cjs').PhotoshopBulk)(path.join(app.getPath('userData'),'bulk-previews'),{helperPath}));}
async function bulkTask(action){if(psBusy||batchBusy)throw Error('原生文件任务正在运行，请稍后再试');psBusy=true;try{return await action();}finally{psBusy=false;win?.focus();}}
ipcMain.handle('bulk-scan',safeOperation('bulk-scan',request=>bulkTask(async()=>{if(imported.get(request.path)!==request.fingerprint)throw Error('请先导入原稿');return bulk().scan(request.path,request.fingerprint);})));
ipcMain.handle('bulk-preview',safeOperation('bulk-preview',request=>bulkTask(()=>bulk().preview(request.scanId,request.edits))));
ipcMain.handle('bulk-cancel',safeOperation('bulk-cancel',()=>bulk().cancel()));
ipcMain.handle('bulk-export',safeOperation('bulk-export',request=>bulkTask(async()=>{
 protectedAction('psd-export');const {scan}=await bulk().validate(request.scanId,request.edits);
 const r=await dialog.showSaveDialog(win,{title:'导出可编辑修改副本（原稿和已有文件不覆盖）',defaultPath:path.basename(scan.input,path.extname(scan.input))+'-批量替换'+path.extname(scan.input),filters:[{name:'Photoshop',extensions:[path.extname(scan.input).slice(1)]}]});
 if(r.canceled)return null;return bulk().export(request.scanId,request.edits,r.filePath);
})));
let skuEngine;const skuOutputFolders=new Set();
function sku(){return skuEngine||(skuEngine=new (require('./sku-workflow.cjs').SkuWorkflow)(path.join(app.getPath('userData'),'sku-practice'),{helperPath,onProgress:p=>win?.webContents.send('sku-progress',p),visualProvider:async(manifest,rule,deps)=>{protectedAction('codex-match');if(codexAbort)throw Error('AI 正在处理，请等待或取消');const controller=new AbortController();codexAbort=controller;const abort=()=>controller.abort();deps.signal?.addEventListener('abort',abort,{once:true});try{const credentials=await codexSettings.credentials(),env=credentials.mode==='local'?await withLocalCodexProxy(process.env,url=>session.defaultSession.resolveProxy(url)):undefined;return await require('./sku-visual.cjs').recognizeTiles(manifest,rule,credentials,{...deps,signal:controller.signal,env,fetch:(...args)=>net.fetch(...args)});}finally{deps.signal?.removeEventListener('abort',abort);if(codexAbort===controller)codexAbort=null;}}}));}
const productMappings=require('./services/sku-product-mappings.cjs').createProductMappings(()=>path.join(app.getPath('userData'),'sku-product-mappings'));
ipcMain.handle('sku-product-workbook',safeOperation('sku-product-workbook',async()=>{const r=await dialog.showOpenDialog(win,{title:'选择产品文案表',properties:['openFile'],filters:[{name:'Excel',extensions:['xlsx']}]});return r.canceled?null:r.filePaths[0];}));
ipcMain.handle('sku-product-analyze',safeOperation('sku-product-analyze',async input=>productMappings.analyze({...input,source:await importFilePath(input.source,['.psd','.psb'],'Photoshop 原稿'),workbook:await importFilePath(input.workbook,['.xlsx'],'产品文案表')})));
ipcMain.handle('sku-product-approve',safeOperation('sku-product-approve',input=>productMappings.approve(input)));
ipcMain.handle('sku-product-read',safeOperation('sku-product-read',input=>productMappings.read(input.id)));
ipcMain.handle('sku-product-list',safeOperation('sku-product-list',()=>productMappings.list()));
ipcMain.handle('sku-choose-source',safeOperation('sku-choose-source',async()=>{const r=await dialog.showOpenDialog(win,{title:'添加多图改字原稿（可多选）',properties:['openFile','multiSelections'],filters:[{name:'Photoshop',extensions:['psd','psb']}]});return r.canceled?null:r.filePaths;}));
ipcMain.handle('sku-choose-output',safeOperation('sku-choose-output',async()=>{const r=await dialog.showOpenDialog(win,{title:'选择新建结果文件夹的位置',properties:['openDirectory','createDirectory']});return r.canceled?null:r.filePaths[0];}));
ipcMain.handle('sku-analyze',safeOperation('sku-analyze',request=>bulkTask(async()=>{if(request.method==='visual'){protectedAction('codex-match');await codexSettings.credentials();}const input=await importFilePath(request.path,['.psd','.psb'],'Photoshop 原稿');return sku().analyze(input,request.rule,{method:request.method||'traditional',visualConsent:request.visualConsent});})));
ipcMain.handle('sku-run',safeOperation('sku-run',request=>bulkTask(async()=>{protectedAction('psd-export');const result=await sku().run(request.planId,request.parent,request.variantSelections||[],request.review);skuOutputFolders.add(result.directory);return result;})));
ipcMain.handle('sku-repair-fonts',safeOperation('sku-repair-fonts',request=>bulkTask(async()=>{
 protectedAction('codex-match');if(codexAbort)throw Error('AI 正在处理，请等待或取消');
 if(!Array.isArray(request.planIds)||request.planIds.length>100)throw Error('分析计划无效');const names=new Set();for(const id of request.planIds){const p=sku().plans.get(id);if(!p)throw Error('请重新分析文件');for(const m of [...p.matches,...(p.related||[]),...(p.fontResources||[])])for(const problem of m.problems||[]){if(problem.startsWith('缺少字体 '))names.add(problem.slice(5));}}
 if(!names.size)throw Error('当前计划没有已识别的缺失字体');const controller=new AbortController();codexAbort=controller;try{const credentials=await require('./services/font-repair.cjs').fontCredentials(codexSettings),directory=path.join(app.getPath('userData'),'font-repair',require('node:crypto').randomUUID());const env=credentials.mode==='local'?await withLocalCodexProxy(process.env,url=>session.defaultSession.resolveProxy(url)):undefined;
 const bridge=await fs.access(path.join(__dirname,'photoshop-bridge.exe')).then(()=>path.join(__dirname,'photoshop-bridge.exe'),()=>helperPath);
 const report=await require('./services/font-repair.cjs').repairFonts([...names],credentials,{directory,helperPath:bridge,signal:controller.signal,env,fetch:(...args)=>net.fetch(...args)});if(report.installed.length&&!controller.signal.aborted)report.verification=await sku().recheckFonts(request.planIds,report.installed);await fs.writeFile(path.join(directory,'font-repair-result.json'),JSON.stringify(report,null,2));return report;
 }finally{if(codexAbort===controller)codexAbort=null;}
})));
ipcMain.handle('sku-pause',safeOperation('sku-pause',()=>sku().pause()));
ipcMain.handle('sku-resume',safeOperation('sku-resume',()=>sku().resume()));
ipcMain.handle('sku-open-reserve',safeOperation('sku-open-reserve',async()=>{await fs.mkdir(sku().reserveRoot,{recursive:true});const error=await require('electron').shell.openPath(sku().reserveRoot);if(error)throw Error(error);return true;}));
ipcMain.handle('sku-cancel',safeOperation('sku-cancel',()=>{codexAbort?.abort();return sku().cancel();}));
ipcMain.handle('sku-open-output',safeOperation('sku-open-output',async request=>{if(!skuOutputFolders.has(request.path))throw Error('结果目录尚未生成');const error=await require('electron').shell.openPath(request.path);if(error)throw Error(error);return true;}));
ipcMain.handle('status',safeOperation('status',async () => serviceStatus()));
ipcMain.handle('record-layout-sample',safeOperation('record-layout-sample',async sample=>learningStore().stage(sample)));
ipcMain.handle('layout-memory-status',safeOperation('layout-memory-status',async()=>learningStore().status()));
ipcMain.handle('layout-memory-examples',safeOperation('layout-memory-examples',async query=>learningStore().retrieve(query||{})));
ipcMain.handle('open-layout-memory',safeOperation('open-layout-memory',async()=>{await fs.mkdir(learningDirectory(),{recursive:true});const message=await require('electron').shell.openPath(learningDirectory());if(message)throw new Error(message);return true;}));
ipcMain.handle('activate-license',safeOperation('activate-license',async value=>authorization.activate(value)));
ipcMain.handle('bootstrap-license',safeOperation('bootstrap-license',async()=>authorization.bootstrap()));
ipcMain.handle('renew-license',safeOperation('renew-license',async()=>authorization.renew()));
ipcMain.handle('check-update',safeOperation('check-update',async()=>updates.check(true)));
ipcMain.handle('defer-update',safeOperation('defer-update',async skip=>updates.defer(!!skip)));
ipcMain.handle('install-update',safeOperation('install-update',async()=>{if(psBusy||batchBusy||codexAbort||agentIntegration.active())throw new Error('请等待当前 Photoshop 或 Codex 任务完成后更新');if(!app.isPackaged)throw new Error('自动安装仅在便携发布包中可用');const updateHelper=await fs.access(path.join(__dirname,'update-helper.exe')).then(()=>path.join(__dirname,'update-helper.exe'),()=>helperPath);return updates.install({appPath:app.getAppPath(),exe:process.execPath,helperPath:updateHelper,quit:()=>app.quit(),onProgress:p=>win.webContents.send('update-progress',p)});}));
ipcMain.handle('service-ready',safeOperation('service-ready',async()=>{await require('./services/update-ack.cjs').acknowledgeStartup({argv:process.argv,dataDir:app.getPath('userData')});return true;}));
ipcMain.handle('preview-background',safeOperation('preview-background',async request=>{
  if(psBusy||batchBusy)throw new Error('原生文件任务正在运行，请等待当前任务完成后重试预览。');
  if(!request||imported.get(request.path)!==request.fingerprint||!Array.isArray(request.ids)||request.ids.length>500||request.ids.some(id=>!Number.isInteger(id)))throw new Error('预览请求无效，请重新导入 PSD');
  psBusy=true;try{if(await hashFile(request.path)!==request.fingerprint)throw new Error('源 PSD 已变化，请重新导入');const sourceMetadata=await actualMetadata(request);require('./mixed-text.cjs').validateMixedEdits(request.mixedTextEdits,{layers:sourceMetadata.layers,format:illustrator.isIllustrator(request.path)?'AI':'PSD'});if((request.mixedTextEdits||[]).some(e=>request.ids.includes(e.layerId)))throw Error('混合字符不能同时普通预览覆盖');validateTextActions(request.textActions,{layers:sourceMetadata.layers,jobs:request.ids.map(layerId=>({layerId}))});validateArtworkHides(request.artworkHides,{objects:sourceMetadata.artworkObjects||[],textActions:request.textActions,jobs:request.ids.map(layerId=>({layerId})),format:illustrator.isIllustrator(request.path)?'AI':'PSD'});if(request.containerEdits?.length||request.extractedContainers?.length){const m=await actualMetadata(request);validateExtractedContainers(request.extractedContainers,{width:m.width,height:m.height,fingerprint:request.fingerprint,layers:m.layers});validateContainerEdits(request.containerEdits,{width:m.width,height:m.height,textIds:request.ids,containers:[...(m.containers||[]),...extractedMetadata(request.extractedContainers)]});}else{validateExtractedContainers(request.extractedContainers);validateContainerEdits(request.containerEdits,{textIds:request.ids});}return await (illustrator.isIllustrator(request.path)?illustrator.createBackground:createBackground)(path.join(app.getPath('userData'),'previews',Date.now().toString()),request.path,request.ids,{helperPath,fingerprint:request.fingerprint,mixedTextEdits:request.mixedTextEdits,textActions:request.textActions,artworkHides:request.artworkHides,containerEdits:request.containerEdits,extractedContainers:request.extractedContainers});}finally{psBusy=false;if(win&&!win.isDestroyed())win.focus();}
}));
ipcMain.handle('inspect-artwork',safeOperation('inspect-artwork',async request=>{
 if(psBusy||batchBusy)throw Error('原生程序正忙，请等待');
 if(!request||!illustrator.isIllustrator(request.path)||imported.get(request.path)!==request.fingerprint)throw Error('请先导入并验证 AI');
 if(await hashFile(request.path)!==request.fingerprint)throw Error('AI 原稿已变化');
 const metadata=await actualMetadata(request),object=metadata.artworkObjects?.find(o=>o.objectId===request.objectId);if(!object)throw Error('对象不存在或不受支持');
 psBusy=true;try{return await illustrator.inspectArtwork(path.join(app.getPath('userData'),'previews','artwork-'+Date.now()),request.path,object,{fingerprint:request.fingerprint});}finally{psBusy=false;}
}));
ipcMain.handle('installed-fonts',safeOperation('installed-fonts',async(format)=>{
  if(psBusy||batchBusy)throw new Error('Photoshop 正忙，请稍后读取字体');
  psBusy=true;try{return await (format==='AI'?illustrator.installedFonts:installedFonts)(path.join(app.getPath('userData'),'fonts',Date.now().toString()));}finally{psBusy=false;if(win&&!win.isDestroyed())win.focus();}
}));
ipcMain.handle('import-psd',safeOperation('import-psd',async (options = {}) => {
  let paths;
  if(options && Object.hasOwn(options,'paths')){
    if(!Array.isArray(options.paths)||!options.paths.length||options.paths.length>100)throw new Error('一次请拖入 1 至 100 个 PSD / PSB / AI 文件。');
    paths=options.paths;
  }else{
    const r = await dialog.showOpenDialog(win, {title: '导入可编辑 PSD / PSB / AI', properties: ['openFile', 'multiSelections'], filters: [{name: 'Photoshop / Illustrator', extensions: ['psd','psb','ai']}]});
    if(r.canceled)return [];paths=r.filePaths;
  }
  const selected=[];for(const p of paths)selected.push(await importFilePath(p,['.psd','.psb','.ai'],'PSD / PSB / AI'));
  const list = []; for (const p of [...new Set(selected)]) list.push(await readPsd(p)); return list;
}));
ipcMain.handle('import-document',safeOperation('import-document',async (options = {}) => {
  let selected;
  if(options && Object.hasOwn(options,'path'))selected=options.path;
  else{const r = await dialog.showOpenDialog(win, {title: '导入唯一目标文案来源', properties: ['openFile'], filters: [{name: '文案文档', extensions: options.workbookOnly?['xlsx']:['xlsx', 'docx', 'csv', 'tsv', 'txt']}]});
    if(r.canceled)return null;selected=r.filePaths[0];}
  if(typeof selected==='string'&&/\.xlsx$/i.test(selected)){const p=await importFilePath(selected,['.xlsx'],'翻译表');return importWorkbook(p,options);}
  const p=await importFilePath(selected,['.docx','.csv','.tsv','.txt'],'文案文档'), name=path.basename(p),ext=path.extname(p).toLowerCase(),buffer=await fs.readFile(p);
  let records, rawText = null;
  const splitMode = options.splitMode === 'paragraph' ? 'paragraph' : 'line';
  if (ext === '.csv' || ext === '.tsv') records = recordsFromRows(parseCsv(buffer.toString('utf8')), name);
  else if (ext === '.docx') {
    const value = await readDocxText(buffer);
    rawText = value; records = recordsFromText(value, name, splitMode);
  } else { rawText = buffer.toString('utf8'); records = recordsFromText(rawText, name, splitMode); }
  if (!records.length) throw new Error('文档没有可用文案，请检查文档内容及拆分方式。');
  return {name, fingerprint: hash(buffer), records, rawText, format: ext.slice(1), splitMode};
}));
ipcMain.handle('resplit-document',safeOperation('resplit-document',async request => {
  if (!request || !['line', 'paragraph'].includes(request.splitMode)) throw new Error('无效的文案拆分方式');
  if (typeof request.rawText === 'string') {
    return recordsFromText(request.rawText, request.name, request.splitMode);
  }
  return resplitRecords(request.records, request.splitMode);
}));
ipcMain.handle('save-project',safeOperation('save-project',async project => {
  const r = await dialog.showSaveDialog(win, {defaultPath: '文案绑定.psdlingo.json', filters: [{name: 'PSD Lingo 项目', extensions: ['json']}]});
  if (r.canceled) return null;
  await fs.writeFile(r.filePath, JSON.stringify(project, null, 2), 'utf8'); return r.filePath;
}));
async function hydrateSavedProject(data,{readCache=new Map(),onProgress=()=>{},verifiedSources,runtime}={}){
  if (data.version !== 1 || !Array.isArray(data.files) || !Array.isArray(data.records) || data.files.length > 100) throw new Error('项目格式不正确。');
  for (const record of data.records) if (typeof record.target !== 'string' || hash(record.target) !== record.digest) throw new Error('项目文案校验失败。');
  const files = [];
  for (const file of data.files) {
    if (file.demo) { files.push(file); continue; }
    onProgress('正在读取原稿：'+file.name+'（'+(files.length+1)+' / '+data.files.length+'）');const key=path.resolve(file.path).toLowerCase();if(!readCache.has(key))readCache.set(key,(async()=>await require('./services/continuation-runtime.cjs').restoreFile(file,{runtime,verifiedSources,metadata:importedMetadata,imported,nativeText:nativeTextEngine,productCopy:productCopyEngine,onProgress})||await readPsd(file.path))());const loaded = {...await readCache.get(key)};if(file.artboardPlan&&!loaded.metadata){loaded.metadata=await readPhotoshopMetadata(path.join(app.getPath('userData'),'artboard-metadata',require('node:crypto').randomUUID()),file.path,{helperPath});if(await hashFile(file.path)!==loaded.fingerprint)throw Error('恢复画板计划时源文件已变化');importedMetadata.set(file.path,{fingerprint:loaded.fingerprint,metadata:loaded.metadata});}
    if (loaded.fingerprint !== file.fingerprint) throw new Error('原稿已改变：' + file.name + '。请重新导入并绑定。');
    let restored=file;if(file.nativeTextScanId||file.artboardPlan?.nativeTextScanId){if(psBusy||batchBusy)throw Error('请先完成当前原生任务再恢复嵌套文字');psBusy=true;try{loaded.metadata=await nativeTextEngine.inspect({source:{path:file.path,fingerprint:loaded.fingerprint},metadata:loaded.metadata||await actualMetadata(loaded)});restored={...file,nativeTextScanId:loaded.metadata.nativeTextScanId,artboardPlan:file.artboardPlan?{...file.artboardPlan,nativeTextScanId:loaded.metadata.nativeTextScanId}:undefined};if(restored.artboardPlan)require('./photoshop-artboard-plan.cjs').validateArtboardPlan(restored.artboardPlan,loaded.metadata);}finally{psBusy=false;}}
    files.push({...restored, ...loaded});
  }
  return {...data, files};
}
ipcMain.handle('load-project',safeOperation('load-project',async (options = {}) => {
  let selected;
  if(options && Object.hasOwn(options,'path'))selected=options.path;
  else{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'PSD Lingo 项目',extensions:['json']}]});if(r.canceled)return null;selected=r.filePaths[0];}
  const projectPath=await importFilePath(selected,['.json'],'项目');
  const data = JSON.parse(await fs.readFile(projectPath, 'utf8'));
  return hydrateSavedProject(data);
}));
ipcMain.handle('export-plan',safeOperation('export-plan',async plan => {
  protectedAction('psd-export');
  await checkPlan(plan);
  if(plan.files.some(illustrator.isIllustrator))throw Error('AI 文件请使用“生成修改后的文件”直接输出可编辑 AI；Photoshop 脚本仅适用于 PSD / PSB');
  const r = await dialog.showSaveDialog(win, {defaultPath: 'PSD-Lingo-批量替换.jsx', filters: [{name: 'Photoshop 执行脚本', extensions: ['jsx']}]});
  if (r.canceled) return null;
  await fs.writeFile(r.filePath, '\uFEFF' + jsxForPlan(plan), 'utf8');
  await fs.writeFile(r.filePath + '.plan.json', JSON.stringify(plan, null, 2), 'utf8');
  return r.filePath;
}));
async function executePhotoshopPlan(plan,outputDir){
    const dir = path.join(app.getPath('userData'), 'jobs', Date.now().toString()); await fs.mkdir(dir, {recursive: true});
    const jsx = path.join(dir, 'run.jsx'), vbs = path.join(dir, 'bridge.vbs');
    const resultPath=path.join(dir,'result.json');
    await helper(helperPath,{op:'prepare-photoshop'});
    const script=jsxForPlan(plan,outputDir?{outputDirectory:outputDir,silent:true}:{}).replace('report.close();','report.close(); report.copy('+JSON.stringify(resultPath.replace(/\\/g,'/'))+');');
    await fs.writeFile(jsx, '\uFEFF' + script, 'utf8');
    await fs.writeFile(vbs, 'On Error Resume Next\r\nSet ps = CreateObject("Photoshop.Application")\r\nIf Err.Number <> 0 Then\r\n WScript.Echo "Photoshop COM unavailable. Install Photoshop or export JSX and run via File > Scripts > Browse."\r\n WScript.Quit 1\r\nEnd If\r\nErr.Clear\r\nps.DoJavaScriptFile WScript.Arguments(0)\r\nIf Err.Number <> 0 Then\r\n WScript.Echo Err.Description\r\n WScript.Quit 1\r\nEnd If\r\nWScript.Echo "Photoshop finished. Review the report in your chosen output folder."\r\n', 'utf8');
    await new Promise((resolve, reject) => {
      const child = spawn('cscript.exe', ['//nologo','//U', vbs, jsx], {windowsHide: true}); const output = [];
      child.stdout.on('data', b => output.push(b)); child.stderr.on('data', b => output.push(b));
      child.on('error', reject); child.on('close', code => {const message=decodeBridgeOutput(output);if(code===0)resolve(message);else reject(message.includes('Photoshop COM unavailable')?Error(message):require('./services/native-receipt.cjs').missingReceipt(Error(message||'Photoshop脚本进程未正常返回')));});
    });
    let psResults;try{psResults=JSON.parse((await fs.readFile(resultPath,'utf8')).replace(/^\uFEFF/,''));if(!Array.isArray(psResults)||psResults.length!==plan.files.length)throw Error('原生结果数量不符');}catch(error){throw require('./services/native-receipt.cjs').missingReceipt(error);}

    for(const [i,r]of psResults.entries()){const file=plan.files[i];if(!file)continue;if(!r.error&&file.deliveryBoards)try{await require('./photoshop-delivery.cjs').verifyDelivery(r,{expectedBoards:file.deliveryBoards});}catch(e){r.error=e.message;r.status='最终JPG核验未通过，已保存副本保留';}if(await hashFile(file.path)!==file.fingerprint){r.error='制作期间原稿已变化，当前副本不能作为已通过成果';}}
    return psResults;
}
async function runPhotoshop(plan,outputDir=null,{deferLearning=false}={}){
  protectedAction('psd-export');
  if(psBusy)throw Error('原生文件任务正在运行');
  psBusy=true;
  try{
    await checkPlan(plan);
    const result=await require('./native-runner.cjs').runNativePlan(plan,{
      illustrator:p=>illustrator.runPlan(path.join(app.getPath('userData'),'jobs','ai-'+Date.now()),p,outputDir),
      photoshop:p=>executePhotoshopPlan(p,outputDir)
    });
    const psFiles=plan.files.filter(f=>!illustrator.isIllustrator(f));
    if(!deferLearning&&psFiles.length){const psResults=result.results.filter((r,i)=>!illustrator.isIllustrator(plan.files[i]));result.learning=learningBackground.start(()=>learningStore().finalize({...plan,files:psFiles},psResults));}
    return result;
  }finally{psBusy=false;}
}
async function finalizeLanguageBatchLearning(tasks,documents,{cancelled=false,unprocessed=0}={}){
  tasks=tasks.map(t=>{const original=t.plan.files;const document=documents.find(d=>d.id===t.id);if(document)document.results=(document.results||[]).filter((r,i)=>!illustrator.isIllustrator(original[i]));return {...t,plan:{...t.plan,files:original.filter(f=>!illustrator.isIllustrator(f))}};}).filter(t=>t.plan.files.length);
  if(!tasks.length)return {skipped:true,reason:'Illustrator 学习记录将在后续版本接入，AI 导出不受影响'};
  const totalCount=tasks.reduce((n,t)=>n+t.plan.files.length,0);let validOutputs=0;
  for(const task of tasks){const document=documents.find(d=>d.id===task.id);if(!document||document.error)continue;
    for(let i=0;i<task.plan.files.length;i++){const file=task.plan.files[i],result=document.results?.[i];
      if(result?.file===file.name&&!result.error&&result.output)try{if(await verifyPsdOutput(result.output))validOutputs++;}catch{}
    }
  }
  const errorCount=totalCount-validOutputs,errorRatio=totalCount?errorCount/totalCount:1;
  const started=documents.length>0,widespreadError=!started||errorRatio>=.5,incomplete=cancelled||unprocessed>0||documents.length!==tasks.length;
  let confirmed=0,unmatched=0;
  if(!widespreadError&&!incomplete)for(const task of tasks){const document=documents.find(d=>d.id===task.id);if(!document||document.error)continue;
    // The whole batch owns the error threshold. A successful file in a
    // partly failed language remains eligible when the complete batch is healthy.
    const result=await learningStore().finalize(task.plan,document.results,{maxErrorRatio:1});confirmed+=result.confirmed||0;unmatched+=result.unmatched||0;document.learning=result;
  }
  return {...await learningStore().status(),confirmed,unmatched,started,operationComplete:started&&confirmed>0&&!widespreadError&&!incomplete,widespreadError,cancelled,incomplete,errorCount,totalCount,errorRatio};
}
ipcMain.handle('run-photoshop',safeOperation('run-photoshop',async plan=>{if(batchBusy)throw new Error('批量任务正在运行');const r=await dialog.showOpenDialog(win,{title:'选择修改后 PSD / PSB / AI 的保存文件夹',properties:['openDirectory','createDirectory']});if(r.canceled)return null;return runPhotoshop(plan,r.filePaths[0]);}));
async function readLanguageDocument(p,splitMode){
  const name=path.basename(p),ext=path.extname(p).toLowerCase(),buffer=await fs.readFile(p);
  let records;
  if(ext==='.csv'||ext==='.tsv')records=recordsFromRows(parseCsv(buffer.toString('utf8')),name);
  else if(ext==='.docx')records=recordsFromText(await readDocxText(buffer),name,splitMode);
  else if(ext==='.txt')records=recordsFromText(buffer.toString('utf8'),name,splitMode);
  else throw new Error('不支持的语言文档格式');
  if(!records.length||records.length>2000)throw new Error('文案为空或超过 2000 条');
  return {name,path:p,fingerprint:hash(buffer),records};
}
ipcMain.handle('save-batch-template',safeOperation('save-batch-template',async request=>{
  if(batchBusy)throw new Error('请等待批量任务完成');
  await checkPlan(request.plan);
  const template=createTemplate(request.plan,request);
  const r=await dialog.showSaveDialog(win,{title:'保存排版与绑定模板',defaultPath:'多语言排版.psdlingo-template.json',filters:[{name:'PSD Lingo 模板',extensions:['json']}]});
  if(r.canceled)return null;
  await fs.writeFile(r.filePath,JSON.stringify(template,null,2),'utf8');activeBatchTemplate=template;batchDocuments.clear();return {template,path:r.filePath};
}));
ipcMain.handle('load-batch-template',safeOperation('load-batch-template',async(options={})=>{
  if(batchBusy)throw new Error('请等待批量任务完成');
  let selected;
  if(options && Object.hasOwn(options,'path'))selected=options.path;
  else{const r=await dialog.showOpenDialog(win,{title:'打开多语言排版模板',properties:['openFile'],filters:[{name:'PSD Lingo 模板',extensions:['json']}]});if(r.canceled)return null;selected=r.filePaths[0];}
  const templatePath=await importFilePath(selected,['.json'],'模板');
  const bytes=await fs.readFile(templatePath);
  const template=validateTemplate(JSON.parse(bytes.toString('utf8')));
  for(const file of template.plan.files){const actual=await readPsd(file.path,{preview:false});if(actual.fingerprint!==file.fingerprint)throw new Error('模板原 PSD 已变化，请重新导入原稿并制作模板：'+file.name);}
  await checkPlan(template.plan);activeBatchTemplate=template;batchDocuments.clear();return {template,path:templatePath};
}));
ipcMain.handle('choose-language-folder',safeOperation('choose-language-folder',async()=>{
  if(batchBusy)throw new Error('请等待批量任务完成');if(!activeBatchTemplate)throw new Error('请先保存或打开排版模板');
  const r=await dialog.showOpenDialog(win,{title:'选择语言文档文件夹（读取顶层 DOCX / TXT / CSV / TSV）',properties:['openDirectory']});if(r.canceled)return null;
  const folder=r.filePaths[0],entries=(await fs.readdir(folder,{withFileTypes:true})).filter(e=>e.isFile()&&!e.name.startsWith('~$')&&/\.(docx|txt|csv|tsv)$/i.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));
  if(!entries.length)throw new Error('文件夹内没有支持的语言文档');if(entries.length>100)throw new Error('一次批量最多 100 份语言文档，请分组处理');
  batchDocuments.clear();const documents=[];
  for(const e of entries){const p=path.join(folder,e.name),id=require('node:crypto').randomUUID();try{const doc=await readLanguageDocument(p,activeBatchTemplate.splitMode);batchDocuments.set(id,doc);documents.push({...doc,id});}catch(error){documents.push({id,name:e.name,error:error.message});}}
  return {folder,documents};
}));
let referenceLanguageFlow;
function languageReference(){return referenceLanguageFlow||(referenceLanguageFlow=new (require('./language-reference.cjs').LanguageReferenceWorkflow)(path.join(app.getPath('userData'),'language-reference'),{onProgress:p=>win?.webContents.send('language-reference-progress',p)}));}
let recipeLanguageFlow;
function languageRecipe(){return recipeLanguageFlow||(recipeLanguageFlow=new (require('./language-recipe.cjs').LanguageRecipeWorkflow)(path.join(app.getPath('userData'),'language-recipes'),{onProgress:p=>win?.webContents.send('language-reference-progress',p)}));}
ipcMain.handle('list-language-recipes',safeOperation('list-language-recipes',async()=>languageRecipe().list()));
ipcMain.handle('load-language-recipe',safeOperation('load-language-recipe',request=>bulkTask(async()=>{
 if(!request?.source||!imported.has(request.source))throw Error('请先导入 AI 原稿');
 let file;if(request.savedId)file=languageRecipe().savedPath(request.savedId);else{const choice=await dialog.showOpenDialog(win,{title:'选择本机已学习的多语言排版方案',properties:['openFile'],filters:[{name:'排版方案',extensions:['json']}]});if(choice.canceled)return null;file=choice.filePaths[0];}
 return languageRecipe().load(request.source,file);
})));
ipcMain.handle('run-language-recipe',safeOperation('run-language-recipe',request=>bulkTask(async()=>{
 protectedAction('psd-export');const choice=await dialog.showOpenDialog(win,{title:'选择新文件夹，保存关系排版AI副本和JPG',properties:['openDirectory','createDirectory']});if(choice.canceled)return null;
 return languageRecipe().run(request.planId,choice.filePaths[0],{exportJpg:request.exportJpg!==false});
})));
ipcMain.handle('analyze-language-reference',safeOperation('analyze-language-reference',request=>bulkTask(async()=>{
 if(!request?.source||!imported.has(request.source))throw Error('请先导入 AI 原稿');
 const choice=await dialog.showOpenDialog(win,{title:'选择用户已确认的目标语言 AI 成稿（文字与排版依据）',properties:['openFile'],filters:[{name:'Illustrator',extensions:['ai']}]});if(choice.canceled)return null;
 return languageReference().analyze(request.source,choice.filePaths[0]);
})));
ipcMain.handle('run-language-reference',safeOperation('run-language-reference',request=>bulkTask(async()=>{
 protectedAction('psd-export');const choice=await dialog.showOpenDialog(win,{title:'另存多语言工作副本到新文件夹',properties:['openDirectory','createDirectory']});if(choice.canceled)return null;
 const data=await languageReference().run(request.planId,request.mappings,choice.filePaths[0],{overrides:request.overrides||[],adjustments:request.adjustments||[]});if(request.exportJpg){const verification=await languageReference().verifyAndExport(data);data.jpgFiles=verification.files;data.reopenVerified=verification.reopenVerified;}return data;
})));
ipcMain.handle('add-workbook-language',safeOperation('add-workbook-language',async request=>{
 if(batchBusy)throw Error('请等待批量任务完成');if(!activeBatchTemplate)throw Error('请先保存或打开排版模板');
 const p=await importFilePath(request?.path,['.xlsx'],'翻译表'),doc=await importWorkbook(p,{fingerprint:request.fingerprint,selection:request.selection});
 if(doc.selectionRequired)throw Error('请先选择并预览表格范围');
 const id=require('node:crypto').randomUUID();doc.name=doc.name.replace(/\.xlsx$/i,'')+'-'+doc.sheet+'-'+doc.selection.segments.map(s=>s.targetColumns+s.rowStart+'-'+s.rowEnd).join('_');batchDocuments.set(id,doc);return {...doc,id};
}));
ipcMain.handle('restore-work-batch',safeOperation('restore-work-batch',async saved=>{
 if(psBusy||batchBusy)throw Error('请先完成当前原生任务');const template=validateTemplate(saved.template);await checkPlan(template.plan);const restored=[],next=new Map();for(const d of saved.documents||[]){if(d.error){restored.push(d);continue;}const doc=/\.xlsx$/i.test(d.path)?await importWorkbook(d.path,{fingerprint:d.fingerprint,selection:d.selection}):await readLanguageDocument(d.path,template.splitMode);if(doc.fingerprint!==d.fingerprint)throw Error('语言文档已变化：'+d.name);const id=require('node:crypto').randomUUID();next.set(id,doc);restored.push({...d,...doc,id,selected:d.selected});}activeBatchTemplate=template;batchDocuments=next;return {template,documents:restored};
}));
ipcMain.handle('cancel-language-batch',safeOperation('cancel-language-batch',async()=>{batchCancelled=true;return {message:'将在当前语言完成后停止，其余文档不执行'};}));
ipcMain.handle('prepare-batch-preview',safeOperation('prepare-batch-preview',async request=>{
  if(batchBusy)throw new Error('请等待批量任务完成');if(!activeBatchTemplate)throw new Error('请先打开排版模板');
  const doc=batchDocuments.get(request?.id);if(!doc)throw new Error('语言文档尚未加载，请重新选择文件夹');
  if(hash(await fs.readFile(doc.path))!==doc.fingerprint)throw new Error('语言文档已变化，请重新选择文件夹');
  const plan=planForDocument(activeBatchTemplate,doc,{mode:request.mode,fitMode:request.fitMode,minimumPercent:request.minimumPercent,layouts:request.layouts,manualPlan:request.manualPlan,preview:true});
  await checkPlan(plan);const items=[];
  for(const f of plan.files){const item=await readPsd(f.path);if(item.fingerprint!==f.fingerprint)throw new Error('模板原稿已变化，请重新制作模板');items.push(item);}
  return {items,plan};
}));
ipcMain.handle('run-language-batch',safeOperation('run-language-batch',async request=>{
  protectedAction('psd-export');if(batchBusy)throw new Error('批量任务正在运行');if(!activeBatchTemplate)throw new Error('模板尚未准备');
  if(!request||!Array.isArray(request.documents)||!request.documents.length||request.documents.length>100)throw new Error('请选择要处理的语言文档');
  batchBusy=true;batchCancelled=false;let done=0;
  try{const waitStart=Date.now();while(psBusy){if(Date.now()-waitStart>60000)throw new Error('Photoshop 预览任务尚未结束，请稍后重试');await new Promise(resolve=>setTimeout(resolve,100));}const seen=new Set(),tasks=[];
  for(const item of request.documents){const doc=batchDocuments.get(item.id);if(!doc||seen.has(item.id))throw new Error('语言文档选择无效，请重新选择文件夹');seen.add(item.id);
    if(hash(await fs.readFile(doc.path))!==doc.fingerprint)throw new Error('语言文档已变化，请重新选择文件夹：'+doc.name);
    const plan=planForDocument(activeBatchTemplate,doc,{mode:request.mode,fitMode:request.fitMode,minimumPercent:request.minimumPercent,layouts:item.layouts,manualPlan:item.manualPlan});await checkPlan(plan);tasks.push({id:item.id,doc,plan});
  }
  const r=await dialog.showOpenDialog(win,{title:'选择批量 PSD 输出文件夹（不会覆盖已有文件）',properties:['openDirectory','createDirectory']});if(r.canceled)return null;
  const outputDir=r.filePaths[0];await fs.access(outputDir,require('node:fs').constants.W_OK);const results=[];
  for(const t of tasks){if(batchCancelled)break;win.webContents.send('batch-progress',{total:tasks.length,done,current:t.doc.name,running:true});
    try{if(hash(await fs.readFile(t.doc.path))!==t.doc.fingerprint)throw new Error('文档在执行前发生变化，请重新读取');const result=await runPhotoshop(t.plan,outputDir,{deferLearning:true});results.push({id:t.id,document:t.doc.name,...result});}catch(e){results.push({id:t.id,document:t.doc.name,error:e.message,saved:0,failed:t.plan.files.length,results:[]});}
    done++;win.webContents.send('batch-progress',{total:tasks.length,done,current:t.doc.name,last:results.at(-1),running:true});
  }
  const summary={templateName:activeBatchTemplate.name,outputDir,cancelled:batchCancelled,documents:results,saved:results.reduce((n,r)=>n+r.saved,0),failed:results.reduce((n,r)=>n+r.failed,0),unprocessed:tasks.length-done};
  const learningTasks=structuredClone(tasks),learningResults=structuredClone(results),learningSummary={cancelled:summary.cancelled,unprocessed:summary.unprocessed};
  summary.learning=learningBackground.start(()=>finalizeLanguageBatchLearning(learningTasks,learningResults,learningSummary));
  const report=path.join(outputDir,'PSD-Lingo-batch-'+Date.now()+'.json');await fs.writeFile(report,JSON.stringify(summary,null,2));return {...summary,report};
  }finally{batchBusy=false;win.webContents.send('batch-progress',{total:request.documents.length,done,running:false});}
}));
ipcMain.handle('load-codex-settings',safeOperation('load-codex-settings',()=>codexSettings.get()));
ipcMain.handle('save-codex-settings',safeOperation('save-codex-settings',value=>codexSettings.save(value)));
ipcMain.handle('clear-codex-settings',safeOperation('clear-codex-settings',()=>codexSettings.clear()));
ipcMain.handle('list-api-models',safeOperation('list-api-models',input=>listApiModels(input,{settings:codexSettings,fetch:(...args)=>net.fetch(...args)})));
ipcMain.handle('discover-codex',safeOperation('discover-codex',async()=>{let savedPath='';try{savedPath=(await codexSettings.get()).executable;}catch{}return discoverCodex({savedPath});}));
ipcMain.handle('choose-codex',safeOperation('choose-codex',async () => {
  const r = await dialog.showOpenDialog(win, {title: '选择官方 Codex CLI 可执行文件', properties: ['openFile'], filters: [{name: 'Codex CLI', extensions: ['exe']}]});
  return r.canceled ? null : r.filePaths[0];
}));
ipcMain.handle('cancel-codex',safeOperation('cancel-codex',async () => { codexAbort?.abort(); return true; }));
ipcMain.handle('codex-layout',safeOperation('codex-layout',async request => {
  protectedAction('codex-match');
  if(codexAbort)throw new Error('AI 正在处理，请等待或取消。');
  const controller=new AbortController();codexAbort=controller;
  const timeout=agentIntegration.active()?null:setTimeout(()=>controller.abort(),180000);
  try{
    const credentials=agentIntegration.active()?await require('./services/assistant-connection.cjs').assistantCredentials(codexSettings):await codexSettings.credentials();
    if(agentIntegration.active()&&request.assistantModel)credentials.localModel=request.assistantModel;
    let workingDirectory;
    if(credentials.mode==='local'){workingDirectory=path.join(app.getPath('userData'),'codex-empty');await fs.mkdir(workingDirectory,{recursive:true});}
    const env=credentials.mode==='local'?await withLocalCodexProxy(process.env,url=>session.defaultSession.resolveProxy(url)):undefined;
    // Learning is auxiliary: use verified local rules now; cloud sync must not
    // stall each layout request on an unavailable network.
    void knowledgeCloud?.sync().catch(()=>{});const syncStatus=knowledgeCloud?.status();
    const layoutService=require('./services/ai-layout.cjs');
    const layout=request.phase==='audit-batch'?(r,c,d)=>require('./services/design-audit-batch.cjs').auditBatch(r.pages,c,d,layoutService):layoutService.suggestLayout;
    const result=await layout(request,credentials,{localAnalysis:agentIntegration.analysisProvider(),onUsage:m=>agentIntegration.recordUsage(m),assistantReferencesByPage:request.phase==='audit-batch'&&agentIntegration.active()?request.pages.map(p=>agentIntegration.references(p.assistantReferenceIds)):undefined,assistantReferences:agentIntegration.active()?agentIntegration.references(request.assistantReferenceIds):[],knowledgeDirectory:path.join(app.getPath('userData'),'localization-knowledge','library'),fetchReferences:query=>authorization.learningReferences(query),signal:controller.signal,workingDirectory,env,fetch:(...args)=>net.fetch(...args)});
    if(syncStatus){result.learning||={};result.learning.sync=syncStatus;}
    if(credentials.mode==='local'&&result.executableUsed&&result.executableUsed!==credentials.executable){try{await codexSettings.save({executable:result.executableUsed});}catch{result.configurationWarning='排版建议已完成，但备用 Codex 路径未能保存。';}}
    return result;
  }finally{clearTimeout(timeout);if(codexAbort===controller)codexAbort=null;}
}));
ipcMain.handle('codex-suggest',safeOperation('codex-suggest',async request => {
  protectedAction('codex-match');
  if(codexAbort)throw new Error('AI 正在处理，请等待或取消。');
  const controller=new AbortController();codexAbort=controller;
  const timeout=agentIntegration.active()?null:setTimeout(()=>controller.abort(),180000);
  try{
    const credentials=agentIntegration.active()?await require('./services/assistant-connection.cjs').assistantCredentials(codexSettings):await codexSettings.credentials();
    if(agentIntegration.active()&&request.assistantModel)credentials.localModel=request.assistantModel;
    let workingDirectory;
    if(credentials.mode==='local'){workingDirectory=path.join(app.getPath('userData'),'codex-empty');await fs.mkdir(workingDirectory,{recursive:true});}
    const env=credentials.mode==='local'?await withLocalCodexProxy(process.env,url=>session.defaultSession.resolveProxy(url)):undefined;
    const result=await matchCopy(request,credentials,{localAnalysis:agentIntegration.analysisProvider(),onUsage:m=>agentIntegration.recordUsage(m),signal:controller.signal,workingDirectory,env,onProgress:value=>{if(win&&!win.isDestroyed())win.webContents.send('binding-progress',{requestId:request.requestId,...value});},fetch:(...args)=>net.fetch(...args)});
    if(credentials.mode==='local'&&result.executableUsed&&result.executableUsed!==credentials.executable){try{await codexSettings.save({executable:result.executableUsed});}catch{result.configurationWarning='文案对应已完成，但新找到的 Codex 路径未能保存；下次使用前请在设置中重新自动查找并保存。';}}
    return result;
  }finally{clearTimeout(timeout);if(codexAbort===controller)codexAbort=null;}
}));

const workRecords=require('./services/work-records.cjs').installWorkRecords({ipcMain,safe,dataDirectory:()=>app.getPath('userData'),version:app.getVersion?.()||'',shell:require('electron').shell,onProgress:value=>{if(win&&!win.isDestroyed())win.webContents.send('work-record-progress',value);},hydrateProject:hydrateSavedProject,captureRuntime:async s=>{const continuation=await require('./services/continuation-runtime.cjs').capture({snapshot:s,metadata:importedMetadata,nativeText:nativeTextEngine,productCopy:productCopyEngine,directory:path.join(app.getPath('userData'),'continuation-previews')});const ref=s?.workflows?.batch?.reference;return {continuation,agent:agentIntegration.captureRuntime(s?.assistant?.executionScope||s?.assistant?.id),reference:ref?.plan?.id?referenceLanguageFlow?.plans.get(ref.plan.id):null,recipe:ref?.recipe?.plan?.id?recipeLanguageFlow?.plans.get(ref.recipe.plan.id):null};},restoreRuntime:async s=>{agentIntegration.restoreRuntime(s.runtime?.agent);const ref=s.workflows?.batch?.reference;if(s.runtime?.reference&&ref?.plan){const p=s.runtime.reference;for(const d of [p.source,p.reference])if(await hashFile(d.path)!==d.fingerprint)throw Error('参考成稿或原稿已变化，请重新核对');const id=require('node:crypto').randomUUID();languageReference().plans.set(id,{...p,id});ref.plan={...p,id};}if(s.runtime?.recipe&&ref?.recipe?.plan){const p=s.runtime.recipe;if(await hashFile(p.source)!==p.recipe.source.fingerprint)throw Error('排版方案原稿已变化');const id=require('node:crypto').randomUUID();languageRecipe().plans.set(id,p);ref.recipe.plan.id=id;}return s;},isBusy:()=>psBusy||batchBusy||!!codexAbort||agentIntegration.active()});
const productCopyEngine=require('./services/sku-product-copy-engine.cjs').createProductCopyEngine({onIssue:issue=>captureDiagnostic({kind:'native-object',operation:'inspect_product_copy',...issue}),helperPath,engine:{execute:(...a)=>sku().execute(...a),run:(...a)=>sku().run(...a),get plans(){return sku().plans;}}});
const nativeTextEngine=require('./services/native-text-engine.cjs').createNativeTextEngine({onIssue:issue=>captureDiagnostic({kind:'native-object',operation:'inspect_native_text',...issue}),engine:{execute:(...a)=>sku().execute(...a),run:(...a)=>sku().run(...a),get plans(){return sku().plans;}}});
const productTemplateEngine=require('./services/sku-product-template-engine.cjs').createProductTemplateEngine({directory:()=>path.join(app.getPath('userData'),'sku-template-scans'),helperPath,readMapping:id=>productMappings.read(id)});
async function runArtboards({source,plan,directory,prepared,onProgress,previewBoardIds,reusableBoards,metadataOnly,nativeText,boardIds,nativeTextScanId,productMapping,regions,templateInput,templateInputs,templateAction,templateArgs}){
 if(psBusy||batchBusy)throw Error('原生文件任务正在运行，请稍后生成画板');
 if(imported.get(source.path)!==source.fingerprint||!templateInput&&!templateInputs&&!plan?.productTemplate&&await hashFile(source.path)!==source.fingerprint)throw Error('画板模板未导入或已经变化，请重新导入');
 psBusy=true;try{let metadata=await actualMetadata(source);if(!metadata.artboards||metadata.layers.some(l=>!l.nativePath)){metadata=await readPhotoshopMetadata(path.join(app.getPath('userData'),'artboard-metadata',require('node:crypto').randomUUID()),source.path,{helperPath});if(await hashFile(source.path)!==source.fingerprint)throw Error('读取画板期间源文件已变化');importedMetadata.set(source.path,{fingerprint:source.fingerprint,metadata});}if(metadataOnly){if(nativeText)return nativeTextEngine.inspect({source,metadata,boardIds,scanId:nativeTextScanId});if(productMapping){const mapping=await productMappings.read(productMapping);if(!mapping.approved||path.resolve(mapping.source.path).toLowerCase()!==path.resolve(source.path).toLowerCase())throw Error('产品对应确认与原稿不一致');if(templateInput||templateInputs){if(templateAction==='configure_product_template')return productTemplateEngine.configure({source,mapping,metadata,template:templateInput,templates:templateInputs,args:templateArgs});if(!templateInput)throw Error('inspect_product_template每次检查一个模板，请分别检查后统一配置');const scan=await productTemplateEngine.inspect({source,mapping,metadata,template:templateInput});const report=require('./services/sku-product-template-engine.cjs').templateReport(scan,templateArgs);if((templateArgs?.offset||0)===0){const image=await fs.readFile(scan.templateImage);if(require('node:crypto').createHash('sha256').update(image).digest('hex')!==scan.templateImageHash)throw Error('模板参考图已变化，请重新检查');report.images=['data:image/jpeg;base64,'+image.toString('base64')];report.imageContext='外部模板原始参考图，仅用于确认新文案块和视觉关系，不是原稿或修改后成果';}return report;}return productCopyEngine.inspect({source,mapping,metadata,regions});}return metadata;}if(!plan.productCopyScanId&&!plan.nativeTextScanId)require('./photoshop-artboard-plan.cjs').validateArtboardPlan(plan,metadata);if(plan.productTemplate&&prepared)await productTemplateEngine.validate({source,plan});if(prepared){if(await hashFile(prepared.output)!==prepared.fingerprint)throw Error('画板工作副本已变化，请更新计划后重新生成');for(const a of prepared.artifactFingerprints||[])if(await hashFile(a.path)!==a.hash)throw Error('画板核验图已变化，不能复用');return {...prepared,reused:true};}if(plan.nativeTextScanId)return await nativeTextEngine.run({source,plan,directory,onProgress});if(plan.productTemplate)return await productTemplateEngine.run({source,plan,directory,onProgress,previewBoardIds,reusableBoards});if(plan.productCopyScanId)return await productCopyEngine.run({source,plan,directory,onProgress});return await require('./photoshop-artboards.cjs').composeArtboards({source,plan,metadata,directory,helperPath,onProgress});}finally{psBusy=false;}
}
const agentIntegration=require('./services/agent-integration.cjs').installAgent({workRecords,ipcMain,dialog,window:()=>win,dataDirectory:()=>app.getPath('userData'),settings:()=>codexSettings,fetch:(...args)=>net.fetch(...args),localEnv:()=>withLocalCodexProxy(process.env,url=>session.defaultSession.resolveProxy(url)),guard:()=>protectedAction('codex-match'),isBusy:()=>psBusy||batchBusy||!!codexAbort,importWorkbook,runPhotoshop,runArtboards,productMappings,safe,cancelAi:()=>codexAbort?.abort(),reportState:reportAgentState});
const typographyWorkflow=require('./services/typography-workflow.cjs').createTypographyWorkflow({runArtboards,runPhotoshop,directory:()=>path.join(app.getPath('userData'),'typography'),isBusy:()=>psBusy||batchBusy||agentIntegration.active()});
ipcMain.handle('typography-workflow',safeOperation('typography-workflow',input=>{protectedAction('psd-export');return typographyWorkflow(input);}));

ipcMain.handle('diagnostic-status',safeOperation('diagnostic-status',()=>diagnostics.status(),'diagnostic-status'));
ipcMain.handle('diagnostic-flush',safeOperation('diagnostic-flush',()=>diagnostics.flush(),'diagnostic-flush'));
ipcMain.handle('diagnostic-copy',safeOperation('diagnostic-copy',async()=>{const status=await diagnostics.status();require('electron').clipboard.writeText(status.lastId||'暂无错误记录');return status.lastId;},'diagnostic-copy'));
ipcMain.handle('diagnostic-renderer',safeOperation('diagnostic-renderer',value=>captureDiagnostic({kind:'renderer',operation:typeof value?.operation==='string'?value.operation:'renderer',message:value?.message,stack:value?.stack,code:value?.code}),'diagnostic-renderer'));
