import {validateMixedEdits} from '../mixed-text.cjs';
import {installWorkRecords,readWorkControls,writeWorkControls} from './work-records.js';
import {textActionsFor,validateCreation} from '../native-text-objects.cjs';
import {displayText} from '../text-display-style.cjs';
import {presentationSuggestions,validatePresentation} from '../localization-presentation.cjs';
import {importTranslation} from './translation-import.js';
import {installSkuWorkflow} from './sku-workflow.js';
import {installBulkReplace} from './bulk-replace.js';
import {confirmAction,showTaskProgress} from './dialogs.js';
import {installSelectControls} from './select-controls.js';
installSelectControls();
import {installAiLayout} from './ai-layout.js';
import {createBatchLayoutRuntime} from './batch-layout-runtime.js';
import {layoutText,validateParagraphs} from '../design-text-layout.cjs';
import {buildDesignLayoutRequest} from '../design-layout-context.cjs';
import {removeImportedFile,clearImportedFiles,clearImportedDocument} from './import-cleanup.js';
import {installContextProperties} from './context-properties.js';
import {installOutsideDismiss,installBindingProgress} from './interaction-feedback.js';
import {bindFileDrop,preventFileNavigation} from './file-drop.js';
import {installWorkflow} from './workflow.js';
import {installBatch} from './batch.js';
import {createBatchPreview} from './batch-preview.js';
import {restoreReplacementZoom} from './replacement-zoom.js';
import {installServices} from './services.js';
import {installApiModels} from './api-models.js';
import {installAgentUi} from './agent.js';
import {createAgentWorkspace} from './agent-workspace.js';
import {captureBindingRequest,applyBindingResult} from './ai-binding.js';
import {installHistory} from './history.js';
import {installHistoryPanel} from './history-panel.js';
import {installAiLayoutHighlight} from './ai-layout-highlight.js';
import {installPreviewNavigation} from './preview-navigation.js';
import {clampPosition} from '../position.cjs';
import {createLayoutEditor} from './layout-editor.js';
import {createContainerEditor} from './container-editor.js';
import {installContainerSplit} from './container-split.js';
import {createContainerExtractor} from './container-extraction.js';
import {restoreExtractedContainers} from './extracted-container-state.js';
import {installWorkspaceLayout} from './workspace-layout.js';
import {installLayoutLearning} from './layout-learning.js';
import {startLearningTask} from './background-learning.js';
import {validateArtworkHides} from '../artwork-visibility.cjs';
import {activeContainerEdits} from '../container-fit.cjs';
import {proposeVisualLayout} from '../visual-layout.cjs';
import {readPsd} from 'ag-psd';
import {extractLayers,extractContainers} from '../metadata.cjs';
import {previewDimensions} from '../photoshop-file.cjs';
import {smartFit,manualStyleFor} from '../layout.cjs';
const $ = id => document.getElementById(id);
const state = {files: [], records: [], docName: '', docFingerprint: '', sourceDocument: null, fileIndex: 0, layerIndex: 0, chosen: null, scale: 1, tool: 'select', settings: {}, checked: false};
let workRecords=null;let contextProperties,bindingProgress,containerSplit,history,aiHighlights;let toastTimer, layoutEditor, containerEditor, layoutLearning, workflow;
const layoutCache=new Map();
function toast(text, error = false) { $('toast').textContent = text; $('toast').className = error ? 'error' : ''; $('toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').style.display = 'none', error ? 10000 : 5500); }
const pendingWorkspaceCalls=new Set();
async function call(method, payload) {
  if (!window.desktop) throw new Error('请通过“启动测试版.cmd”打开桌面软件。此页面仅支持示例预览。');
  const lock=['importPsd','importDocument','loadProject','resplitDocument','runPhotoshop','runLanguageBatch','prepareBatchPreview','loadBatchTemplate','saveBatchTemplate','exportPlan','suggest','suggestLayout'].includes(method);if(lock)pendingWorkspaceCalls.add(method);try{const execute=async value=>{const r=await window.desktop[method](value);if(!r.ok)throw new Error(r.error);return r.value;};return workRecords?await workRecords.trackedCall(method,payload,execute):await execute(payload);}finally{if(lock)pendingWorkspaceCalls.delete(method);}
}
const file = () => state.files[state.fileIndex];
const layer = () => file()?.layers[state.layerIndex];
const record = id => state.records.find(r => r.id === id);
function node(tag, className, text) { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
function selectedLayer(index) { contextProperties?.clear();containerEditor?.clearSelection?.();layoutEditor?.clearSelection?.();state.layerIndex = index; const l = layer(); state.chosen = l?.recordId || l?.suggestedId || null; state.checked = false; render();focusBoundLayer(); }
function selectFile(index) { state.fileIndex = index; state.layerIndex = 0; state.chosen = layer()?.recordId || null; render(); fitView(); }
function demo() {
  const layers = [
    {id:1001,name:'主标题',original:'让肌肤，轻盈呼吸',box:[52,115,550,69],size:40,font:'MicrosoftYaHei',color:'#244d40'},
    {id:1002,name:'副标题',original:'清爽保湿 · 每日呵护',box:[54,204,420,40],size:23,font:'MicrosoftYaHei',color:'#728877'},
    {id:1003,name:'卖点一',original:'长效保湿',box:[54,730,220,41],size:29,font:'MicrosoftYaHei',color:'#244d40'},
    {id:1004,name:'卖点描述',original:'轻盈质地，清爽不黏腻',box:[54,793,430,37],size:22,font:'MicrosoftYaHei',color:'#728877'},
    {id:1005,name:'底部说明',original:'适合日常护理使用',box:[54,910,420,37],size:22,font:'MicrosoftYaHei',color:'#728877'}
  ].map(l => ({...l,group:'详情页',minSize:l.size*.75,alignment:'left',tracking:0,leading:l.size*1.2,supported:true,issues:[],recordId:null,suggestedId:null}));
  state.files = [{name:'轻盈护理 · 示例详情页',width:660,height:1010,demo:true,layers}];
  const texts = ['Let your skin breathe','Fresh hydration · Everyday care','Long-lasting hydration','Lightweight, fresh and non-sticky','Suitable for everyday skincare'];
  state.records = layers.map((l,i) => ({id:'demo-'+i,key:['title_01','subtitle_01','feature_01','detail_01','note_01'][i],original:l.original,target:texts[i],source:'示例英文文案.csv · 第 '+(i+2)+' 行',digest:''}));
  state.docName='示例英文文案.csv'; state.sourceDocument=null; state.fileIndex=0; state.layerIndex=0; state.chosen=null; state.checked=false;
  render(); fitView(); toast('已载入示例。选择文字层，再选文案并确认绑定。示例不能导出真实 PSD。');
}
function drawDemo(canvas) {
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#f8f5ed';ctx.fillRect(0,0,660,1010);
  ctx.fillStyle='#718875';ctx.font='12px Segoe UI';ctx.fillText('BOTANICAL / DAILY ESSENTIALS',54,66);
  ctx.fillStyle='#e5ebdf';ctx.beginPath();ctx.ellipse(440,447,255,207,0,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(445,378);ctx.rotate(-.15);
  ctx.fillStyle='#bed0b8';for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(-130+i*39,-60+i*20,54,18,-.6,0,Math.PI*2);ctx.fill();}ctx.restore();
  ctx.save();ctx.shadowColor='#29493428';ctx.shadowBlur=24;ctx.shadowOffsetY=18;ctx.fillStyle='#537c65';ctx.beginPath();ctx.roundRect(263,365,156,260,[16,16,25,25]);ctx.fill();ctx.restore();
  ctx.fillStyle='#2d5946';ctx.beginPath();ctx.roundRect(284,320,113,57,[10,10,0,0]);ctx.fill();
  ctx.fillStyle='#f7f6ec';ctx.fillRect(275,448,132,100);ctx.textAlign='center';ctx.fillStyle='#52715d';ctx.font='21px Georgia';ctx.fillText('BOTANICA',341,485);ctx.font='10px Segoe UI';ctx.fillText('DAILY HYDRATION',341,511);ctx.fillText('100 ml / 3.38 fl. oz.',341,534);ctx.textAlign='left';
  ctx.strokeStyle='#d4ded0';ctx.beginPath();ctx.moveTo(54,872);ctx.lineTo(602,872);ctx.stroke();
  for(const l of file().layers){ctx.fillStyle=l.color;ctx.font=`${l.size}px "Microsoft YaHei", sans-serif`;ctx.fillText(l.original,l.box[0],l.box[1]+l.size+4);}
  ctx.fillStyle='#9aa58f';ctx.font='10px Segoe UI';ctx.fillText('DEMO DESIGN · FOR WORKFLOW TESTING ONLY',54,982);
}
async function parseImported(item) {
  await new Promise(r=>setTimeout(r,10));
  const psd=item.metadata||readPsd(new Uint8Array(item.bytes), {skipLayerImageData:true,skipThumbnail:true,skipLinkedFilesData:true});
  if (psd.bitsPerChannel !== 8 || psd.colorMode !== 3) throw new Error(item.name+'：目前支持 8 位 RGB PSD / PSB。请在副本中转换后导入。');
  if (!item.metadata&&!['PSB','AI'].includes(item.format)&&psd.width*psd.height>65000000) throw new Error(item.name+'：大画布 PSD 需要通过 Photoshop 原生读取，请重新导入。');
  const layers=item.metadata?.layers?.map(l=>({...l}))||extractLayers(psd);
  // Capture native source styles before restoring a project or a batch template.
  // Learning baselines must never inherit the user's replacement layout.
  const learningSource={layers:JSON.parse(JSON.stringify(layers)),containers:JSON.parse(JSON.stringify(item.metadata?.containers||extractContainers(psd)))};
  for(const l of layers){const saved=item.layers?.find(x=>x.id===l.id&&x.original===l.original);if(saved){if(Array.isArray(saved.sourceBox)&&JSON.stringify(saved.sourceBox)===JSON.stringify(l.box)&&Array.isArray(saved.box)&&saved.box.length===4&&saved.box.every(Number.isFinite)&&saved.box[2]>0&&saved.box[3]>0&&saved.box[2]<=psd.width*2&&saved.box[3]<=psd.height*2){l.sourceBox=[...l.box];l.box=[...saved.box];if(['left','center','right'].includes(saved.alignment))l.alignment=saved.alignment;}if(saved.manual)l.manual={...saved.manual};if(saved.textLayout){try{validateParagraphs(saved.textLayout.sourceText,saved.textLayout.paragraphs);l.textLayout=structuredClone(saved.textLayout);}catch{}}if(saved.position&&Number.isFinite(saved.position.x)&&Number.isFinite(saved.position.y))l.position={x:Math.max(-psd.width,Math.min(psd.width,saved.position.x)),y:Math.max(-psd.height,Math.min(psd.height,saved.position.y))};l.skipExport=!!saved.skipExport;l.transformSelected=!!saved.transformSelected;if(typeof saved.customText==='string')l.customText=saved.customText;if(saved.copyAdjustment?.text===l.customText)l.copyAdjustment={...saved.copyAdjustment};if(saved.artworkHidden){l.artworkHiddenPrior=saved.artworkHiddenPrior;}}if(saved?.smart)l.smart={allowWrap:saved.smart.allowWrap!==false,allowLeading:saved.smart.allowLeading!==false,trackingLimit:Math.max(0,Math.min(30,Number(saved.smart.trackingLimit??30)||0))};}
  if (!layers.length&&item.format==='AI'&&!item.metadata?.artworkObjects?.length) throw new Error(item.name+'：没有可读取的独立文字层。');
  if (!item.preview&&!psd.canvas) throw new Error(item.name+'：缺少合成预览，请在 Photoshop / Illustrator 中启用最大兼容性并另存副本。');
  const restored=restoreExtractedContainers({layers,containers:JSON.parse(JSON.stringify(item.metadata?.containers||extractContainers(psd)))},item.extractedContainers||[]),containers=restored.containers,extractedContainers=restored.extractedContainers;
  for(const l of layers){const saved=item.layers?.find(x=>x.id===l.id&&x.original===l.original);if(saved?.containerId&&containers.some(c=>c.id===saved.containerId&&!c.issues.length))l.containerId=saved.containerId;}
  const containerEdits=(item.containerEdits||[]).filter(e=>containers.some(c=>c.id===e.layerId&&!c.issues.length&&JSON.stringify(c.box)===JSON.stringify(e.sourceBox))&&layers.some(l=>l.id===e.textLayerId));
  for(const saved of item.layers||[])if(saved.nativeCreation){validateCreation({...saved,layerId:saved.id},{width:psd.width,height:psd.height,layers:item.format==='AI'?layers:undefined,artworkObjects:item.metadata?.artworkObjects,artboards:item.metadata?.artboards});if(layers.some(l=>l.id===saved.id))throw Error('新增文字ID重复');layers.push(JSON.parse(JSON.stringify(saved)));}
  for(const l of layers){const saved=item.layers?.find(x=>x.id===l.id);if(saved?.nativeDisposition){l.nativeDisposition=saved.nativeDisposition;l.presenceReason=saved.presenceReason;l.presencePrior=saved.presencePrior;l.visible=false;l.skipExport=true;}}
  const artworkObjects=item.metadata?.artworkObjects||[];const artworkHides=item.artworkHides||[];validateArtworkHides(artworkHides,{objects:artworkObjects,format:item.format||'PSD'});for(const e of artworkHides){const o=artworkObjects.find(o=>o.objectId===e.objectId),l=layers.find(l=>l.id===o.layerId);if(l){l.artworkHiddenPrior=l.artworkHiddenPrior||{skipExport:!!l.skipExport,visible:l.visible!==false};l.artworkHidden=true;l.visible=false;l.skipExport=true;}}
  const mixedTextEdits=structuredClone(item.mixedTextEdits||[]);validateMixedEdits(mixedTextEdits,{layers,format:item.format||'PSD'});
  return {mixedTextEdits,artworkObjects,artworkHides,name:item.name,path:item.path,fingerprint:item.fingerprint,width:psd.width,height:psd.height,layers,containers,extractedContainers,containerEdits,learningSource,artboards:item.metadata?.artboards||item.metadata?.boards||[],format:item.format||'PSD',preview:item.preview||psd.canvas.toDataURL('image/png')};
}
function render() {
  containerSplit?.update();
  if(contextProperties?.isOpen()&&!containerEditor?.getSelection?.()&&!layoutEditor?.getSelection?.())contextProperties.clear();
  $('clearOriginals').disabled=!state.files.length||!!state.batchPreviewId;$('clearDocument').disabled=!(state.records.length||state.docName)||!!state.batchPreviewId;
  $('fileCount').textContent=state.files.length+' 个'+(state.files.some(f=>f.demo)?'文件（含示例）':' 原稿');
  const all=state.files.flatMap(f=>f.layers), bound=all.filter(l=>l.recordId).length;
  $('bindCount').textContent=bound+' / '+all.length+' 已设置';$('layerCount').textContent=file()?.layers.length||0;
  $('checkCount').textContent=state.checked?'已检查 · 需实机复核':'待检查';
  $('files').replaceChildren();
  if(!state.files.length)$('files').append(node('div','file-placeholder','尚未导入 PSD / PSB'));
  state.files.forEach((f,i)=>{const n=node('div','file-card'+(i===state.fileIndex?' active':''));n.append(node('b','', '▧  '+f.name),node('small','',`${f.width} × ${f.height} · ${f.layers.length} 个文字层${f.demo?' · 示例':''}`));const remove=node('button','remove-source','移除');remove.type='button';remove.title='从工作区移除 '+f.name+'，不删除本机文件';remove.setAttribute('aria-label','移除原稿 '+f.name);remove.onclick=e=>{e.stopPropagation();void removeSource(i);};remove.disabled=!!state.batchPreviewId;n.append(remove);n.onclick=()=>selectFile(i);$('files').append(n);});
  $('layers').replaceChildren();
  if(file()&&!file().layers.length)$('layers').append(node('p','hint','未发现一级文字层。请点击“批量查找替换”深度解析智能对象内文字。'));
  file()?.layers.forEach((l,i)=>{const n=node('div','layer-card'+(i===state.layerIndex?' active':''));n.append(node('span','type-icon','T'));const body=node('div','layer-body');body.append(node('b','',l.name),node('small','',l.original.replace(/\r?\n/g,' ')));n.append(body,node('span','layer-status'+(l.recordId?' bound':''),l.skipExport?'−':l.recordId?'✓':l.issues.length?'!':'○'));n.title=(l.skipExport?'已跳过导出；':'')+(l.issues.join('；')||l.group);n.onclick=()=>selectedLayer(i);$('layers').append(n);});
  const f=file(), l=layer();$('empty').style.display=f?'none':'flex';$('stage').style.display=f?'block':'none';
  if(f){const c=$('art'),display=previewDimensions(f.width,f.height);if(c.width!==display.width||c.height!==display.height){c.width=display.width;c.height=display.height;delete c.dataset.image;}
    if(f.demo)drawDemo(c);else if(c.dataset.image!==f.preview){const img=new Image();const expected=f.preview;img.onload=()=>{if(file()?.preview===expected){c.getContext('2d').clearRect(0,0,c.width,c.height);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.dataset.image=expected;layoutEditor?.draw();}};img.src=f.preview;}
    $('canvasTitle').textContent=f.demo?'示例原稿':f.name;$('dimensions').textContent=f.width+' × '+f.height;
    $('previewNote').textContent=f.demo?'内置示例原稿 · 文案绑定不会改变此原图':'原 PSD / PSB 合成图 · 标记仅用于定位文字层';
  }
  if(!f){$('canvasTitle').textContent='原稿预览';$('dimensions').textContent='';$('previewNote').textContent='导入 PSD / PSB 开始';const art=$('art');art.getContext('2d').clearRect(0,0,art.width,art.height);delete art.dataset.image;}
  renderMarkers();
  $('docName').textContent=state.docName||'尚未导入文档';$('docInfo').textContent=state.records.length?state.records.length+' 条文案 · 内容只读'+(state.sourceDocument?.notices?.length?' · '+state.sourceDocument.notices.length+' 项来源提示':''):'支持 XLSX / DOCX / CSV / TSV / TXT';
  const structured = state.sourceDocument?.format==='xlsx'||/\.(csv|tsv)$/i.test(state.docName);
  $('splitMode').disabled=structured;$('resplitDoc').disabled=structured||!state.records.length;
  $('splitMode').value=state.sourceDocument?.splitMode||'line';
  $('splitHint').textContent=structured?'表格按目标文案单元格导入，保留单元格内换行。':state.records.length===1&&/[\r\n]/.test(state.records[0].target)?'当前多行合为一条。选择“按行”并点击“重新拆分”。':'按行拆分独立文案；需要保留多行时选择按空行。';
  $('originalText').textContent=l?.original||'在画面或左侧选择文字层';$('fontName').textContent=l?.font||'—';
  $('fontSize').textContent=l?round(l.size)+'（估算）':'—';$('minSize').value=l?round(l.minSize):12;$('minSize').max=l?.size||100;$('minSize').disabled=!l||!!l.manual;
  $('allowWrap').checked=l?.smart?.allowWrap!==false;$('allowSpacing').checked=(l?.smart?.trackingLimit??30)>0;$('allowLeading').checked=l?.smart?.allowLeading!==false;
  $('selectedSummary').textContent=l?`${l.name} · 图层 ID ${l.id??'未知'}${l.issues.length?' · 有兼容性限制':''}`:'尚未选择文字层';
  renderRecords();renderProof();layoutEditor?.sync();containerEditor?.sync();const comparing=!!f&&(f.layers.some(l=>l.recordId)||!!f.artworkHides?.length||!!f.mixedTextEdits?.length||!!textActionsFor(f).length);if(state.comparing!==comparing){state.comparing=comparing;fitView();}
  $('overallStatus').className='status-dot'+(bound?' ready':'');$('overallText').textContent=bound?'已绑定 '+bound+' 个文字层':'准备开始';
  $('overallDetail').textContent=all.length?'未绑定及明确跳过的文字层保持原样':'导入文件，或点击示例项目';workflow?.update();
  if(state.batchPreviewId)for(const id of ['openBatch','openProject','saveProject','importPsd','importDoc','resplitDoc','loadDemo','codexSuggest','exactMatch','confirmBinding','clearBinding','run','export','guideAction'])$(id).disabled=true;
  history?.refresh();aiHighlights?.draw();
}
function round(n){return Math.round(n*10)/10;}
function renderMarkers(){
  const f=file();$('markers').replaceChildren();if(!f)return;
  f.layers.forEach((l,i)=>{const n=node('div','marker'+(i===state.layerIndex?' selected':'')+(l.recordId?' bound':''));const b=l.sourceBox||l.box;n.style.left=b[0]/f.width*100+'%';n.style.top=b[1]/f.height*100+'%';n.style.width=b[2]/f.width*100+'%';n.style.height=b[3]/f.height*100+'%';n.title=l.name+' · '+l.original;n.append(node('span','',l.name+(l.recordId?' · 已绑定':'')));n.onclick=e=>{if(state.tool==='select'){e.stopPropagation();selectedLayer(i);}};$('markers').append(n);});
  $('markers').style.visibility=$('showMarkers').checked?'visible':'hidden';
}
function renderRecords(){
  const q=$('searchRecords').value.toLowerCase(), l=layer();$('records').replaceChildren();
  const shown=state.records.filter(r=>(r.key+' '+r.original+' '+r.target).toLowerCase().includes(q));
  if(!shown.length)$('records').append(node('div','hint',state.records.length?'没有符合的文案':'请先导入目标语言文档'));
  shown.forEach(r=>{const n=node('div','record'+(state.chosen===r.id?' selected':''));n.append(node('span','record-key',r.key),node('b','',r.target),node('small','',r.source));if(r.original)n.title='文档原文：'+r.original;n.onclick=()=>{state.chosen=r.id;renderRecords();renderProof();};$('records').append(n);});
  $('confirmBinding').disabled=!l||!record(state.chosen);$('clearBinding').disabled=!l?.recordId;
  $('bindingState').textContent=l?.artworkHidden?'对象已隐藏，可 Ctrl+Z 撤回或让助手恢复':l?.skipExport?'保留原文，不参与替换':l?.recordId?(typeof l.customText==='string'?'已手动改字 · 文档来源：':'已替换 · 文档来源：')+(record(l.recordId)?.source||'已导入文档'):l?'尚未替换 · 选择文档条目后应用':'先在左侧或画面选择文字层';
}
function fitText(l,r){
  const approved=typeof l.customText==='string'?l.customText:r.target,text=layoutText(l,approved),explicit=text!==approved||l.textLayout?.sourceText===approved;
  const key=JSON.stringify([l.font,l.size,l.minSize,l.box,l.tracking,l.leading,l.aspectScale,l.manual,l.textLayout,l.capitalization,text,policyFor(l)]);if(layoutCache.has(key))return layoutCache.get(key);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  const m=l.manual?manualStyleFor(l):null;const rawFont=m?.font||l.font;const family=m?.family||(rawFont===l.font?l.family:null)||({ArialMT:'Arial','Arial-BoldMT':'Arial',MicrosoftYaHei:'Microsoft YaHei'}[rawFont])||rawFont.replace(/[-_](?=(bold|black|medium|regular|light|semibold))/ig,' ').replace(/[-_]/g,' ');
  const inferredWeight=/(black|heavy|extrabold|ultrabold)/i.test(rawFont)?900:/(semibold|demibold|demi)/i.test(rawFont)?600:/medium/i.test(rawFont)?500:/(light|thin|extralight)/i.test(rawFont)?300:/(bold|黑|粗)/i.test(rawFont)?700:400;
  const cssWeight=m?.weight&&m.weight!=='original'?({light:300,regular:400,medium:500,semibold:600,bold:700,black:900}[m.weight]||400):inferredWeight;
  const stretchX=(m?.stretchX??100)/100,stretchY=(m?.stretchY??100)/100;
  const measure=(text,size,tracking)=>{text=displayText(text,l.capitalization);ctx.font=`${cssWeight} ${size}px "${family.replace(/"/g,'')}", "Microsoft YaHei", sans-serif`;ctx.letterSpacing='0px';const metrics=ctx.measureText(text);return {width:Math.max(0,metrics.width+Math.max(0,[...text].length-1)*tracking*size/1000)*(l.aspectScale||1)*stretchX,height:(metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent)*stretchY,ascent:metrics.actualBoundingBoxAscent*stretchY};};
  const result={...smartFit({text,size:m?.size||l.size,minSize:m?.size||l.minSize,width:l.box[2],height:l.box[3],tracking:m?.tracking??l.tracking,leading:(m?.leading||l.leading)*stretchY,...(m?{allowWrap:policyFor(l).allowWrap,allowLeading:false,trackingLimit:0}:policyFor(l)),...(explicit?{allowWrap:false,allowLeading:false}:{} )},measure),family,weight:cssWeight};if(layoutCache.size>=256)layoutCache.delete(layoutCache.keys().next().value);layoutCache.set(key,result);return result;
}
function policyFor(l){return {allowWrap:l.smart?.allowWrap!==false,allowLeading:l.smart?.allowLeading!==false,trackingLimit:l.smart?.trackingLimit??30};}
function adjustmentSummary(l,fit){const a=fit.adjustments,parts=[];if(a.addedLines)parts.push('自动换行 '+fit.lines.length+' 行');if(a.fontReduction)parts.push('字号 '+round(l.size)+' → '+round(fit.size));if(a.trackingReduction)parts.push('字距 '+l.tracking+' → '+fit.tracking);if(a.leadingReduction)parts.push('行距收紧 '+a.leadingReduction+'%');return parts.length?parts.join(' · '):'原字号与排版即可容纳';}
function renderProof(){
  const l=layer(),r=record(state.chosen||l?.recordId);$('proof').replaceChildren();$('fitResult').className='fit-result';
  $('fitActions').hidden=true;$('adaptCurrent').disabled=!l||!r;
  if(!l||!r){$('proof').append(node('span','','绑定后自动尝试排版'));$('fitResult').textContent='选择文案后自动适配；绑定后可编辑替换文字及排版。';return;}
  if(l.recordId===r.id){
   const actual=typeof l.customText==='string'?l.customText:r.target;
   if(actual!==r.target){const notice=node('p','warn',(l.copyAdjustment?.text===actual?'表达优化':'手动文案修改')+'：'+r.target+' → '+actual+' · '+r.source);const restore=node('button','text-button','恢复文档原文');restore.onclick=()=>history.transaction(()=>{delete l.customText;delete l.copyAdjustment;state.checked=false;render();},'恢复文档原文');$('proof').append(notice,restore);}
   else for(const proposal of presentationSuggestions(r,l)){const button=node('button','text-button','可选表达优化：'+proposal.text);button.title=proposal.reason;button.onclick=async()=>{if(!await confirmAction(proposal.before+' → '+proposal.text+'\n'+proposal.reason+'\n'+proposal.source,{title:'确认表达优化',acceptLabel:'应用并记录'}))return;history.transaction(()=>{validatePresentation(proposal,r,l);l.customText=proposal.text;l.copyAdjustment=proposal;state.checked=false;render();},'表达优化');};$('proof').append(button);}
  }
  const fit=fitText(l,r),c=document.createElement('canvas'),scale=Math.min(1,2400/l.box[2],600/l.box[3]);c.width=Math.max(1,Math.ceil(l.box[2]*scale));c.height=Math.max(1,Math.ceil(l.box[3]*scale));const ctx=c.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=l.color;ctx.font=`${fit.weight||400} ${fit.size}px "${fit.family}", "Microsoft YaHei", sans-serif`;ctx.textBaseline='alphabetic';ctx.letterSpacing=fit.tracking*fit.size/1000+'px';
  ctx.textAlign=l.alignment==='center'?'center':l.alignment==='right'?'right':'left';const x=l.alignment==='center'?l.box[2]/2:l.alignment==='right'?l.box[2]:0;
  ctx.scale((l.aspectScale||1)*(l.manual?.stretchX??100)/100,(l.manual?.stretchY??100)/100);for(let i=0;i<fit.lines.length;i++)ctx.fillText(fit.lines[i],x/(l.aspectScale||1),(fit.ascent+i*fit.leading)/((l.manual?.stretchY??100)/100));$('proof').append(c);
  $('fitResult').textContent=l.issues.length?'此图层需人工确认：'+l.issues.join('；'):fit.ok?(l.manual?'已应用手动参数（估算）\n':'已自动适配（估算）\n')+(l.manual?'字号 '+round(l.manual.size)+' · 字距 '+l.manual.tracking+' · 行距 '+round(l.manual.leading):adjustmentSummary(l,fit))+'\n导出保留当前预览排版，不再按原区域重新适配。':'当前预览超出原文字区域；仍按你确认的排版导出。\n预览估算 '+Math.ceil(fit.width)+' × '+Math.ceil(fit.height)+' px，原区域 '+l.box[2]+' × '+l.box[3]+' px。导出不自动缩小或重新换行。';
  if(!fit.ok||l.issues.length)$('fitResult').classList.add('warn');
  if(!fit.ok&&!l.issues.length&&!l.manual){$('fitActions').hidden=false;const suggested=fit.suggestedMinSize;$('relaxMinSize').disabled=suggested>=l.minSize;$('relaxMinSize').textContent=suggested<l.minSize?'最小字号改为 '+suggested:'请手动调整最小字号';$('relaxMinSize').dataset.value=suggested;}
}
function focusBoundLayer(){layoutEditor?.focusSelection();const l=layer();if(l?.recordId){const v=$('viewport');v.scrollTop+=$('stage').getBoundingClientRect().top+l.box[1]*state.scale-v.getBoundingClientRect().top-v.clientTop-v.clientHeight/3;}}
function fitView(){if(!file())return;const v=$('viewport');state.scale=state.comparing?Math.min((v.clientWidth-32)/file().width,1):Math.min((v.clientWidth-64)/file().width,(v.clientHeight-48)/file().height,1);applyScale();}
function applyScale(){if(!file())return;$('stage').style.width=file().width*state.scale+'px';$('stage').style.height=file().height*state.scale+'px';$('zoomValue').textContent=Math.round(state.scale*100)+'%';}
function setTool(tool){state.tool=tool;$('selectTool').classList.toggle('active',tool==='select');$('boxTool').classList.toggle('active',tool==='box');$('stage').style.cursor=tool==='box'?'crosshair':'default';}
let drag=null;
$('stage').addEventListener('pointerdown',e=>{if(state.tool!=='box'||!file())return;const rect=$('stage').getBoundingClientRect();drag={x:e.clientX-rect.left,y:e.clientY-rect.top};$('stage').setPointerCapture(e.pointerId);$('selectionBox').style.display='block';});
$('stage').addEventListener('pointermove',e=>{if(!drag)return;const rect=$('stage').getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;Object.assign($('selectionBox').style,{left:Math.min(x,drag.x)+'px',top:Math.min(y,drag.y)+'px',width:Math.abs(x-drag.x)+'px',height:Math.abs(y-drag.y)+'px'});});
$('stage').addEventListener('pointerup',e=>{if(!drag)return;const rect=$('stage').getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top,b=[Math.min(x,drag.x)/state.scale,Math.min(y,drag.y)/state.scale,Math.abs(x-drag.x)/state.scale,Math.abs(y-drag.y)/state.scale];drag=null;$('selectionBox').style.display='none';
  const candidates=file().layers.map((l,i)=>({l,i})).filter(({l})=>{const a=l.box;return a[0]<b[0]+b[2]&&a[0]+a[2]>b[0]&&a[1]<b[1]+b[3]&&a[1]+a[3]>b[1];});
  if(candidates.length===1)selectedLayer(candidates[0].i);else toast(candidates.length?'框内有多个文字层，请在左侧点选具体图层。':'没有选中文字层，请调整框选范围。');
});
function report(){
  state.checked=true;render();$('reportContent').replaceChildren();for(const n of state.sourceDocument?.notices||[])$('reportContent').append(node('p','warn',n.source+'：'+n.text+' · '+(n.action||'')));let count=0;
  for(const f of state.files)for(const l of f.layers){const r=record(l.recordId);const row=node('div','report-row');const title=node('div');title.append(node('b','',f.name+' / '+l.name),node('div','',r?(typeof l.customText==='string'?l.customText:r.target):'保持原文字'));const status=node('span');
    if(l.skipExport){status.textContent='已跳过导出 · 保持原样';}
    else if(!r){status.textContent='未绑定 · 不修改';}
    else if(l.issues.length){status.textContent=l.issues.join('；');status.className='warn';}
    else{const fit=fitText(l,r);status.textContent=fit.ok?(f.demo?'示例 · ':'')+(l.manual?'手动排版：字号 '+round(l.manual.size):'已自动适配：'+adjustmentSummary(l,fit)):'超出原区域 · 按当前预览排版导出';if(!fit.ok)status.className='warn';else count++;}
    if(r){const view=node('button','text-button','查看排版');view.onclick=()=>{$('reportDialog').close();const fi=state.files.indexOf(f);selectFile(fi);selectedLayer(f.layers.indexOf(l));$('adaptCurrent').scrollIntoView({block:'center'});};title.append(view);}const skip=node('button','text-button report-skip',l.skipExport?'恢复此层导出':'跳过此层导出');skip.onclick=()=>{l.skipExport=!l.skipExport;report();};title.append(skip);
    row.append(title,status);$('reportContent').append(row);
  }
  if(!state.files.length)$('reportContent').append(node('p','','请先导入 PSD / PSB。'));$('reportDialog').showModal();return count;
}
function previewLayoutFor(l){const fit=fitText(l,record(l.recordId)),m=l.manual,stretchY=(m?.stretchY??100)/100,box=l.position?[l.position.x,l.position.y,l.box[2],l.box[3]]:l.box;
 return {...(l.textLayout?.sourceText===(typeof l.customText==='string'?l.customText:record(l.recordId).target)?{paragraphs:validateParagraphs(l.textLayout.sourceText,l.textLayout.paragraphs)}:{}),text:fit.text,breaks:fit.breaks,size:fit.size,font:m?.font||l.font,tracking:fit.tracking,leading:fit.leading/stretchY,weight:m?.weight||'original',stretchX:m?.stretchX??100,stretchY:m?.stretchY??100,box:[box[0]+(l.alignment==='center'?(box[2]-fit.width)/2:l.alignment==='right'?box[2]-fit.width:0),box[1],Math.max(1,fit.width),Math.max(1,fit.height)]};
}
async function makePlan({allowEmpty=false,fileIndices}={}){
  if(fileIndices!==undefined&&(!Array.isArray(fileIndices)||!fileIndices.length||new Set(fileIndices).size!==fileIndices.length||fileIndices.some(i=>!Number.isInteger(i)||!state.files[i])))throw Error('导出文件范围无效');
  const selected=fileIndices===undefined?state.files:fileIndices.map(i=>state.files[i]);
  if(selected.some(f=>f.bulkState?.edits?.length))throw Error('存在深层批量替换预览，请在“批量查找替换”中导出修改副本；导入副本后可继续排版。');
  void startLearningTask(()=>layoutLearning?.prepareExport?.());
  const files=[],skipped=[];
  const blocked=selected.flatMap(f=>f.layers.filter(l=>l.recordId&&l.issues.length&&!l.skipExport).map(l=>({f,l})));
  if(blocked.length){if(!await confirmAction('以下已绑定文字层暂不能自动修改：\n'+blocked.map(({f,l})=>f.name+' / '+l.name+'：'+l.issues.join('；')).join('\n')+'\n\n是否跳过这些层，保留其原样，继续处理其余文字？')){report();throw new Error('请在检查清单中处理或明确跳过受限图层。');}for(const {l} of blocked)l.skipExport=true;render();}
  for(const f of selected){for(const l of f.layers.filter(l=>l.skipExport))skipped.push({file:f.name,layerId:l.id,name:l.name,reasons:l.issues.length?l.issues:['用户主动跳过']});const bound=f.layers.filter(l=>l.recordId&&!l.skipExport);if(!bound.length&&!f.artworkHides?.length&&!f.mixedTextEdits?.length&&!textActionsFor(f).length)continue;if(f.demo)throw new Error('示例项目仅用于界面体验。请导入真实 PSD 后导出。');
    for(const l of bound)if(!record(l.recordId))throw new Error(l.name+'：文档绑定失效');
    files.push({mixedTextEdits:structuredClone(f.mixedTextEdits||[]),textActions:textActionsFor(f),name:f.name,path:f.path,format:f.format,fingerprint:f.fingerprint,width:f.width,height:f.height,artworkHides:JSON.parse(JSON.stringify(f.artworkHides||[])),extractedContainers:JSON.parse(JSON.stringify(f.extractedContainers||[])),containerEdits:activeContainerEdits(f),jobs:bound.map(l=>({... (l.nativeCreation?{nativeCreation:structuredClone(l.nativeCreation)}:{}),previewLayout:previewLayoutFor(l),layerId:l.id,name:l.name,alignment:l.alignment,original:l.original,font:l.font,size:l.size,originalTracking:l.tracking,minSize:l.minSize,box:l.sourceBox||l.box,recordId:l.recordId,target:typeof l.customText==='string'?l.customText:record(l.recordId).target,documentText:record(l.recordId).target,...(typeof l.customText==='string'?{override:{enabled:true,text:l.customText,sourceDigest:record(l.recordId).digest}}:{}),smart:policyFor(l),...(l.manual?{manual:manualStyleFor(l)}:{}),...(l.position?{position:l.position}:{})}))});
  }
  if(!files.length&&!allowEmpty)throw new Error('没有可执行的文字层；所有绑定层已跳过或尚未绑定。');
  return {version:1,createdAt:new Date().toISOString(),docName:state.docName,docFingerprint:state.docFingerprint,records:state.records,files,skipped,copyAdjustments:selected.flatMap(f=>f.layers.filter(l=>l.copyAdjustment&&l.customText===l.copyAdjustment.text).map(l=>({file:f.name,boardNames:l.boardNames||[],layerId:l.id,layer:l.name,...l.copyAdjustment})))};
}
function task(fn){return async()=>{try{if(workRecords)await workRecords.runAction(fn);else await fn();}catch(e){if($('settingsDialog').open)$('savedKeyState').textContent=e.message;toast(e.message,true);}};}
$('loadDemo').onclick=task(demo);
async function importOriginal(paths){
 const items=await call('importPsd',paths?{paths}:undefined);if(!items.length)return;
 $('importPsd').disabled=true;
 try{
  const imported=[],errors=[];
  for(const item of items){try{imported.push(await parseImported(item));}catch(e){errors.push(e.message);toast(e.message,true);}}
  // Failed reads must leave the current source, selection and preview intact.
  if(!imported.length)throw Error(errors.join('；')||'原稿未能解析');
  state.files=state.files.filter(f=>!f.demo);
  const pathKey=p=>String(p).replace(/\\/g,'/').toLowerCase();
  for(const f of imported){const index=state.files.findIndex(x=>pathKey(x.path)===pathKey(f.path));if(index>=0)state.files[index]=f;else state.files.push(f);}
  state.fileIndex=state.files.findIndex(f=>pathKey(f.path)===pathKey(imported[0].path));
  state.layerIndex=0;state.chosen=null;state.checked=false;state.comparing=undefined;
  // Invalidate cached replacement backgrounds and in-flight preview work,
  // including same-path reimports. Keep other sources and their saved edits.
  layoutCache.clear();layoutEditor?.resetImportedPreview?.();layoutLearning?.discardPending?.();
  contextProperties?.clear();containerEditor?.clearSelection?.();layoutEditor?.clearSelection?.();
  const art=$('art');art.getContext('2d').clearRect(0,0,art.width,art.height);delete art.dataset.image;
  render();fitView();
  toast('已读取 '+imported.length+' 份 PSD / PSB / AI，当前显示“'+file().name+'”。请导入文档并确认绑定。');
 }finally{$('importPsd').disabled=false;}
}

function assertCanRemoveImport(){
 if(state.batchPreviewId)throw new Error('请先保存或放弃此语言调整，再移除导入内容。');
 if(importingFiles||pendingWorkspaceCalls.size||!$('batchDialog').hidden&&$('batchDialog').open&&$('closeBatch').disabled)throw new Error('任务正在处理，请完成或取消当前任务后再移除。');
}
function finishImportRemoval(){
 layoutCache.clear();layoutEditor?.resetImportedPreview?.();layoutLearning?.discardPending?.();
 contextProperties?.clear();containerEditor?.clearSelection?.();layoutEditor?.clearSelection?.();
 $('searchRecords').value='';render();fitView();
}
async function removeSource(index){try{assertCanRemoveImport();const f=state.files[index];if(!f)return;
 if(!await confirmAction('从工作区移除“'+f.name+'”？此原稿的未保存绑定和排版将移除，本机文件不会删除。'))return;
 const remove=()=>{assertCanRemoveImport();if(removeImportedFile(state,index)){finishImportRemoval();toast('已移除原稿；本机文件保留。');}};if(workRecords)await workRecords.runAction(remove,{action:'',title:'移除原稿：'+f.name});else remove();
}catch(e){toast(e.message,true);}}
$('clearOriginals').onclick=task(async()=>{assertCanRemoveImport();if(!state.files.length)return;
 if(!await confirmAction('清空工作区的全部 '+state.files.length+' 份原稿？未保存的绑定和排版将移除；文档与本机文件保留。'))return;
 assertCanRemoveImport();clearImportedFiles(state);finishImportRemoval();toast('已清空原稿，文档保留。');});
$('clearDocument').onclick=task(async()=>{assertCanRemoveImport();if(!state.records.length&&!state.docName)return;
 if(!await confirmAction('清除当前文档及其文字绑定、手动改写和容器调整？原稿与本机文件保留；文字字号和位置参数保留。'))return;
 assertCanRemoveImport();clearImportedDocument(state);finishImportRemoval();toast('已清除文档和绑定，可以重新导入文案。');});

$('importPsd').onclick=task(()=>runFileImport(()=>importOriginal()));
async function importCopy(path){const d=await importTranslation(call,{splitMode:$('splitMode').value,...(path?{path}:{})});if(!d)return;state.records=d.records;state.docName=d.name;state.docFingerprint=d.fingerprint;state.sourceDocument={path:d.path,fingerprint:d.fingerprint,name:d.name,rawText:d.rawText,format:d.format,splitMode:d.splitMode,selection:d.selection,notices:d.notices||[],records:d.records};state.chosen=null;$('searchRecords').value='';for(const f of state.files)for(const l of f.layers){l.recordId=null;l.suggestedId=null;delete l.customText;delete l.copyAdjustment;}state.checked=false;render();toast('已导入 '+d.records.length+' 条文案。重新导入文档后，旧绑定已清除。');}
$('importDoc').onclick=task(()=>runFileImport(()=>importCopy()));
$('resplitDoc').onclick=task(async()=>{
  const mode=$('splitMode').value, source=state.sourceDocument||{name:state.docName,records:state.records};
  const next=await call('resplitDocument',{name:state.docName,rawText:source.rawText,records:source.records,splitMode:mode});
  const old=new Map(state.records.map(r=>[r.id,r])), valid=new Map(next.map(r=>[r.id,r]));let cleared=0;
  for(const f of state.files)for(const l of f.layers){if(l.recordId&&(!valid.has(l.recordId)||valid.get(l.recordId).target!==old.get(l.recordId)?.target)){l.recordId=null;cleared++;}if(l.suggestedId&&(!valid.has(l.suggestedId)||valid.get(l.suggestedId).target!==old.get(l.suggestedId)?.target))l.suggestedId=null;}
  state.records=next;state.sourceDocument={...source,splitMode:mode};state.chosen=layer()?.recordId||null;state.checked=false;$('searchRecords').value='';render();
  toast('已拆分为 '+next.length+' 条独立文案。'+(cleared?'已清除 '+cleared+' 条受影响的绑定，请重新确认。':'文案字词保持原样。'));
});
preventFileNavigation(document);
let importingFiles=false;
async function runFileImport(action,recordOptions){if(state.batchPreviewId)throw new Error('请先保存或放弃此语言调整，再导入文件。');if(importingFiles)throw new Error('正在导入文件，请稍候再试。');importingFiles=true;try{return recordOptions&&workRecords?await workRecords.runAction(action,recordOptions):await action();}finally{importingFiles=false;}}
const dropOptions={onError:message=>toast(message,true),isBusy:()=>importingFiles};
for(const element of [$('originalDropZone'),$('viewport'),$('importPsd')])bindFileDrop(element,{...dropOptions,extensions:['psd','psb','ai'],multiple:true,onPaths:paths=>runFileImport(()=>importOriginal(paths),{action:'importPsd',title:'拖入原稿'})});
bindFileDrop(document.querySelector('.binding-panel'),{...dropOptions,extensions:['xlsx','docx','csv','tsv','txt'],onPaths:paths=>runFileImport(()=>importCopy(paths[0]),{action:'importDoc',title:'拖入文案'})});
bindFileDrop($('openProject'),{...dropOptions,extensions:['json'],onPaths:paths=>runFileImport(()=>openSavedProject(paths[0]),{action:'openProject',title:'拖入项目'})});
$('searchRecords').oninput=renderRecords;
$('confirmBinding').onclick=()=>{if(!layer()||!record(state.chosen))return;if(layer().recordId!==state.chosen){delete layer().customText;delete layer().copyAdjustment;}layer().recordId=state.chosen;layer().suggestedId=null;state.checked=false;render();focusBoundLayer();toast('已设置替换文案，可在右侧画面双击改字。');};
$('clearBinding').onclick=()=>{if(!layer())return;layer().recordId=null;layer().suggestedId=null;state.chosen=null;state.checked=false;render();};
$('minSize').onchange=()=>{const l=layer();if(!l)return;const n=Number($('minSize').value);if(!Number.isFinite(n)||n<1||n>l.size){toast('最小字号必须在 1 与原字号之间。',true);$('minSize').value=round(l.minSize);return;}l.minSize=n;state.checked=false;renderProof();};
for(const id of ['allowWrap','allowSpacing','allowLeading'])$(id).onchange=()=>{const l=layer();if(!l)return;l.smart={allowWrap:$('allowWrap').checked,allowLeading:$('allowLeading').checked,trackingLimit:$('allowSpacing').checked?30:0};state.checked=false;renderProof();layoutEditor?.draw();};
$('adaptCurrent').onclick=()=>{const l=layer(),r=record(l?.recordId);if(!l||!r)return;const proposal=proposeVisualLayout(file(),l,r,fitText);if(!proposal.ok){toast(proposal.reason,true);return;}history.transaction(()=>{Object.assign(l,proposal.layerPatch);if(proposal.containerEdit){const edit=proposal.containerEdit;file().containerEdits=[...(file().containerEdits||[]).filter(e=>e.layerId!==edit.layerId),edit];l.containerId=edit.layerId;}state.checked=false;},'visual-layout');render();toast(proposal.summary+' 导出使用当前预览，Ctrl+Z 可撤回。');};
$('relaxMinSize').onclick=()=>{const l=layer(),n=Number($('relaxMinSize').dataset.value);if(!l||n>=l.minSize)return;l.minSize=n;state.checked=false;render();toast('已调整最小字号限制，并重新适配。请检查试样的可读性。');};
$('chooseDifferentCopy').onclick=()=>{$('searchRecords').focus();$('records').scrollIntoView({block:'center'});};
$('exactMatch').onclick=()=>{const l=layer();if(!l)return;const normalized=s=>s.replace(/\r\n?/g,'\n').normalize('NFC');const matches=state.records.filter(r=>r.original&&normalized(r.original)===normalized(l.original));if(matches.length!==1){toast(matches.length?'存在重复原文，请手动选择目标文案。':'文档里没有相同原文，请手动选择目标文案，或使用“帮我找对应文案”。');return;}l.suggestedId=matches[0].id;state.chosen=matches[0].id;renderRecords();renderProof();toast('已找到原文一致的条目，请确认绑定。');};
$('selectTool').onclick=()=>setTool('select');$('boxTool').onclick=()=>setTool('box');$('showMarkers').onchange=renderMarkers;
$('fit').onclick=fitView;$('zoomIn').onclick=()=>{state.scale=Math.min(8,state.scale*1.2);applyScale();};$('zoomOut').onclick=()=>{state.scale=Math.max(.03,state.scale/1.2);applyScale();};
$('check').onclick=report;$('closeReport').onclick=()=>$('reportDialog').close();
$('saveProject').onclick=task(async()=>{if(!state.files.length)throw new Error('请先导入 PSD / PSB 或载入示例。');for(const r of state.records)if(!r.digest){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(r.target));r.digest=Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}
  const saved=await call('saveProject',{version:1,layoutPreferences:{magneticSnap:$('magneticSnap').checked,alignmentTarget:$('alignmentTarget').value},docName:state.docName,docFingerprint:state.docFingerprint,sourceDocument:state.sourceDocument,records:state.records,files:state.files.map(({preview,...f})=>f)});if(saved)toast('项目已保存，包含文案和固定绑定关系。');});
