const fs = require('node:fs/promises');
const {photoshopTextObjects}=require('./native-text-objects.cjs');
const path = require('node:path');
const {helper}=require('./services/authorization.cjs');
const {containerScript}=require('./container-edit.cjs');
const {extractionScript}=require('./container-extraction.cjs');
function decodeBridgeOutput(chunks){return Buffer.concat(chunks).toString('utf16le').replace(/^\uFEFF/,'').trim();}
async function preparePhotoshop(helperPath){
  if(!helperPath)return;
  await helper(helperPath,{op:'prepare-photoshop'});
}
async function executeScript(directory, source) {
  await fs.mkdir(directory,{recursive:true});
  const jsx=path.join(directory,'preview.jsx');
  await fs.writeFile(jsx,'\uFEFF'+source,'utf8');
  const helperCandidates=[path.join(__dirname,'photoshop-bridge.exe'),path.join(__dirname,'services/bin/psd-lingo-service.exe'),path.join(__dirname,'../psd-lingo-service.exe')];
  let bridge;for(const candidate of helperCandidates){try{await fs.access(candidate);bridge=candidate;break;}catch{}}
  const diagnostic=path.join(directory,'bridge-status.json');
  await fs.writeFile(diagnostic,JSON.stringify({transport:'native-com',state:'starting',at:new Date().toISOString()}));
  if(!bridge)throw Error('Photoshop 原生调用组件缺失，请重新安装软件');
  try{const reply=await helper(bridge,{op:'photoshop-script',path:jsx},{timeoutMs:0});if(reply.completed!==true)throw require('./services/native-receipt.cjs').missingReceipt('调用组件未确认脚本执行结果');await fs.writeFile(diagnostic,JSON.stringify({transport:'native-com',state:'completed',at:new Date().toISOString()}));}
  catch(error){if(/Photoshop script failed:/i.test(error.message)&&!error.uncertain)error=require('./services/native-receipt.cjs').missingReceipt(error);await fs.writeFile(diagnostic,JSON.stringify({transport:'native-com',state:'failed',error:error.message,uncertain:!!error.uncertain,at:new Date().toISOString()}));throw Object.assign(Error('Photoshop 调用失败：'+error.message),require('./services/operation-error.cjs').errorDetails(error),error.code?{code:error.code}:{});}

}
function backgroundScript(input, ids, output, options={}) {
  return `#target photoshop
(function(){
var source=null,copy=null,opened=false,stage="读取源 PSD",failure=null,dialogs=app.displayDialogs;app.displayDialogs=DialogModes.NO;
function find(c,id){for(var i=0;i<c.layers.length;i++){var l=c.layers[i];if(l.id===id)return l;if(l.typename==="LayerSet"){var v=find(l,id);if(v)return v;}}return null;}
function findLayer(doc,id){return find(doc,id);}
${photoshopTextObjects}
${require('./typography-native.cjs').psTypographyNative}
${containerScript}
${extractionScript}
try{
var file=new File(${JSON.stringify(input)}),ids=${JSON.stringify(ids)};
for(var i=0;i<app.documents.length;i++){try{if(app.documents[i].fullName.fsName.toLowerCase()===file.fsName.toLowerCase())source=app.documents[i];}catch(e){}}
if(source&&!source.saved)throw new Error("源 PSD 有未保存改动，请先保存并重新导入");
if(!source){source=app.open(file);opened=true;}
stage="创建预览副本";copy=source.duplicate("PSD Lingo preview",false);app.activeDocument=copy;
stage="拆分底部容器";var nativeEdits=materializeExtracted(copy,${JSON.stringify(options.extractedContainers||[])},${JSON.stringify(options.containerEdits||[])});stage="调整底部容器";applyContainers(copy,nativeEdits);
nativeTextActions(copy,${JSON.stringify(options.textActions||[])});nativeTypographyEdits(copy,${JSON.stringify(options.typographyEdits||[])});
stage="隐藏绑定原文";
for(var i=0;i<ids.length;i++){if(ids[i]<0)continue;var l=find(copy,ids[i]);if(!l||l.kind!==LayerKind.TEXT)throw new Error("预览文字层 ID 不匹配");l.visible=false;}
${options.scalePreview?'stage="缩小显示预览";var w=copy.width.as("px"),h=copy.height.as("px"),scale=Math.min(1,16384/w,16384/h,Math.sqrt(6000000/(w*h)));if(scale<1)copy.resizeImage(UnitValue(Math.max(1,Math.floor(w*scale)),"px"),UnitValue(Math.max(1,Math.floor(h*scale)),"px"),null,ResampleMethod.BICUBIC);':''}
stage="保存预览背景";copy.saveAs(new File(${JSON.stringify(output)}),new PNGSaveOptions(),true,Extension.LOWERCASE);
}catch(e){failure=new Error(stage+"失败："+e.message);}finally{try{if(copy)copy.close(SaveOptions.DONOTSAVECHANGES);}catch(closeError){}try{if(opened&&source)source.close(SaveOptions.DONOTSAVECHANGES);}catch(closeSourceError){}app.displayDialogs=dialogs;}
if(failure)throw failure;
})();`;
}
async function createBackground(directory,input,ids,options={}){
  const helperPath=options.helperPath||path.join(__dirname,'services/bin/psd-lingo-service.exe');
  await preparePhotoshop(helperPath);
  const png=path.join(directory,'background.png');
  await executeScript(directory,backgroundScript(input,ids,png.replace(/\\/g,'/'),{textActions:options.textActions,scalePreview:options.scalePreview!==false,containerEdits:options.containerEdits,extractedContainers:options.extractedContainers}));
  return 'data:image/png;base64,'+(await fs.readFile(png)).toString('base64');
}
async function installedFonts(directory){
  const output=path.join(directory,'fonts.txt');
  await executeScript(directory,`#target photoshop\n(function(){var file=new File(${JSON.stringify(output.replace(/\\/g,'/'))});file.encoding="UTF8";file.open("w");for(var i=0;i<app.fonts.length;i++){var f=app.fonts[i];file.writeln(encodeURIComponent(f.postScriptName)+"\\t"+encodeURIComponent(f.family)+"\\t"+encodeURIComponent(f.style));}file.close();})();`);
  return (await fs.readFile(output,'utf8')).replace(/^\uFEFF/,'').split(/\r?\n/).filter(Boolean).map(line=>{const [name,family,style]=line.split('\t').map(decodeURIComponent);return {name,family,style};});
}
module.exports={createBackground,installedFonts,backgroundScript,decodeBridgeOutput,executeScript,preparePhotoshop};
