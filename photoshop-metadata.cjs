// Large PSB metadata is read by Photoshop, never by allocating the source file.
const fs = require('node:fs/promises');
const path = require('node:path');
const {extractLayers,extractContainers} = require('./metadata.cjs');
const {executeScript,preparePhotoshop} = require('./photoshop-preview.cjs');

function number(value, fallback) {
  const n = typeof value === 'object' && value ? value.value : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}
function pixels(value, resolution, fallback) {
  const n = number(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  return value?.unit === 'pointsUnit' ? n * resolution / 72 : n;
}
function stable(value) {
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
function normalizeNativeMetadata(raw) {
  if (!raw || !Number.isFinite(raw.width) || !Number.isFinite(raw.height) || raw.width <= 0 || raw.height <= 0 || !Array.isArray(raw.children)) throw new Error('Photoshop 返回的文档元数据无效');
  const resolution = number(raw.resolution,72);
  if (resolution <= 0) throw new Error('Photoshop 文档分辨率无效');
  const extraIssues = new Map();
  function nodes(children, inheritedIssues=[]) {
    return children.map(layer => {
      const failures=[...inheritedIssues,...(layer.readFailure?[layer.readFailure]:[])];
      const d = layer.descriptor || {}, node = {id:layer.id,name:layer.name,hidden:layer.hidden,protected:{all:layer.locked},children:layer.children?nodes(layer.children,failures):undefined};
      if (!layer.isText){
        const b=layer.bounds||[];[node.left,node.top,node.right,node.bottom]=b;
        node.containerKind=layer.kind;node.clipping=!!layer.clipping;
        node.containerUnsafe=!!layer.containerUnsafe;node.containerShape=layer.containerShape;
        return node;
      }
      const issues = failures.map(f=>`原生图层读取不完整（${f.stage}）：${f.error}`), t = d.textKey || {}, shape = t.textShape?.[0], transform = t.transform || shape?.transform;
      if(!d.textKey)issues.push('无法读取完整文字描述，暂不支持自动导出');
      const styles = t.textStyleRange || [], first = styles.find(s=>number(s.to,0)>number(s.from,0))?.textStyle || t.textStyle || {};
      const base = {...(t.textStyle||{}),...first};
      const rawText = typeof t.textKey === 'string' ? t.textKey : layer.dom?.text;
      if(typeof rawText!=='string')issues.push('无法读取文字内容');
      const content = typeof rawText === 'string' ? rawText : '';
      if(!Array.isArray(styles)||!styles.length)issues.push('缺少完整文字样式范围，暂不支持自动导出');
      const font = base.fontPostScriptName || layer.dom?.font || '';
      if(base.fontPostScriptName && layer.dom?.font && base.fontPostScriptName!==layer.dom.font)issues.push('原字体不可用或已被 Photoshop 替换');
      function style(s) {
        const merged={...base,...s}, fontSize=pixels(merged.size,resolution,undefined);
        return {font:{name:merged.fontPostScriptName||font},fontSize,tracking:number(merged.tracking,0),leading:merged.autoLeading===false?pixels(merged.leading,resolution,undefined):fontSize*number(merged.autoLeadingPercentage,1.2),fillColor:merged.color?{r:number(merged.color.red,0),g:number(merged.color.green,number(merged.color.grain,0)),b:number(merged.color.blue,0)}:undefined,nativeStyleSignature:JSON.stringify(stable(merged))};
      }
      const tr=transform?[number(transform.xx,NaN),number(transform.xy,NaN),number(transform.yx,NaN),number(transform.yy,NaN),number(transform.tx,NaN),number(transform.ty,NaN)]:null;
      if(!tr)issues.push('缺少文字变换元数据，暂不支持自动导出');
      const shapeType=shape?.char==='paint'||shape?.char==='point'||shape?.textType==='point'?'point':'box';
      if(t.textShape?.length!==1)issues.push('多重或未知文字路径暂不支持');
      const orientation=t.orientation==='vertical'?'vertical':t.orientation==='horizontal'?'horizontal':null;
      if(!orientation)issues.push('未知文字方向暂不支持');
      const paragraph=t.paragraphStyleRange?.[0]?.paragraphStyle || t.paragraphStyle || {};
      const align=paragraph.align || paragraph.justification || 'left';
      const hasPath=!!(t.textPath||shape?.path||shape?.pathData||shape?.bezierCurve||shape?.frameMatrix);
      const warp=t.warp||d.warp;
      if(!warp||typeof warp.warpStyle!=='string')issues.push('缺少文字变形状态，暂不支持自动导出');
      node.text={text:content,style:style(base),styleRuns:styles.map(r=>({length:Math.max(0,Math.min(content.length,number(r.to,0))-number(r.from,0)),style:style(r.textStyle||{})})),transform:tr||[NaN,0,0,NaN,0,0],shapeType,orientation,paragraphStyle:{justification:['left','center','right'].includes(align)?align:'left'},warp:{style:warp?.warpStyle==='warpNone'?'none':warp?.warpStyle||'unknown'},textPath:hasPath?{data:{frameMatrix:[1]}}:undefined};
      const b=layer.bounds||[];[node.left,node.top,node.right,node.bottom]=b;
      node.clipping=!!(d.group||layer.clipping);
      node.mask=!!d.hasUserMask;node.vectorMask=!!d.hasVectorMask;node.realMask=!!d.hasFilterMask;
      if(!Array.isArray(layer.bounds)||layer.bounds.length!==4||layer.bounds.some(n=>!Number.isFinite(n)))issues.push('无法读取文字可见边界');
      extraIssues.set(layer.id,issues);
      return node;
    });
  }
  const tree={children:nodes(raw.children),topFirst:true},layers=extractLayers(tree),containers=extractContainers(tree);
  for(const layer of layers){layer.issues.push(...(extraIssues.get(layer.id)||[]));layer.supported=layer.issues.length===0;}
  const artboards=[],locations=new Map();
  function locate(children,route=[],board=null){for(let i=0;i<children.length;i++){const l=children[i],p=[...route,i],current=l.artboard?{id:l.id,name:l.name,box:l.artboard,nativePath:p}:board;if(l.artboard)artboards.push(current);locations.set(l.id,{nativePath:p,...(current?{boardBox:[...current.box],boardNames:[current.name],boardId:current.id}:{})});if(l.children)locate(l.children,p,current);}}
  locate(raw.children);for(const l of layers)Object.assign(l,locations.get(l.id));
  function styles(children){for(const n of children){const l=layers.find(l=>l.id===n.id);if(l)l.mixedStyleRuns=(n.descriptor?.textKey?.textStyleRange||[]).map(r=>({from:number(r.from,0),to:number(r.to,0),font:r.textStyle?.fontPostScriptName,size:pixels(r.textStyle?.size,resolution,undefined),signature:JSON.stringify(stable(r.textStyle))}));if(n.children)styles(n.children);}}styles(raw.children);
  function diagnostics(children){for(const n of children){const l=layers.find(l=>l.id===n.id);if(l){if(n.readFailure)l.metadataReadFailure=n.readFailure;if(n.readWarnings?.length)l.metadataReadWarnings=n.readWarnings;}if(n.children)diagnostics(n.children);}}diagnostics(raw.children);
  return {width:raw.width,height:raw.height,bitsPerChannel:raw.bitsPerChannel,colorMode:raw.colorMode,layers,containers,artboards,nativeHost:raw.nativeHost};
}

function metadataScript(input,output) {
  return String.raw`#target photoshop
(function(){
var source=null,opened=false,previous=null,dialogs=app.displayDialogs,failure=null,stage='打开原稿';
try{previous=app.activeDocument;}catch(_){}
function key(id){var name='';try{name=typeIDToStringID(id);}catch(_){}if(name)return name;try{return typeIDToCharID(id);}catch(_){return String(id);}}
function descriptor(d){var o={},i,k,t;for(i=0;i<d.count;i++){k=d.getKey(i);t=d.getType(k);o[key(k)]=value(d,k,t);}return o;}
function list(d){var a=[],i;for(i=0;i<d.count;i++)a.push(value(d,i,d.getType(i)));return a;}
function value(d,k,t){if(t===DescValueType.BOOLEANTYPE)return d.getBoolean(k);if(t===DescValueType.STRINGTYPE)return d.getString(k);if(t===DescValueType.INTEGERTYPE)return d.getInteger(k);if(t===DescValueType.DOUBLETYPE)return d.getDouble(k);if(t===DescValueType.UNITDOUBLE)return {value:d.getUnitDoubleValue(k),unit:key(d.getUnitDoubleType(k))};if(t===DescValueType.ENUMERATEDTYPE)return key(d.getEnumerationValue(k));if(t===DescValueType.OBJECTTYPE)return descriptor(d.getObjectValue(k));if(t===DescValueType.LISTTYPE)return list(d.getList(k));return null;}
function encode(v){if(v===null||typeof v==='undefined')return 'null';if(typeof v==='string')return '"'+v.replace(/[\\"\x00-\x1f\u2028\u2029]/g,function(c){return '\\u'+('0000'+c.charCodeAt(0).toString(16)).slice(-4);})+'"';if(typeof v==='number')return isFinite(v)?String(v):'null';if(typeof v==='boolean')return String(v);var a=[],k;if(v instanceof Array){for(k=0;k<v.length;k++)a.push(encode(v[k]));return '['+a.join(',')+']';}for(k in v)if(v.hasOwnProperty(k))a.push(encode(k)+':'+encode(v[k]));return '{'+a.join(',')+'}';}
function nativeLocked(d,fallback){var k=stringIDToTypeID('layerLocking');if(!d.hasKey(k))return fallback;var a=d.getObjectValue(k),keys=['protectAll','protectComposite','protectPosition','protectTransparency'];for(var i=0;i<keys.length;i++){var id=stringIDToTypeID(keys[i]);if(a.hasKey(id)&&a.getBoolean(id))return true;}return false;}
function hasContainerStroke(d){if(!d.hasKey(stringIDToTypeID('strokeStyle')))return false;var s=d.getObjectValue(stringIDToTypeID('strokeStyle'));return s.hasKey(stringIDToTypeID('strokeEnabled'))&&s.getBoolean(stringIDToTypeID('strokeEnabled'));}
function liveShape(d){var v=stringIDToTypeID('keyDescriptorList'),origin=stringIDToTypeID('vectorOrigination');if(d.hasKey(origin))return descriptor(d.getObjectValue(origin));if(d.hasKey(v)){var r={};r.keyDescriptorList=list(d.getList(v));return r;}return null;}
function issue(e,phase){return {stage:phase,error:String(e.message||e),number:e.number||0};}
function readBounds(l,n){try{var b=l.bounds;n.bounds=[b[0].as('px'),b[1].as('px'),b[2].as('px'),b[3].as('px')];}catch(e){n.readWarnings.push(issue(e,'文字可见边界'));}}
function walk(container){
 var result=[],i,l,n,r,d,ti,phase;
 for(i=0;i<container.layers.length;i++){
  l=container.layers[i];n={isText:false,readWarnings:[]};phase='图层身份';
  try{
   n.id=l.id;n.name=l.name;n.hidden=!l.visible;n.locked=false;
   try{n.locked=l.allLocked||l.positionLocked||l.pixelsLocked||l.transparentPixelsLocked;}catch(_){}
   if(l.typename==='LayerSet'){
    n.children=walk(l);phase='分组描述';r=new ActionReference();r.putIdentifier(stringIDToTypeID('layer'),l.id);d=executeActionGet(r);n.locked=nativeLocked(d,n.locked);
    if(d.hasKey(stringIDToTypeID('artboard'))){var ar=d.getObjectValue(stringIDToTypeID('artboard')).getObjectValue(stringIDToTypeID('artboardRect'));function av(k){var id=stringIDToTypeID(k);return ar.getType(id)===DescValueType.UNITDOUBLE?ar.getUnitDoubleValue(id):ar.getDouble(id);}n.artboard=[av('left'),av('top'),av('right')-av('left'),av('bottom')-av('top')];}
    n.containerUnsafe=(d.hasKey(stringIDToTypeID('hasUserMask'))&&d.getBoolean(stringIDToTypeID('hasUserMask')))||(d.hasKey(stringIDToTypeID('hasVectorMask'))&&d.getBoolean(stringIDToTypeID('hasVectorMask')))||(d.hasKey(stringIDToTypeID('hasFilterMask'))&&d.getBoolean(stringIDToTypeID('hasFilterMask')))||d.hasKey(stringIDToTypeID('layerEffects'));
   }else{
    phase='图层类型';var kind=l.kind;
    if(kind===LayerKind.TEXT){
     n.isText=true;phase='原生文字描述';
     try{r=new ActionReference();r.putIdentifier(stringIDToTypeID('layer'),l.id);d=executeActionGet(r);n.locked=nativeLocked(d,n.locked);n.descriptor=descriptor(d);}catch(e){n.readFailure=issue(e,phase);}
     readBounds(l,n);n.dom={};
     // Optional DOM getters can reject a TEXT-kind layer even when its native descriptor is valid.
     try{ti=l.textItem;}catch(e){ti=null;n.readWarnings.push(issue(e,'文字 DOM'));}
     if(ti){try{n.dom.text=ti.contents;}catch(e){n.readWarnings.push(issue(e,'文字 DOM 内容'));}try{n.dom.font=ti.font;}catch(e){n.readWarnings.push(issue(e,'文字 DOM 字体'));}}
    }else if(kind===LayerKind.SOLIDFILL){
     n.kind='shape';phase='形状描述';readBounds(l,n);r=new ActionReference();r.putIdentifier(stringIDToTypeID('layer'),l.id);d=executeActionGet(r);n.locked=nativeLocked(d,n.locked);n.containerShape=liveShape(d);
     n.containerUnsafe=hasContainerStroke(d)||!d.hasKey(stringIDToTypeID('hasVectorMask'))||!d.getBoolean(stringIDToTypeID('hasVectorMask'))||(d.hasKey(stringIDToTypeID('hasUserMask'))&&d.getBoolean(stringIDToTypeID('hasUserMask')))||(d.hasKey(stringIDToTypeID('hasFilterMask'))&&d.getBoolean(stringIDToTypeID('hasFilterMask')))||d.hasKey(stringIDToTypeID('layerEffects'));
    }
   }
   try{n.clipping=l.grouped;}catch(_){}
  }catch(e){n.readFailure=issue(e,phase);n.containerUnsafe=true;if(!n.children&&!n.kind)n.isText=true;}
  result.push(n);
 }
 return result;
}
try{
app.displayDialogs=DialogModes.NO;var file=new File(${JSON.stringify(input)});if(!file.exists)throw new Error('原 PSD／PSB 不存在');
for(var i=0;i<app.documents.length;i++){try{if(app.documents[i].fullName.fsName.toLowerCase()===file.fsName.toLowerCase())source=app.documents[i];}catch(_){}}
if(source&&!source.saved)throw new Error('原 PSD／PSB 在 Photoshop 中有未保存改动，请先保存并重新导入');
if(!source){source=app.open(file);opened=true;}app.activeDocument=source;
// Use explicit branches: nested ternaries in ExtendScript can misread 8-bit documents.
var bits=32;if(source.bitsPerChannel===BitsPerChannelType.EIGHT){bits=8;}else if(source.bitsPerChannel===BitsPerChannelType.SIXTEEN){bits=16;}
stage='文档尺寸';var data={width:source.width.as('px'),height:source.height.as('px'),resolution:source.resolution,bitsPerChannel:bits,colorMode:source.mode===DocumentMode.RGB?3:-1,nativeHost:{application:'Photoshop',version:String(app.version||'')},children:[]};stage='读取图层';data.children=walk(source);
 }catch(e){failure=issue(e,stage);}finally{if(opened&&source){try{source.close(SaveOptions.DONOTSAVECHANGES);}catch(_){}}if(previous){try{app.activeDocument=previous;}catch(_){}}app.displayDialogs=dialogs;}
// Complete read-only failures have a receipt; interrupted scripts still use the bridge safety guard.
var output=new File(${JSON.stringify(output)});output.encoding='UTF8';if(!output.open('w'))throw new Error('无法保存文字层元数据');try{if(output.write(encode(failure?{readFailure:failure}:data))===false)throw new Error('文字层元数据写入失败');}finally{output.close();}
})();`;
}
async function readPhotoshopMetadata(directory,input,{helperPath,prepare=preparePhotoshop,execute=executeScript}={}) {
  const before=await fs.stat(input);
  if(!before.isFile())throw new Error('原 PSD／PSB 路径不是文件');
  await fs.mkdir(directory,{recursive:true});
  const output=path.join(directory,'metadata.json');
  await fs.rm(output,{force:true});
  await prepare(helperPath||path.join(__dirname,'services/bin/psd-lingo-service.exe'));
  await execute(directory,metadataScript(input.replace(/\\/g,'/'),output.replace(/\\/g,'/')));
  const after=await fs.stat(input);
  if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ino!==after.ino)throw new Error('读取期间原 PSD／PSB 已改变，请重新导入');
  const raw=JSON.parse((await fs.readFile(output,'utf8')).replace(/^\uFEFF/,''));
  if(raw.readFailure)throw Object.assign(new Error('Photoshop 读取失败（'+raw.readFailure.stage+'）：'+raw.readFailure.error),{phase:raw.readFailure.stage,code:'PHOTOSHOP_METADATA_READ_FAILED',uncertain:false});
  return normalizeNativeMetadata(raw);
}
module.exports={readPhotoshopMetadata,metadataScript,normalizeNativeMetadata};