async function openSavedProject(path){const p=await call('loadProject',path?{path}:undefined);if(!p)return;$('magneticSnap').checked=!!p.layoutPreferences?.magneticSnap;$('alignmentTarget').value=p.layoutPreferences?.alignmentTarget==='canvas'?'canvas':'selection';const files=[];for(const f of p.files){if(f.demo){files.push(f);continue;}const loaded=await parseImported(f);if(f.bulkState)loaded.bulkState=f.bulkState;for(const l of loaded.layers){const saved=f.layers.find(x=>x.id===l.id&&x.original===l.original);if(saved){l.recordId=p.records.some(r=>r.id===saved.recordId)?saved.recordId:null;l.minSize=Math.max(1,Math.min(l.size,Number(saved.minSize)*(l.size/(Number(saved.size)||l.size))||l.minSize));}}files.push(loaded);}state.files=files;state.records=p.records;state.docName=p.docName;state.docFingerprint=p.docFingerprint;state.sourceDocument=p.sourceDocument||{name:p.docName,records:p.records,splitMode:'line'};state.fileIndex=0;state.layerIndex=0;state.chosen=layer()?.recordId||null;state.checked=false;render();fitView();toast('项目已恢复，原 PSD / PSB / AI 已重新校验。');}
$('openProject').onclick=task(()=>runFileImport(()=>openSavedProject()));
$('export').onclick=task(async()=>{const plan=await makePlan();const count=plan.files.reduce((n,f)=>n+f.jobs.length,0),unbound=state.files.reduce((n,f)=>n+f.layers.filter(l=>!l.recordId).length,0);if(!await confirmAction(`即将导出 ${plan.files.length} 份 PSD / PSB / AI / ${count} 个文字层的执行脚本。\n${unbound} 个未绑定文字层保持原样。\n另有 ${plan.skipped?.length||0} 个绑定层已跳过，保持原样。\n脚本仅修改副本；结果需人工检查。继续？`))return;const saved=await call('exportPlan',plan);if(saved)toast('预览排版执行脚本已保存。在 Photoshop / Illustrator 中使用“文件 → 脚本 → 浏览”运行。');});
$('run').onclick=task(async()=>{const plan=await makePlan();if(!await confirmAction('将在 Photoshop / Illustrator 中打开原稿并修改副本。\n尚未实现自动缺字与像素差异验收，请审核输出。\n继续执行？'))return;$('run').disabled=true;$('run').textContent='正在生成修改后的文件…';try{const result=await call('runPhotoshop',plan);if(!result){toast('已取消保存位置选择。');return;}void startLearningTask(()=>layoutLearning?.refreshStatus?.(result.learning));const errors=result.results.filter(r=>r.error).map(r=>r.file+'：'+r.error);toast('已保存 '+result.saved+' 份 PSD / PSB / AI，失败 '+result.failed+' 份。'+(errors.length?'\n'+errors.join('\n'):'请复核输出效果。'),!!result.failed);}finally{$('run').disabled=false;$('run').textContent='生成修改后的文件';}});
function updateAiMode(){const local=$('aiMode').value==='local';$('localSettings').hidden=!local;$('apiSettings').hidden=local;$('aiModeHint').textContent=local?'使用本地 Codex CLI 运行任务；不使用软件 API 配置。':'调用你配置的 API 接口，支持 OpenAI 官方及兼容接口；无需安装本地 Codex。';$('savedKeyState').textContent=local?'本地模式使用 CLI 已有登录；软件保存的 API Key 不参与本次运行。':state.settings.hasApiKey?'API Key 已加密保存在本机；留空继续使用。更换接口时，请确认 Key 对应当前服务商。':'尚未保存 API Key。';}
const apiModels=installApiModels({$,call,hasSavedKey:()=>!!state.settings.hasApiKey});
function showSettings(){apiModels.invalidate();const v=state.settings;$('aiMode').value=v.mode==='local'?'local':'api';$('codexPath').value=v.executable||'';$('apiKey').value='';$('apiKey').placeholder=v.hasApiKey?'已加密保存；留空继续使用，输入新值更换':'填写 API Key，保存后下次自动使用';$('apiBaseUrl').value=v.apiBaseUrl||'https://api.openai.com/v1';$('apiProtocol').value=v.apiProtocol||'auto';$('codexModel').value=v.apiModel??v.model??'';$('localCodexModel').value=v.localModel??'';$('codexDiscoveryState').textContent='';updateAiMode();if(!$('settingsDialog').open)$('settingsDialog').showModal();void apiModels.opened();}
$('aiMode').onchange=()=>{updateAiMode();apiModels.modeChanged();};
async function openSettings(){try{state.settings=await call('loadCodexSettings');}catch(e){showSettings();$('savedKeyState').textContent=e.message;return;}showSettings();}
$('settings').onclick=openSettings;$('railSettings').onclick=openSettings;$('closeSettings').onclick=()=>{apiModels.invalidate();$('apiKey').value='';$('settingsDialog').close();};$('settingsDialog').addEventListener('cancel',()=>{$('apiKey').value='';});
$('findCodex').onclick=task(async()=>{const b=$('findCodex');b.disabled=true;$('codexDiscoveryState').textContent='正在查找已安装的 Codex…';try{const result=await call('discoverCodex');$('codexPath').value=result.path;$('codexDiscoveryState').textContent='已找到 Codex。点击“保存设置”后下次自动使用。';}catch(e){$('codexDiscoveryState').textContent=e.message;throw e;}finally{b.disabled=false;}});
$('chooseCodex').onclick=task(async()=>{const p=await call('chooseCodex');if(p)$('codexPath').value=p;});
$('applySettings').onclick=task(async()=>{const button=$('applySettings');button.disabled=true;try{const value={mode:$('aiMode').value,executable:$('codexPath').value,apiBaseUrl:$('apiBaseUrl').value.trim()||'https://api.openai.com/v1',apiProtocol:$('apiProtocol').value,apiModel:$('codexModel').value.trim(),localModel:$('localCodexModel').value.trim()};if($('apiKey').value.trim())value.apiKey=$('apiKey').value.trim();state.settings=await call('saveCodexSettings',value);$('apiKey').value='';$('settingsDialog').close();toast('连接设置已保存到本机，重启软件后仍可使用。');}finally{button.disabled=false;}});
$('clearSavedSettings').onclick=task(async()=>{state.settings=await call('clearCodexSettings');showSettings();toast('已清除本机保存的 API Key 和连接设置。');});
$('codexSuggest').onclick=task(async()=>{if(!state.records.length||!state.files.length)throw new Error('先导入 PSD / PSB 和文档。');if($('codexSuggest').disabled)return;const local=state.settings.mode==='local';if(local?!state.settings.executable:(!state.settings.hasApiKey||!(state.settings.apiModel||state.settings.model))){await openSettings();return;}const capture=captureBindingRequest(state);if(!capture.request.layers.length){containerEditor.check();toast('文案均已绑定，已检查文字与背景容器。');return;}if(!await confirmAction((local?'将使用本地 Codex CLI 当前登录运行对应任务，不使用软件保存的 API Key。':'将通过你配置的 API 接口发送原文字、图层名称和目标文案，可能产生 API 费用。')+'\n找到后自动绑定，可在预览中修改，也可按 Ctrl+Z 撤回。继续？'))return;
  $('codexSuggest').disabled=true;$('codexSuggest').textContent='正在查找并绑定…';const requestId=bindingProgress.start();let completed=false;try{const result=await call('suggest',{...capture.request,requestId});bindingProgress.applying();let summary;history.transaction(()=>{summary=applyBindingResult(state,capture,result.matches);state.checked=false;state.chosen=layer()?.recordId||null;},'ai-binding');render();containerEditor.check();focusBoundLayer();completed=true;toast('文案对应完成：已自动绑定 '+summary.bound+' 个文字层，'+summary.unmatched+' 个未匹配。请预览检查；Ctrl+Z 可撤回本次绑定。'+(result.configurationWarning?'\n'+result.configurationWarning:''));}finally{bindingProgress.finish(completed);$('codexSuggest').disabled=false;$('codexSuggest').textContent='帮我找对应文案';}});
