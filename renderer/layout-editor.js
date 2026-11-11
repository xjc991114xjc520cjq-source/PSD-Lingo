import {textActionsFor} from '../native-text-objects.cjs';
import {displayText} from '../text-display-style.cjs';
import {union,alignmentOffsets,snapBox} from '../alignment.cjs';
import {targetBox,clampPosition} from '../position.cjs';
import {installPreviewNavigation} from './preview-navigation.js';
import {restoreReplacementZoom,replacementScale} from './replacement-zoom.js';
import {activeContainerEdits} from '../container-fit.cjs';
import {manualStyleFor} from '../layout.cjs';
export function createLayoutEditor({$,file,layer,record,fitText,call,changed,selectLayer,afterDraw=()=>{},onCanvasSelection=()=>{},onShapeHit=()=>false}){
  let fontEngine=null;let previewEpoch=0;let timer,backgroundBusy=false,drag=null,moveDrag=null,editing=null,guides=[],lastVisualSignature='';
  let canvasSelection=null;
  function selectionAnchor(l){const b=textBounds(l),r=$('replacementStage').getBoundingClientRect(),s=Number($('replacementStage').dataset.scale)||1;return {left:r.left+b[0]*s,right:r.left+(b[0]+b[2])*s,top:r.top+b[1]*s,bottom:r.top+(b[1]+b[3])*s};}
  function getSelection(){if(!canvasSelection)return null;const l=file()?.layers.find(l=>l.id===canvasSelection.id);if(!l||!l.recordId||l.skipExport||l.issues?.length||canvasSelection.file!==file())return null;return {type:'text',id:l.id,name:l.name,anchor:selectionAnchor(l)};}
  function setSelection(id){const l=file()?.layers.find(l=>l.id===id);if(!l)return clearSelection();canvasSelection={id:l.id,file:file()};onCanvasSelection(getSelection());draw();}
  function clearSelection(){canvasSelection=null;for(const l of file()?.layers||[])delete l.transformSelected;closeTextEditor();guides=[];$('replacementSelection').hidden=true;$('multiSelections').replaceChildren();onCanvasSelection(null);draw();}
  const backgroundJobs=new Map();let backgroundTail=Promise.resolve();
  const backgrounds=new Map(), images=new Map(), failures=new Map(),fontsByName=new Map(),lastBackgrounds=new Map();
  const weightFromFont=(name='')=>{const n=String(name).toLowerCase();if(/(black|heavy|extrabold|ultrabold)/.test(n))return 'black';if(/(semibold|demibold|demi)/.test(n))return 'semibold';if(/(medium)/.test(n))return 'medium';if(/(light|thin|extralight)/.test(n))return 'light';if(/(bold|黑|粗)/.test(n))return 'bold';return 'regular';};
  const cssWeight=(l,m)=>{if(m?.weight&&m.weight!=='original')return ({light:300,regular:400,medium:500,semibold:600,bold:700,black:900}[m.weight]||400);return ({light:300,regular:400,medium:500,semibold:600,bold:700,black:900}[weightFromFont(m?.font||l?.font)]||400);};
  const fontFamily=(l,m,fit)=>{const name=m?.font||l?.font||fit?.family||'';return m?.family||fontsByName.get(name)?.family||({ArialMT:'Arial','Arial-BoldMT':'Arial',MicrosoftYaHei:'Microsoft YaHei'}[name])||name.replace(/[-_](?=(bold|black|medium|regular|light|semibold))/ig,' ').replace(/[-_]/g,' ');};
  const bound=f=>(f?.layers||[]).filter(l=>l.recordId&&!l.skipExport&&!l.issues.length);
  const containerEdits=f=>activeContainerEdits(f);
  const sourceKey=f=>JSON.stringify([f?.fingerprint,bound(f).map(l=>l.id),f?.extractedContainers||[],f?.artworkHides||[],textActionsFor(f||{})]);
  const key=f=>JSON.stringify([f?.fingerprint,bound(f).map(l=>l.id),containerEdits(f),f?.extractedContainers||[],f?.artworkHides||[],textActionsFor(f||{})]);
  const visualSignature=f=>JSON.stringify([key(f),bound(f).map(l=>[l.id,l.recordId,l.customText,l.box,l.position,l.manual,l.capitalization,style(l),fitText(l,record(l.recordId))])]);
  function textBounds(l){const r=record(l.recordId);if(!r)throw Error('文字绑定的文案记录不存在，请检查当前文案与绑定');const box=targetBox(l.box,l.position),fit=fitText(l,r);
    const x=box[0]+(l.alignment==='center'?(box[2]-fit.width)/2:l.alignment==='right'?box[2]-fit.width:0);
    return [x,box[1],Math.max(1,fit.width),Math.max(1,fit.height)];}

  function clampLayer(l,position){const current=targetBox(l.box,l.position),b=textBounds(l),ox=b[0]-current[0],oy=b[1]-current[1],f=file();return {x:Math.round(Math.max(-ox,Math.min(f.width-ox-b[2],position.x))*10)/10,y:Math.round(Math.max(-oy,Math.min(f.height-oy-b[3],position.y))*10)/10};}
  function selected(){const chosen=bound(file()).filter(l=>l.transformSelected);return chosen.length?chosen:bound(file()).filter(l=>l===layer());}
  function starts(items){return items.map(l=>{const b=targetBox(l.box,l.position);return {l,x:b[0],y:b[1],visible:textBounds(l)};});}
  function moveGroup(entries,dx,dy){const f=file();dx=Math.max(Math.max(...entries.map(e=>-e.visible[0])),Math.min(Math.min(...entries.map(e=>f.width-e.visible[0]-e.visible[2])),dx));dy=Math.max(Math.max(...entries.map(e=>-e.visible[1])),Math.min(Math.min(...entries.map(e=>f.height-e.visible[1]-e.visible[3])),dy));for(const e of entries)e.l.position={x:Math.round((e.x+dx)*10)/10,y:Math.round((e.y+dy)*10)/10};return [dx,dy];}
  $('toggleMulti').onclick=()=>{const l=layer();if(!bound(file()).includes(l))return;l.transformSelected=!l.transformSelected;changed();};
  $('selectAllBound').onclick=()=>{for(const l of bound(file()))l.transformSelected=true;changed();};
  $('clearMulti').onclick=()=>{for(const l of file()?.layers||[])delete l.transformSelected;changed();};
  $('magneticSnap').onchange=()=>{guides=[];draw();};
  $('alignmentTarget').onchange=()=>{guides=[];draw();};
  for(const button of document.querySelectorAll('[data-align]'))button.onclick=()=>{try{const items=selected();if(!items.length)return;const boxes=items.map(textBounds),mode=button.dataset.align,canvas=$('alignmentTarget').value==='canvas',target=canvas?[0,0,file().width,file().height]:null;
    const offsets=alignmentOffsets(boxes,mode,target);let limited=false;
    items.forEach((l,i)=>{const b=targetBox(l.box,l.position),x=b[0]+offsets[i][0],y=b[1]+offsets[i][1],position=clampLayer(l,{x,y});if(Math.abs(position.x-x)>.11||Math.abs(position.y-y)>.11)limited=true;l.position=position;});guides=[];changed();$('alignmentMessage').textContent=limited?'部分文字已到画布边界，当前文字尺寸无法继续靠边；当前位置已限制在画布内。':'已应用'+button.textContent+'，可用 Ctrl＋Z 撤回。';}catch(e){$('alignmentMessage').textContent=e.message;}};

  function imageFor(url){if(!images.has(url)){const image=new Image();images.set(url,image);image.onload=draw;image.src=url;}return images.get(url);}
  function style(l){const r=record(l.recordId),fit=r?fitText(l,r):null;return l.manual?manualStyleFor(l):manualStyleFor(l,{size:fit?.size||l.size,tracking:fit?.tracking??l.tracking,leading:fit?.leading||l.leading});}
  function updateFontDiagnostic(l){const out=$('fontDiagnostic');if(!out)return;if(!l?.recordId){out.textContent='加载本机字体后检查当前替换文案是否缺字。';return;}const m=l.manual, name=m?.font||l.font||'', family=fontFamily(l,m,{family:name}), installed=fontsByName.has(name)||!document.fonts?.check||document.fonts.check(`16px "${family.replace(/"/g,'')}"`);out.textContent=installed?'当前字体已找到；仍需检查目标语言是否包含全部字形。':'未找到“'+name+'”字体，预览可能回退到其他字体。请加载字体后选择替换字体与字重。';out.classList.toggle('warn',!installed);}
  function ensureFontTools(){const host=document.querySelector('.typography-editor');if(!host||$('applyFontReplacement'))return;const details=document.createElement('details');details.className='font-replacement-tools';const summary=document.createElement('summary');summary.textContent='字体缺字检查与统一替换';const hint=document.createElement('p');hint.id='fontDiagnostic';hint.className='hint';hint.textContent='加载本机字体后检查当前替换文案是否缺字。';const grid=document.createElement('div');grid.className='extra-typography';const make=(label,id,tag='input')=>{const wrap=document.createElement('label');wrap.textContent=label;const el=document.createElement(tag);el.id=id;if(tag==='select'){for(const [value,text] of [['any','任意字重'],['regular','Regular / Light'],['medium','Medium'],['semibold','SemiBold'],['bold','Bold'],['black','Black']]){const o=document.createElement('option');o.value=value;o.textContent=text;el.append(o);}}wrap.append(el);return wrap;};const source=make('源字体','sourceFontName');const sourceWeight=make('源字重','sourceFontWeight','select');const target=make('替换字体','replacementFontName');target.querySelector('input').setAttribute('list','fontOptions');const targetWeight=make('替换字重','replacementFontWeight','select');grid.append(source,sourceWeight,target,targetWeight);const apply=document.createElement('button');apply.id='applyFontReplacement';apply.type='button';apply.className='ghost compact';apply.textContent='按字体与字重统一替换';apply.onclick=()=>{const old=source.querySelector('input').value.trim()||layer()?.font||'';const wanted=target.querySelector('input').value.trim();const matchWeight=sourceWeight.querySelector('select').value;const wantedWeight=targetWeight.querySelector('select').value;if(!wanted){$('editWarning').textContent='请先指定替换字体；可从“加载本机 Photoshop 字体”结果中选择。';return;}const targetInfo=fontsByName.get(wanted)||[...fontsByName.values()].find(f=>f.family===wanted&&weightFromFont(f.name)===wantedWeight);const targetName=targetInfo?.name||wanted;if(!targetInfo&&fontsByName.size&&wantedWeight!=='any')$('editWarning').textContent='未找到所选目标字重的本机字体，将按输入的 Photoshop 字体名称继续。';let count=0;for(const f of file()?.layers?[file()]:[]){for(const l of f.layers||[]){if(l.font!==old||matchWeight!=='any'&&weightFromFont(l.font)!==matchWeight)continue;const r=record(l.recordId),fit=r?fitText(l,r):null;l.manual={...style(l),enabled:true,font:targetName,weight:'original',family:targetInfo?.family||undefined,size:l.manual?.size||fit?.size||l.size};count++;}}changed();$('editWarning').textContent=count?'已统一替换 '+count+' 个匹配图层；字体名称和目标字重已精确写入。':'没有找到同时匹配源字体和字重的图层。';};details.append(summary,hint,grid,apply);host.append(details);}
  function ensureWeightOptions(){const select=$('editWeight');if(!select)return;for(const [value,text] of [['light','Light'],['medium','Medium'],['semibold','SemiBold'],['black','Black']])if(![...select.options].some(o=>o.value===value)){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}}
  function sync(){
    const engine=file()?.format==='AI'?'AI':'PS';if(fontEngine!==engine){fontEngine=engine;fontsByName.clear();$('fontOptions').replaceChildren();}
    const l=layer(),enabled=!!l?.recordId,m=l?style(l):{};
    if(editing&&editing.layer!==l)closeTextEditor();
    for(const id of ['manualEnabled','editSize','editFont','editWeight','editTracking','editLeading','editStretchX','editStretchY','resetTypography'])$(id).disabled=!enabled;
    $('manualEnabled').checked=!!l?.manual;
    for(const [id,name] of [['editSize','size'],['editFont','font'],['editWeight','weight'],['editTracking','tracking'],['editLeading','leading'],['editStretchX','stretchX'],['editStretchY','stretchY']])$(id).value=typeof m[name]==='number'?Math.round(m[name]*10)/10:m[name]??(name.startsWith('stretch')?100:'');
    $('skipLayer').disabled=!l||!!l.artworkHidden;$('skipLayer').checked=!!l?.skipExport;
    const box=l?targetBox(l.box,l.position):[0,0];$('editX').value=box[0];$('editY').value=box[1];
    for(const id of ['editX','editY','resetPosition'])$(id).disabled=!enabled||l.skipExport||!!l.issues.length;
    $('editContent').disabled=!enabled;$('restoreDocumentText').disabled=!enabled||typeof l.customText!=='string';
    $('customTextState').textContent=typeof l?.customText==='string'?'替换文案已手动修改；导入文档原文保留。':'替换文字使用你选择的文档文案，可双击文字框编辑。';
    $('editWarning').textContent=l?.issues.length?'此层导出限制：'+l.issues.join('；'):enabled?'拖动文字调整位置，Shift 锁定水平或垂直移动；八个手柄调整尺寸，角点默认等比、Shift 自由拉伸。Alt＋滚轮缩放；空格＋左键拖动画面。手动排版参数导出时不会被覆盖。':'先为这处文字指定文案，然后可调整文字大小和位置。';
    const items=selected();$('multiStatus').textContent='当前操作 '+items.length+' 个文字'+(items.length>1?' · 可整体拖动及对齐':'');$('toggleMulti').disabled=!bound(file()).includes(l);$('selectAllBound').disabled=!bound(file()).length;for(const button of document.querySelectorAll('[data-align]'))button.disabled=button.dataset.align.startsWith('gap')||button.dataset.align.startsWith('distribute')?items.length<3:!items.length;
    ensureWeightOptions();ensureFontTools();updateFontDiagnostic(l);update();
  }
  function commit(m){const l=layer();if(!l?.recordId)return;const box=targetBox(l.box,l.position);l.manual={...m,enabled:true};l.position=clampLayer(l,l.position||{x:box[0],y:box[1]});const actual=textBounds(l),scale=drag?.scale||Number($('replacementStage').dataset.scale)||1;guides=guides.filter(g=>[actual[g.axis],actual[g.axis]+actual[g.axis+2]/2,actual[g.axis]+actual[g.axis+2]].some(value=>Math.abs(value-g.value)<=1/scale));changed();}
  $('manualEnabled').onchange=()=>{const l=layer();if(!l)return;if($('manualEnabled').checked)commit(style(l));else{delete l.manual;changed();}};
  function read(){const m={enabled:true,size:Number($('editSize').value),font:$('editFont').value.trim(),weight:$('editWeight').value,tracking:Number($('editTracking').value),leading:Number($('editLeading').value),stretchX:Number($('editStretchX').value),stretchY:Number($('editStretchY').value)};
    if(!Number.isFinite(m.stretchX)||m.stretchX<10||m.stretchX>1000||!Number.isFinite(m.stretchY)||m.stretchY<10||m.stretchY>1000||!m.font||!Number.isFinite(m.size)||m.size<1||m.size>2000||!Number.isFinite(m.tracking)||m.tracking < -200||m.tracking>1000||!Number.isFinite(m.leading)||m.leading<1||m.leading>4000){$('editWarning').textContent='请输入有效字号 1–2000、字距 -200–1000、行距 1–4000 及字体名称。';return;}const selectedFont=fontsByName.get(m.font);if(selectedFont)m.family=selectedFont.family;commit(m);}
  for(const id of ['editSize','editFont','editWeight','editTracking','editLeading','editStretchX','editStretchY'])$(id).onchange=read;
  $('resetTypography').onclick=()=>{delete layer().manual;changed();};
  for(const id of ['editX','editY'])$(id).onchange=()=>{const x=Number($('editX').value),y=Number($('editY').value);if(!Number.isFinite(x)||!Number.isFinite(y))return;const l=layer(),f=file();l.position=clampLayer(l,{x,y});changed();};
  $('resetPosition').onclick=()=>{delete layer().position;changed();};
  function closeTextEditor(){editing=null;$('inlineTextEdit').hidden=true;}
  function editText(){const l=layer();if(!l?.recordId)return;const r=record(l.recordId),b=textBounds(l),s=Number($('replacementStage').dataset.scale);
    editing={layer:l,id:l.id,recordId:l.recordId};const box=$('inlineTextEdit');box.hidden=false;Object.assign(box.style,{left:b[0]*s+'px',top:b[1]*s+'px',width:Math.max(240,Math.min(480,b[2]*s+24))+'px'});
    $('inlineTextValue').value=typeof l.customText==='string'?l.customText:r.target;$('inlineTextMessage').textContent='Ctrl＋Enter 保存 · Esc 取消';box.scrollIntoView({block:'nearest',inline:'nearest'});$('inlineTextValue').focus({preventScroll:true});$('inlineTextValue').select();
  }
  function saveText(){const l=layer();if(!editing||l!==editing.layer||l.recordId!==editing.recordId){closeTextEditor();return;}const text=$('inlineTextValue').value;if(!text.trim()||text.length>100000){$('inlineTextMessage').textContent='文案不能为空或超过 10 万字符；不处理此层可选择跳过。';return;}
    if(text===record(l.recordId).target)delete l.customText;else l.customText=text;closeTextEditor();changed();$('replacementViewport').focus({preventScroll:true});
  }
  $('editContent').onclick=editText;$('saveInlineText').onclick=saveText;$('cancelInlineText').onclick=closeTextEditor;
  $('restoreDocumentText').onclick=()=>{delete layer().customText;closeTextEditor();changed();};
  $('inlineTextValue').onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();closeTextEditor();$('replacementViewport').focus({preventScroll:true});}else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();saveText();}};
  $('skipLayer').onchange=()=>{layer().skipExport=$('skipLayer').checked;changed();};
  $('loadFonts').onclick=async()=>{try{$('loadFonts').disabled=true;const fonts=await call('installedFonts',file()?.format);fontsByName.clear();$('fontOptions').replaceChildren();for(const f of fonts){fontsByName.set(f.name,f);const o=document.createElement('option');o.value=f.name;o.label=f.family+' · '+f.style;$('fontOptions').append(o);}updateFontDiagnostic(layer());$('editWarning').textContent='已读取 '+fonts.length+' 款原生程序字体；可按字体名称和字重精确替换。';}catch(e){$('editWarning').textContent=e.message;}finally{$('loadFonts').disabled=false;}};
  $('refreshBackground').onclick=()=>{const f=file();if(f){failures.delete(key(f));backgrounds.delete(key(f));requestBackground();}};
  async function loadedImage(url){const img=imageFor(url);if(!img.complete||!img.naturalWidth)await img.decode();if(!img.naturalWidth)throw Error('预览图像解码失败');return img;}
  async function ensureBackground(f){
    const epoch=previewEpoch,k=key(f),sk=sourceKey(f);if(failures.has(k))throw Error(failures.get(k));
    if(!backgrounds.has(k)&&!backgroundJobs.has(k)){
      const request=JSON.parse(JSON.stringify({path:f.path,fingerprint:f.fingerprint,ids:bound(f).map(l=>l.id),containerEdits:containerEdits(f),extractedContainers:f.extractedContainers||[],textActions:textActionsFor(f),artworkHides:f.artworkHides||[]}));const job=backgroundTail.then(async()=>{try{if(epoch!==previewEpoch)throw Error('原稿已重新导入，本次预览已失效');const url=await call('previewBackground',request);if(epoch!==previewEpoch)throw Error('原稿已重新导入，本次预览已失效');await loadedImage(url);if(epoch!==previewEpoch)throw Error('原稿已重新导入，本次预览已失效');backgrounds.set(k,url);lastBackgrounds.set(sk,url);if(backgrounds.size>12)backgrounds.delete(backgrounds.keys().next().value);if(lastBackgrounds.size>6)lastBackgrounds.delete(lastBackgrounds.keys().next().value);}catch(e){if(epoch===previewEpoch)failures.set(k,String(e.message||e));throw e;}finally{if(backgroundJobs.get(k)===job)backgroundJobs.delete(k);}});backgroundJobs.set(k,job);backgroundTail=job.catch(()=>{});
    }
    if(backgroundJobs.has(k))await backgroundJobs.get(k);
    const url=backgrounds.get(k);if(!url)throw Error('当前替换背景尚未生成');await loadedImage(url);
  }
  async function requestBackground(){const f=file();if(!f||f.demo||(!bound(f).length&&(!f.artworkHides?.length&&!textActionsFor(f).length))||backgroundBusy)return;
    backgroundBusy=true;$('replacementNote').textContent='正在原生软件副本中生成背景…';
    try{await ensureBackground(f);}catch{}finally{backgroundBusy=false;draw();if(file()&&key(file())!==key(f))update();}
  }
  async function readyDesignVisuals(options={}){
    const f=file(),working=options.file||f;if(!f||f.demo||working?.fingerprint!==f.fingerprint)return [];
    const epoch=previewEpoch,signature=visualSignature(f),requireCurrent=options.requireCurrent??(!!bound(working).length||(!!working.artworkHides?.length||!!textActionsFor(working).length));
      if(requireCurrent){if(options.retryBackground===true&&!backgroundJobs.has(key(working))){failures.delete(key(working));backgrounds.delete(key(working));}try{await ensureBackground(working);}catch(e){throw Error('当前替换预览生成失败：'+e.message);}}
    else if($('art').dataset.image!==f.preview)await loadedImage(f.preview);
    if(epoch!==previewEpoch||file()!==f||visualSignature(f)!==signature)throw Error('项目在预览生成期间已变化，请基于当前状态重新预览');
    const visuals=designVisuals(options);if(requireCurrent&&!visuals.some(v=>v.stage==='current'))throw Error('未取得当前替换预览，不能使用原稿代替');return visuals;
  }
  function cacheBackground(f,url){if(!f||!url)return;const k=key(f);backgrounds.set(k,url);lastBackgrounds.set(sourceKey(f),url);failures.delete(k);imageFor(url);}
  function update(){const f=file(),visible=!!f&&(f.layers.some(l=>l.recordId)||(!!f.artworkHides?.length||!!textActionsFor(f).length));$('comparison').classList.toggle('has-replacement',visible);$('replacementPane').hidden=!visible;draw();clearTimeout(timer);if(visible)timer=setTimeout(requestBackground,450);}
  function draw(){const f=file();if(!f||(!f.layers.some(l=>l.recordId)&&(!f.artworkHides?.length&&!textActionsFor(f).length)))return;
    lastVisualSignature='';
    const viewport=$('replacementViewport'),zoom=restoreReplacementZoom($('replacementZoom'),$('replacementZoom').value),scale=replacementScale(f.width,viewport.clientWidth,zoom);
    // Hidden batch/workbench panels have no layout yet. Keep the last canvas
    // intact; ResizeObserver redraws once the preview becomes visible again.
    if(scale===null||!Number.isFinite(f.height)||f.height<=0)return;
    const pixelScale=Math.min(scale,Math.sqrt(6000000/(f.width*f.height)),16384/f.width,16384/f.height);
    const stage=$('replacementStage'),c=$('replacementArt');stage.style.width=f.width*scale+'px';stage.style.height=f.height*scale+'px';stage.dataset.scale=scale;
    c.width=Math.max(1,Math.ceil(f.width*pixelScale));c.height=Math.max(1,Math.ceil(f.height*pixelScale));const ctx=c.getContext('2d');ctx.scale(pixelScale,pixelScale);
    const k=key(f),currentBackground=backgrounds.get(k),background=currentBackground||lastBackgrounds.get(sourceKey(f)),url=background;
    if(f.demo){ctx.drawImage($('art'),0,0,f.width,f.height);}else if(url){const img=imageFor(url);if(img.complete&&img.naturalWidth)ctx.drawImage(img,0,0,f.width,f.height);}
    $('replacementNote').textContent=background?currentBackground?'当前导出排版 · 背景已隐藏绑定原文 · Photoshop 字形渲染可能有差异':failures.has(k)?'容器背景更新失败，显示上次背景；请重新载入。原因：'+failures.get(k):'容器轮廓已调整，正在通过 Photoshop 更新背景…':f.demo?'演示预览 · 原文字仍保留在背景中':backgroundBusy?'正在生成替换预览背景，请稍候…':'背景生成失败，暂不显示合成画面。请确认 Photoshop 窗口正常打开后点击“重新载入背景”。'+(failures.get(k)?' 原因：'+failures.get(k):'');
    if(!f.demo&&!background){$('multiSelections').replaceChildren();$('snapGuides').replaceChildren();$('replacementSelection').hidden=true;afterDraw();return;}
    for(const l of bound(f))drawReplacementLayer(ctx,l,record(l.recordId));
    $('multiSelections').replaceChildren();for(const item of (getSelection()?selected():[]).filter(item=>item!==layer())){const b=textBounds(item),n=document.createElement('div');n.className='multi-selection';n.dataset.layerId=item.id;Object.assign(n.style,{left:b[0]*scale+'px',top:b[1]*scale+'px',width:b[2]*scale+'px',height:b[3]*scale+'px'});$('multiSelections').append(n);}
    $('snapGuides').replaceChildren();for(const guide of guides){const n=document.createElement('div');n.className='snap-guide '+(guide.axis===0?'x':'y');n.style[guide.axis===0?'left':'top']=guide.value*scale+'px';$('snapGuides').append(n);}
    const l=layer(),box=$('replacementSelection');box.hidden=!getSelection()||canvasSelection.id!==l?.id||!l?.recordId||l.skipExport||!!l.issues.length;
    if(!box.hidden){box.dataset.layerId=l.id;const fit=fitText(l,record(l.recordId)),destination=textBounds(l);Object.assign(box.style,{left:destination[0]*scale+'px',top:destination[1]*scale+'px',width:destination[2]*scale+'px',height:destination[3]*scale+'px'});box.classList.toggle('overflow',!fit.ok);$('resizeText').title='拖动调整替换字号（'+fit.size.toFixed(1)+'）';}
    if(currentBackground){const img=images.get(currentBackground);if(img?.complete&&img.naturalWidth)lastVisualSignature=visualSignature(f);}
    afterDraw();
  }
  function drawReplacementLayer(ctx,l,r){if(!r)return;const fit=fitText(l,r),m=l.manual,ratio=(l.aspectScale||1)*(m?.stretchX??100)/100,align=l.alignment,offset=align==='center'?l.box[2]/2:align==='right'?l.box[2]:0;
    const destination=targetBox(l.box,l.position);ctx.save();ctx.translate(destination[0],destination[1]);ctx.scale(ratio,(m?.stretchY??100)/100);ctx.fillStyle=l.color;ctx.font=`${cssWeight(l,m)} ${fit.size}px "${fontFamily(l,m,fit).replace(/"/g,'')}", "Microsoft YaHei", sans-serif`;ctx.textBaseline='alphabetic';ctx.textAlign=align==='center'?'center':align==='right'?'right':'left';ctx.letterSpacing=fit.tracking*fit.size/1000+'px';
    for(let i=0;i<fit.lines.length;i++)ctx.fillText(displayText(fit.lines[i],l.capitalization),offset/ratio,(fit.ascent+i*fit.leading)/((m?.stretchY??100)/100));ctx.restore();
  }
  $('replacementZoom').onchange=draw;
  function hit(e){const f=file();if(!f||!f.demo&&!backgrounds.has(key(f)))return null;const rect=$('replacementStage').getBoundingClientRect(),s=Number($('replacementStage').dataset.scale),x=(e.clientX-rect.left)/s,y=(e.clientY-rect.top)/s;
    const hits=bound(f).filter(l=>{const b=textBounds(l);return x>=b[0]&&x<=b[0]+b[2]&&y>=b[1]&&y<=b[1]+b[3];});return hits.find(l=>l.id===layer()?.id)||hits.at(-1);}
  $('replacementArt').onpointerdown=e=>{if(e.button!==0||replacementNavigation.isPanning())return;const l=hit(e);if(!l){clearSelection();onShapeHit(e);return;}e.preventDefault();if(e.ctrlKey||e.metaKey){setSelection(l.id);l.transformSelected=!l.transformSelected;changed();return;}if(!l.transformSelected)for(const other of file().layers)delete other.transformSelected;const viewport=$('replacementViewport'),left=viewport.scrollLeft,top=viewport.scrollTop;
    if(layer()?.id!==l.id){selectLayer(file().layers.indexOf(l));viewport.scrollLeft=left;viewport.scrollTop=top;}
    setSelection(l.id);
    const b=targetBox(l.box,l.position);moveDrag={id:l.id,x:e.clientX,y:e.clientY,position:{x:b[0],y:b[1]},entries:starts(selected()),bounds:union(selected().map(textBounds)),scale:Number($('replacementStage').dataset.scale)};$('replacementArt').setPointerCapture(e.pointerId);
  };
  $('replacementArt').onpointermove=e=>{if(!moveDrag){$('replacementArt').style.cursor=hit(e)?'move':'default';return;}const l=layer(),f=file();if(l?.id!==moveDrag.id)return;
    if(!moveDrag.started){if(Math.hypot(e.clientX-moveDrag.x,e.clientY-moveDrag.y)<3)return;moveDrag.started=true;}
    let dx=e.clientX-moveDrag.x,dy=e.clientY-moveDrag.y;if(e.shiftKey){if(!moveDrag.axis)moveDrag.axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';if(moveDrag.axis==='x')dy=0;else dx=0;}else moveDrag.axis=null;dx/=moveDrag.scale;dy/=moveDrag.scale;guides=[];
    if($('magneticSnap').checked&&!e.altKey){const ids=new Set(moveDrag.entries.map(e=>e.l.id)),refs=[[0,0,f.width,f.height],...f.layers.filter(other=>!ids.has(other.id)&&!other.issues.includes('隐藏文字层')).map(other=>bound(f).includes(other)?textBounds(other):other.box)],b=moveDrag.bounds,snap=snapBox([b[0]+dx,b[1]+dy,b[2],b[3]],refs,6/moveDrag.scale,[moveDrag.axis!=='y',moveDrag.axis!=='x']);dx+=snap.offsets[0];dy+=snap.offsets[1];guides=snap.guides;}
    const actual=moveGroup(moveDrag.entries,dx,dy);if(Math.abs(actual[0]-dx)>.1||Math.abs(actual[1]-dy)>.1)guides=[];changed();};
  $('replacementArt').onpointerup=e=>{moveDrag=null;guides=[];draw();if($('replacementArt').hasPointerCapture(e.pointerId))$('replacementArt').releasePointerCapture(e.pointerId);};
  $('replacementArt').onpointercancel=()=>{moveDrag=null;guides=[];draw();};
  $('replacementArt').ondblclick=e=>{const l=hit(e);if(!l)return;if(layer()?.id!==l.id)selectLayer(file().layers.indexOf(l));setSelection(l.id);editText();};
  for(const handle of document.querySelectorAll('.transform-handle')){
    handle.onpointerdown=e=>{const l=layer();if(!l?.recordId)return;e.preventDefault();e.stopPropagation();const b=textBounds(l),position=targetBox(l.box,l.position);drag={id:l.id,x:e.clientX,y:e.clientY,m:{...style(l)},bounds:b,position:{x:position[0],y:position[1]},scale:Number($('replacementStage').dataset.scale),direction:handle.dataset.direction};handle.setPointerCapture(e.pointerId);};
    handle.onpointermove=e=>{if(!drag||layer()?.id!==drag.id)return;const l=layer(),f=file(),d=drag.direction,b=drag.bounds;let dx=(e.clientX-drag.x)/drag.scale,dy=(e.clientY-drag.y)/drag.scale;guides=[];
      if($('magneticSnap').checked&&!e.altKey){const refs=[[0,0,f.width,f.height],...f.layers.filter(other=>other.id!==l.id&&!other.issues.includes('隐藏文字层')).map(other=>bound(f).includes(other)?textBounds(other):other.box)],x=b[0]+(d.includes('e')?b[2]:d.includes('w')?0:b[2]/2)+dx,y=b[1]+(d.includes('s')?b[3]:d.includes('n')?0:b[3]/2)+dy,snap=snapBox([x,y,0,0],refs,6/drag.scale,[d.includes('e')||d.includes('w'),d.includes('n')||d.includes('s')]);dx+=snap.offsets[0];dy+=snap.offsets[1];guides=snap.guides;}

      let rx=d.includes('e')?1+dx/b[2]:d.includes('w')?1-dx/b[2]:1,ry=d.includes('s')?1+dy/b[3]:d.includes('n')?1-dy/b[3]:1;
      const corner=d.length===2;let m={...drag.m};
      if(corner&&!e.shiftKey){const factor=Math.abs(rx-1)>Math.abs(ry-1)?rx:ry;rx=ry=Math.max(.1,Math.min(10,factor));m.size=Math.max(1,Math.min(2000,drag.m.size*rx));m.leading=Math.max(1,Math.min(4000,drag.m.leading*rx));rx=ry=m.size/drag.m.size;}
      else{if(e.shiftKey&&!corner){rx=ry=d==='e'||d==='w'?rx:ry;}m.stretchX=Math.max(10,Math.min(1000,(drag.m.stretchX??100)*rx));m.stretchY=Math.max(10,Math.min(1000,(drag.m.stretchY??100)*ry));rx=m.stretchX/(drag.m.stretchX??100);ry=m.stretchY/(drag.m.stretchY??100);}
      for(const k of ['size','leading','stretchX','stretchY'])if(m[k]!==undefined)m[k]=Math.round(m[k]*10)/10;
      const shiftX=d.includes('w')?b[2]*(1-rx):d==='n'||d==='s'?b[2]*(1-rx)/2:0,shiftY=d.includes('n')?b[3]*(1-ry):d==='e'||d==='w'?b[3]*(1-ry)/2:0;
      const align=l.alignment==='center'?.5:l.alignment==='right'?1:0;
      l.position=clampPosition(l.box,{x:drag.position.x+shiftX+align*b[2]*(rx-1),y:drag.position.y+shiftY},f.width,f.height);l.manual={...m,enabled:true};changed();};
    const finish=e=>{drag=null;guides=[];draw();if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);};handle.onpointerup=finish;handle.onpointercancel=finish;
  }
  window.addEventListener('pointerup',()=>{drag=null;moveDrag=null;});
  window.addEventListener('pointercancel',()=>{drag=null;moveDrag=null;});
  window.addEventListener('blur',()=>{drag=null;moveDrag=null;guides=[];draw();});
  $('replacementViewport').addEventListener('keydown',e=>{if(e.target!==$('replacementViewport')||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;const l=layer(),f=file();if(!l?.recordId||l.skipExport||l.issues.length)return;e.preventDefault();const step=e.shiftKey?10:1;moveGroup(starts(selected()),e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0);changed();});
  window.addEventListener('resize',draw);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(draw).observe($('replacementViewport'));
  const replacementNavigation=installPreviewNavigation($('replacementViewport'),$('replacementStage'),{getScale:()=>file()?Number($('replacementStage').dataset.scale)||0:0,setScale:scale=>{const base=replacementScale(file()?.width,$('replacementViewport').clientWidth,1);if(base===null)return;const value=scale/base;let custom=$('replacementCustomZoom');if(!custom){custom=document.createElement('option');custom.id='replacementCustomZoom';$('replacementZoom').append(custom);}custom.value=value;custom.textContent=Math.round(scale*100)+'%';restoreReplacementZoom($('replacementZoom'),value);draw();}});
  $('replacementViewport').addEventListener('pointerdown',e=>{if(e.button===0&&!replacementNavigation.isPanning()&&!e.target.closest('canvas,.transform-handle,.container-selection,#inlineTextEdit')&&e.target!==$('replacementSelection'))clearSelection();});
  $('replacementViewport').addEventListener('keydown',e=>{if(e.key==='Escape'&&!editing){e.preventDefault();clearSelection();}});
  $('centerReplacement').onclick=()=>replacementNavigation.centerCanvas();
  function focusSelection(){const l=layer();if(!l?.recordId||l.skipExport||l.issues.length)return;draw();const s=Number($('replacementStage').dataset.scale),b=targetBox(l.box,l.position);const v=$('replacementViewport');v.scrollTop+= $('replacementStage').getBoundingClientRect().top+b[1]*s-v.getBoundingClientRect().top-v.clientTop-v.clientHeight/3;}
  function baselineVisual(stage,baseline,requestedCrop){
    const f=file(),selectedLayer=layer();if(!f||f.demo||!baseline||baseline.fingerprint!==f.fingerprint)return {quality:'unavailable'};
    const original=baseline.layers.find(l=>l.id===selectedLayer?.id),current=selectedLayer?.recordId?textBounds(selectedLayer):null;
    const boxes=[original?.box,current,...(baseline.containers||[]).filter(c=>original&&c.box[0]<=original.box[0]&&c.box[1]<=original.box[1]&&c.box[0]+c.box[2]>=original.box[0]+original.box[2]&&c.box[1]+c.box[3]>=original.box[1]+original.box[3]&&c.box[2]*c.box[3]<f.width*f.height*.35).map(c=>c.box)].filter(Boolean);
    if(!boxes.length)boxes.push([0,0,f.width,f.height]);
    const left=requestedCrop?.[0]??Math.max(0,Math.min(...boxes.map(b=>b[0]))-48),top=requestedCrop?.[1]??Math.max(0,Math.min(...boxes.map(b=>b[1]))-48),right=requestedCrop?left+requestedCrop[2]:Math.min(f.width,Math.max(...boxes.map(b=>b[0]+b[2]))+48),bottom=requestedCrop?top+requestedCrop[3]:Math.min(f.height,Math.max(...boxes.map(b=>b[1]+b[3]))+48),width=right-left,height=bottom-top;
    if(width<=0||height<=0)return {quality:'unavailable'};
    const thumb=document.createElement('canvas'),s=Math.min(1,640/width,480/height);thumb.width=Math.max(1,Math.ceil(width*s));thumb.height=Math.max(1,Math.ceil(height*s));const ctx=thumb.getContext('2d');
    if(stage==='source'){
      const art=$('art');if(art.dataset.image!==f.preview||!art.width||!art.height)return {quality:'unavailable'};
      ctx.drawImage(art,left/f.width*art.width,top/f.height*art.height,width/f.width*art.width,height/f.height*art.height,0,0,thumb.width,thumb.height);
      return {quality:'original-source',dataURL:thumb.toDataURL('image/png'),crop:[left,top,width,height]};
    }
    // An already modified container background cannot stand in for the original
    // shapes. If the exact unmodified native background was never captured,
    // keep this visual unavailable instead of borrowing the final canvas.
    const k=key(baseline),url=backgrounds.get(k),img=url&&images.get(url);if(!img?.complete||!img.naturalWidth)return {quality:'unavailable'};
    ctx.scale(s,s);ctx.translate(-left,-top);ctx.drawImage(img,0,0,f.width,f.height);for(const l of bound(baseline))drawReplacementLayer(ctx,l,record(l.recordId));
    const revision=JSON.stringify(bound(baseline).map(l=>[l.id,l.recordId,l.box,l.manual,fitText(l,record(l.recordId))]));
    return {quality:'native-background',dataURL:thumb.toDataURL('image/png'),crop:[left,top,width,height],provenance:{backgroundKey:visualToken(k),expectedBackgroundKey:visualToken(k),renderRevision:visualToken(revision),expectedRenderRevision:visualToken(revision)}};
  }
  function visualToken(value){let n=2166136261;for(const ch of value)n=Math.imul(n^ch.charCodeAt(0),16777619);return (n>>>0).toString(16);}
  function visualSnapshot({thumbnail=true,stage='final',baseline,designReview=false,crop:requestedCrop}={}){
    if(stage==='source'||stage==='substituted')return baselineVisual(stage,baseline,requestedCrop);
    const f=file(),l=layer(),c=$('replacementArt'),url=f&&backgrounds.get(key(f)),img=url&&images.get(url);
    if(!f||f.demo||!url||!img?.complete||!img.naturalWidth||!c.width||!c.height||lastVisualSignature!==visualSignature(f))return {quality:'estimated'};
    if(!thumbnail)return {quality:'native-background'};
    if(designReview){
      const b=l?.recordId?textBounds(l):[0,0,f.width,f.height],height=Math.min(f.height,Math.max(f.width*1.4,b[3]+f.width*.5)),top=Math.max(0,Math.min(f.height-height,b[1]-f.width*.35)),crop=[0,top,f.width,height];
      const thumb=document.createElement('canvas'),s=Math.min(1,1280/f.width,1600/height);thumb.width=Math.max(1,Math.ceil(f.width*s));thumb.height=Math.max(1,Math.ceil(height*s));
      thumb.getContext('2d').drawImage(c,0,top/f.height*c.height,c.width,height/f.height*c.height,0,0,thumb.width,thumb.height);
      let dataURL=thumb.toDataURL('image/png');while(dataURL.length>1300000&&thumb.width>240){const smaller=document.createElement('canvas');smaller.width=Math.ceil(thumb.width*.75);smaller.height=Math.ceil(thumb.height*.75);smaller.getContext('2d').drawImage(thumb,0,0,smaller.width,smaller.height);thumb.width=smaller.width;thumb.height=smaller.height;thumb.getContext('2d').drawImage(smaller,0,0);dataURL=thumb.toDataURL('image/png');}
      const bg=visualToken(key(f)),revision=visualToken(visualSignature(f));
      return {quality:'native-background',dataURL,crop,provenance:{backgroundKey:bg,expectedBackgroundKey:bg,renderRevision:revision,expectedRenderRevision:revision}};
    }
    // Only encode a small crop after a completed gesture, never during drag.
    const b=l?.recordId?textBounds(l):[0,0,f.width,f.height],shape=containerEdits(f).find(e=>e.textLayerId===l?.id)?.box;
    const boxes=shape?[b,shape]:[b],left=requestedCrop?.[0]??Math.max(0,Math.min(...boxes.map(b=>b[0]))-48),top=requestedCrop?.[1]??Math.max(0,Math.min(...boxes.map(b=>b[1]))-48),right=requestedCrop?left+requestedCrop[2]:Math.min(f.width,Math.max(...boxes.map(b=>b[0]+b[2]))+48),bottom=requestedCrop?top+requestedCrop[3]:Math.min(f.height,Math.max(...boxes.map(b=>b[1]+b[3]))+48);
    const width=right-left,height=bottom-top;if(width<=0||height<=0)return {quality:'estimated'};
    const thumb=document.createElement('canvas'),s=Math.min(1,640/width,480/height);thumb.width=Math.max(1,Math.ceil(width*s));thumb.height=Math.max(1,Math.ceil(height*s));
    thumb.getContext('2d').drawImage(c,left/f.width*c.width,top/f.height*c.height,width/f.width*c.width,height/f.height*c.height,0,0,thumb.width,thumb.height);
    const bg=visualToken(key(f)),revision=visualToken(JSON.stringify(bound(f).map(l=>[l.id,l.recordId,l.customText,l.box,l.position,l.manual,l.capitalization,style(l),fitText(l,record(l.recordId))])));
    return {quality:'native-background',dataURL:thumb.toDataURL('image/png'),provenance:{backgroundKey:bg,expectedBackgroundKey:bg,renderRevision:revision,expectedRenderRevision:revision},crop:[left,top,width,height]};
  }
  function resetImportedPreview(){previewEpoch++;clearTimeout(timer);backgrounds.clear();backgroundJobs.clear();lastBackgrounds.clear();images.clear();failures.clear();lastVisualSignature='';drag=null;moveDrag=null;guides=[];closeTextEditor();const c=$('replacementArt');c.getContext('2d').clearRect(0,0,c.width,c.height);}
  function designVisuals({file:working=file(),layer:target=layer(),scope='current',crop:requestedCrop,sourceOnly=false}={}){
    const f=file();if(!f||f.demo||working?.fingerprint!==f.fingerprint)return [];
    // Original artwork is readable before copy binding and without a selected text layer.
    // Source boxes only choose the crop; replacement placement still uses visible glyphs.
    let height=f.height,top=0;
    if(scope!=='full'&&target){const source=target.sourceBox||working.learningSource?.layers?.find(l=>l.id===target.id)?.box||target.box,current=target.recordId?textBounds(target):source,topEdge=Math.min(source[1],current[1]),bottomEdge=Math.max(source[1]+source[3],current[1]+current[3]);height=Math.min(f.height,Math.max(f.width*1.4,bottomEdge-topEdge+f.width*.5));top=Math.max(0,Math.min(f.height-height,topEdge-f.width*.25));}
    let left=0,width=f.width;if(requestedCrop){if(!Array.isArray(requestedCrop)||requestedCrop.length!==4||!requestedCrop.every(Number.isFinite)||requestedCrop[0]<0||requestedCrop[1]<0||requestedCrop[2]<=0||requestedCrop[3]<=0||requestedCrop[0]+requestedCrop[2]>f.width+.01||requestedCrop[1]+requestedCrop[3]>f.height+.01)throw Error('排版预览范围无效');[left,top,width,height]=requestedCrop;}const crop=[left,top,width,height],visuals=[];
    const make=()=>{const c=document.createElement('canvas'),s=Math.min(1,1280/width,1600/height);c.width=Math.max(1,Math.ceil(width*s));c.height=Math.max(1,Math.ceil(height*s));return c;};
    const encode=c=>{let url=c.toDataURL('image/png');while(url.length>1300000&&c.width>200){const small=document.createElement('canvas');small.width=Math.ceil(c.width*.75);small.height=Math.ceil(c.height*.75);small.getContext('2d').drawImage(c,0,0,small.width,small.height);c.width=small.width;c.height=small.height;c.getContext('2d').drawImage(small,0,0);url=c.toDataURL('image/png');}return url;};
    const art=$('art'),sourceImage=art.dataset.image===f.preview?art:images.get(f.preview),sourceWidth=sourceImage?.naturalWidth||sourceImage?.width,sourceHeight=sourceImage?.naturalHeight||sourceImage?.height;if(sourceWidth&&sourceHeight){const c=make();c.getContext('2d').drawImage(sourceImage,left/f.width*sourceWidth,top/f.height*sourceHeight,width/f.width*sourceWidth,height/f.height*sourceHeight,0,0,c.width,c.height);visuals.push({stage:'source',quality:'original-source',crop:[...crop],dataURL:encode(c)});}
    if(sourceOnly)return visuals;
    const k=key(working),url=backgrounds.get(k),img=url&&images.get(url);
    if(img?.complete&&img.naturalWidth){const c=make(),ctx=c.getContext('2d');ctx.scale(c.width/width,c.height/height);ctx.translate(-left,-top);ctx.drawImage(img,0,0,f.width,f.height);for(const l of bound(working))drawReplacementLayer(ctx,l,record(l.recordId));const bg=visualToken(k),rev=visualToken(visualSignature(working));visuals.push({stage:'current',quality:'native-background',crop:[...crop],dataURL:encode(c),provenance:{backgroundKey:bg,expectedBackgroundKey:bg,renderRevision:rev,expectedRenderRevision:rev}});}
    return visuals;
  }
  return {sync,update,draw,focusSelection,visualSnapshot,designVisuals,readyDesignVisuals,setSelection,clearSelection,getSelection,resetImportedPreview,cacheBackground};
}