window.addEventListener('resize',()=>{if(file())applyScale();});
window.addEventListener('error',e=>toast('页面异常：'+e.message,true));
layoutEditor=createLayoutEditor({$,file,layer,record,fitText,call,changed:()=>{state.checked=false;renderProof();$('checkCount').textContent='待检查';$('minSize').disabled=!layer()||!!layer().manual;layoutEditor.sync();const l=layer();$('bindingState').textContent=l?.recordId?(typeof l.customText==='string'?'替换文案已手动修改，来源：':'已绑定：')+record(l.recordId)?.source:'先选择文档条目绑定；绑定后可双击替换文字编辑。';workflow?.update();document.querySelectorAll('.layer-card').forEach((n,i)=>{const l=file().layers[i];n.querySelector('.layer-status').textContent=l.skipExport?'−':l.recordId?'✓':l.issues.length?'!':'○';});},selectLayer:selectedLayer,onCanvasSelection:selection=>{if(selection){containerEditor?.clearSelection?.();contextProperties?.show(selection);}else{containerEditor?.clearSelection?.();contextProperties?.clear();}},onShapeHit:e=>containerEditor?.hitSelect?.(e)||false,afterDraw:()=>{containerEditor?.draw();aiHighlights?.draw();layoutLearning?.rendered();const selection=containerEditor?.getSelection?.()||layoutEditor?.getSelection?.();if(selection)contextProperties?.update(selection);else contextProperties?.clear();}});
const originalNavigation=installPreviewNavigation($('viewport'),$('stage'),{getScale:()=>file()?state.scale:0,setScale:scale=>{state.scale=scale;applyScale();}});

// History contains document edits only. Selection, focus, zoom and scrolling are
// transient UI state and must not create an undo step or change the edit branch.
function viewSnapshot(viewport,stage){const v=$(viewport).getBoundingClientRect(),s=$(stage).getBoundingClientRect();return {left:s.left-v.left,top:s.top-v.top};}
function restoreView(viewport,stage,value){const v=$(viewport),r=v.getBoundingClientRect(),s=$(stage).getBoundingClientRect();v.scrollLeft+=s.left-r.left-value.left;v.scrollTop+=s.top-r.top-value.top;}
history=installHistory({onBegin:()=>{workRecords?.beginEdit();aiHighlights?.clear();layoutLearning?.begin();},onCommit:entry=>{workRecords?.recordEdit(entry);if(['history','undo','redo'].includes(entry.reason))layoutLearning?.discardPending();else layoutLearning?.commit(entry);},context:()=>JSON.stringify([state.batchPreviewId||'',state.files.map(f=>[f.path,f.fingerprint,f.layers.filter(l=>!l.nativeCreation).map(l=>l.id)]),state.records.map(r=>[r.id,r.digest])]),
 read:()=>JSON.parse(JSON.stringify({mixedTextEdits:state.files.map(f=>f.mixedTextEdits||[]),artworkHides:state.files.map(f=>f.artworkHides||[]),containers:state.files.map(f=>f.containers||[]),extractedContainers:state.files.map(f=>f.extractedContainers||[]),containerEdits:state.files.map(f=>f.containerEdits||[]),files:state.files.map(f=>f.layers.map(({transformSelected,...l})=>l)),magneticSnap:$('magneticSnap').checked,alignmentTarget:$('alignmentTarget').value})),
 write:s=>{state.files.forEach((f,i)=>{f.mixedTextEdits=JSON.parse(JSON.stringify(s.mixedTextEdits?.[i]||[]));f.artworkHides=JSON.parse(JSON.stringify(s.artworkHides?.[i]||[]));f.containers=JSON.parse(JSON.stringify(s.containers?.[i]||[]));f.extractedContainers=JSON.parse(JSON.stringify(s.extractedContainers?.[i]||[]));f.containerEdits=JSON.parse(JSON.stringify(s.containerEdits?.[i]||[]));});state.files.forEach((f,i)=>{const selected=new Set(f.layers.filter(l=>l.transformSelected).map(l=>l.id));f.layers=JSON.parse(JSON.stringify(s.files[i])).map(l=>selected.has(l.id)?{...l,transformSelected:true}:l);});state.layerIndex=Math.min(state.layerIndex,Math.max(0,(file()?.layers.length||1)-1));state.checked=false;$('magneticSnap').checked=!!s.magneticSnap;$('alignmentTarget').value=s.alignmentTarget==='canvas'?'canvas':'selection';render();applyScale();layoutEditor.draw();},notify:toast});
containerEditor=createContainerEditor({$,state,file,layer,record,fitText,selectLayer:selectedLayer,onSelection:selection=>{if(selection)contextProperties?.show(selection);else contextProperties?.clear();},changed:()=>{state.checked=false;render();},transaction:(action,reason)=>history.transaction(action,reason),toast});
try{layoutLearning=installLayoutLearning({state,file,fitText,getVisual:options=>layoutEditor.visualSnapshot(options),call});}catch{layoutLearning=null;}
containerSplit=installContainerSplit({$,state,file,call,history,render,toast,extract:createContainerExtractor({call,history,render,toast,state,getFile:file,onPreview:(f,url)=>layoutEditor.cacheBackground(f,url)})});
$('undoEdit').onclick=history.undo;$('redoEdit').onclick=history.redo;
installHistoryPanel({$,history});
aiHighlights=installAiLayoutHighlight({$,file,layer,record,fitText});

$('centerOriginal').onclick=()=>originalNavigation.centerCanvas();
const workspaceLayout=installWorkspaceLayout({onResize:()=>{if(file()){applyScale();layoutEditor.draw();}}});
const resetWorkspace=document.createElement('button');resetWorkspace.type='button';resetWorkspace.className='text-button';resetWorkspace.id='resetWorkspaceLayout';resetWorkspace.textContent='重置布局';resetWorkspace.title='恢复各区域宽度和背景容器浮窗位置，不改变文字排版';resetWorkspace.onclick=()=>{workspaceLayout.reset();containerEditor.resetWindow?.();toast('工作区布局已恢复，文字排版不变。');};$('canvasTitle').parentElement.append(resetWorkspace);
render();

workflow=installWorkflow({$,state,file,layer,selectFile,selectedLayer});workflow.update();
let aiTaskDialog=null;
const aiLayout=installAiLayout({$,state,file,layer,record,fitText,buildRequest:buildDesignLayoutRequest,getVisual:options=>layoutEditor.readyDesignVisuals(options),call,history,render,toast,openSettings,onSelecting:applied=>{
 const f=file();if(!f||f!==applied.file)return;const changed=new Set(applied.changedLayerIds),containers=new Set(applied.changedContainerIds);const index=f.layers.findIndex(l=>changed.has(l.id)||containers.has(l.containerId));
 for(const l of f.layers)l.transformSelected=changed.has(l.id);if(index>=0){state.layerIndex=index;state.chosen=f.layers[index].recordId;}
},onApplied:applied=>{if(applied.changedLayerIds.length||applied.changedContainerIds.length){if(layer()?.recordId)layoutEditor.setSelection(layer().id);focusBoundLayer();aiHighlights.show(applied);}},onProgress:p=>{
 if(p.phase==='running'&&!aiTaskDialog)aiTaskDialog=showTaskProgress({title:'AI 设计排版',onCancel:()=>aiLayout.cancel()});
 aiTaskDialog?.update({...p,phase:({running:'AI 正在分析',measuring:'校验与自动修正',cancelling:'正在取消',complete:'完成',error:'未完成',cancelled:'已取消'})[p.phase]||p.phase});if(['complete','cancelled','error'].includes(p.phase)){aiTaskDialog?.close();aiTaskDialog=null;}
}});
contextProperties=installContextProperties({$,onClear:()=>{containerEditor.clearSelection();layoutEditor.clearSelection();}});
installOutsideDismiss();bindingProgress=installBindingProgress({host:document.querySelector('.binding-panel'),call});
installServices({call,toast,$});
$('saveBeforeUpdate').onclick=()=>$('saveProject').click();
if(window.desktop)call('loadCodexSettings').then(v=>{state.settings=v;}).catch(e=>toast(e.message,true));
if(window.desktop)call('serviceReady').catch(e=>toast(e.message,true));

const batchPreview=createBatchPreview({state,parseImported,makePlan,refresh:reset=>{render();if(reset)fitView();else applyScale();},getView:()=>({original:viewSnapshot('viewport','stage'),replacement:viewSnapshot('replacementViewport','replacementStage'),replacementZoom:$('replacementZoom').value}),restoreView:v=>{if(v){restoreReplacementZoom($('replacementZoom'),v.replacementZoom);applyScale();layoutEditor.draw();restoreView('viewport','stage',v.original);restoreView('replacementViewport','replacementStage',v.replacement);}}});
const autoLayoutLanguage=createBatchLayoutRuntime({parseImported,fitText,call,getSettings:()=>state.settings});
const batchUi=installBatch({recordAction:fn=>workRecords?workRecords.runAction(fn):fn(),autoLayoutLanguage,onLearningResult:outcome=>{void startLearningTask(()=>layoutLearning?.refreshStatus?.(outcome));},$,call,toast,state,makePlan,preview:batchPreview});

const bulkUi=installBulkReplace({state,file,layer,call,toast,$,recordAction:fn=>workRecords?workRecords.runAction(fn):fn()});

const skuUi=installSkuWorkflow({$,file,call,toast,recordAction:fn=>workRecords?workRecords.runAction(fn):fn()});

import {installSparkit} from './sparkit.js';
installSparkit({state,toast,importPaths:paths=>runFileImport(()=>importOriginal(paths))});
const agentUi=installAgentUi({call,openSettings,isBusy:()=>importingFiles||pendingWorkspaceCalls.size||state.batchPreviewId||aiLayout.isBusy?.()||!!document.querySelector('dialog[open]:not(#agentDialog)'),execute:createAgentWorkspace({state,call,resetWorkspace:()=>{layoutEditor.resetImportedPreview();layoutEditor.clearSelection();Object.assign(state,{files:[],records:[],docName:'',docFingerprint:'',sourceDocument:null,fileIndex:0,layerIndex:0,chosen:null,checked:false});history.refresh();render();},importOriginal:paths=>runFileImport(()=>importOriginal(paths)),render,history,fitText,buildRequest:buildDesignLayoutRequest,getVisual:options=>layoutEditor.readyDesignVisuals(options),makePlan,selectFile,selectedLayer})});

if(window.desktop)call('serviceReady').catch(e=>toast(e.message,true));


function captureWork(){
 const {apiKey,hasApiKey,...settings}=state.settings||{};
 return {version:1,inspectorTab:document.querySelector('.binding-panel')?.dataset.mode,disclosures:[...document.querySelectorAll('details')].filter(n=>!n.closest('#agentDialog,#workRecords')).map(n=>({id:n.id,index:[...document.querySelectorAll('details')].indexOf(n),open:n.open})),batchPreview:batchPreview.captureWork?.(),project:{version:1,docName:state.docName,docFingerprint:state.docFingerprint,sourceDocument:state.sourceDocument,records:state.records,files:state.files.map(({preview,learningSource,...f})=>f),layoutPreferences:{magneticSnap:$('magneticSnap').checked,alignmentTarget:$('alignmentTarget').value}},selection:{fileIndex:state.fileIndex,layerIndex:state.layerIndex,chosen:state.chosen,scale:state.scale,tool:state.tool},controls:readWorkControls(),settings,assistant:agentUi.capture(),route:document.body.dataset.sparkRoute||'editor',dialog:document.querySelector('dialog[open]')?.id||'',view:{original:viewSnapshot('viewport','stage'),replacement:viewSnapshot('replacementViewport','replacementStage')},workspace:workspaceLayout.getLayout(),workflows:{sku:skuUi.captureWork?.(),bulk:bulkUi.captureWork?.(),batch:batchUi.captureWork?.()}};
}
async function restoreWork(snapshot){
 const p=snapshot.project,restored=[];await batchPreview.restoreWork?.(null);state.batchPreviewId=null;$('batchPreviewBar').hidden=true;
 for(const f of p?.files||[]){if(f.demo){restored.push(f);continue;}const parsed=await parseImported(f);restored.push({...parsed,...f,preview:parsed.preview,learningSource:parsed.learningSource,layers:structuredClone(f.layers)});}
 await Promise.all([...document.querySelectorAll('dialog[open]')].map(d=>d.close()));
 if(snapshot.settings){const existing=await call('loadCodexSettings');state.settings=await call('saveCodexSettings',{...existing,...snapshot.settings,apiKey:''});}
 Object.assign(state,{files:restored,records:p?.records||[],docName:p?.docName||'',docFingerprint:p?.docFingerprint||'',sourceDocument:p?.sourceDocument||null,...snapshot.selection,checked:false});state.fileIndex=Math.min(state.fileIndex||0,Math.max(0,state.files.length-1));state.layerIndex=Math.min(state.layerIndex||0,Math.max(0,(file()?.layers.length||1)-1));
 layoutCache.clear();layoutEditor.resetImportedPreview?.();layoutLearning?.discardPending?.();contextProperties?.clear();containerEditor?.clearSelection?.();layoutEditor?.clearSelection?.();
 writeWorkControls(snapshot.controls);skuUi.restoreWork?.(snapshot.workflows?.sku);await batchUi?.restoreWork?.(snapshot.workflows?.batch);bulkUi.restoreWork?.(snapshot.workflows?.bulk);await batchPreview.restoreWork?.(snapshot.batchPreview);
 writeWorkControls(snapshot.controls);workspaceLayout.setLayout?.(snapshot.workspace);render();await window.sparkitNavigate?.(snapshot.route==='home'?'home':'editor');applyScale();layoutEditor.draw();
 if(snapshot.inspectorTab==='layout')$('layoutTab').click();else $('bindingTab').click();for(const d of snapshot.disclosures||[]){const n=d.id?$(d.id):document.querySelectorAll('details')[d.index];if(n?.tagName==='DETAILS')n.open=d.open;}
 if(snapshot.view){restoreView('viewport','stage',snapshot.view.original);restoreView('replacementViewport','replacementStage',snapshot.view.replacement);}
 if(snapshot.dialog&&snapshot.dialog!=='agentDialog'){const dialog=$(snapshot.dialog);if(dialog?.tagName==='DIALOG'&&!dialog.open)dialog.showModal();}
 skuUi.refreshWork?.();if(snapshot.dialog==='bulkReplaceDialog')await bulkUi.prepareReplay?.('restore');
}
workRecords=installWorkRecords({call,capture:captureWork,restore:restoreWork,prepareReplay:async action=>{await skuUi.prepareReplay?.(action);await bulkUi.prepareReplay?.(action);},toast,agent:()=>agentUi,isBusy:()=>importingFiles||pendingWorkspaceCalls.size||!!state.batchPreviewId||aiLayout.isBusy?.()||skuUi.isBusy?.()||bulkUi.isBusy?.()||batchUi?.isBusy?.()});
