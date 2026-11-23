// Font identity is a real PostScript face, never a synthetic weight number.
function validateTypography(v){
 if(!v||typeof v.font!=='string'||!v.font.trim()||v.font.length>200||/[\r\n\0]/.test(v.font)||Object.keys(v).some(k=>!['font','tracking','sizeScale'].includes(k)))throw Error('请选择实际字体款式，字号使用相对原字号的比例');
 if(v.tracking!==undefined&&(!Number.isInteger(v.tracking)||v.tracking< -1000||v.tracking>10000))throw Error('字间距无效（单位为1/1000 em）');
 if(v.sizeScale!==undefined&&(!Number.isFinite(v.sizeScale)||v.sizeScale<=0||v.sizeScale>20))throw Error('字号比例无效');
 return {font:v.font,...(v.tracking!==undefined?{tracking:v.tracking}:{}),...(v.sizeScale!==undefined?{sizeScale:v.sizeScale}:{})};
}
function typographyEditsFor(file){return (file.layers||[]).filter(l=>l.typography&&!l.nativeDisposition&&l.visible!==false&&!l.skipExport).map(l=>({layerId:l.id,original:l.original,font:l.font,...(file.mixedTextEdits?.some(e=>e.layerId===l.id)?{target:file.mixedTextEdits.find(e=>e.layerId===l.id).target}:{}),typography:validateTypography(l.typography)}));}
function validateTypographyEdits(edits=[]){if(!Array.isArray(edits)||new Set(edits.map(e=>e.layerId)).size!==edits.length)throw Error('字体修改列表无效或重复');for(const e of edits){if(!Number.isInteger(e.layerId)||e.layerId<1||typeof e.original!=='string'||typeof e.font!=='string'||e.target!==undefined&&typeof e.target!=='string')throw Error('字体修改来源无效');validateTypography(e.typography);}return edits;}
function planTypography(file,args,catalog){
 for(const k of ['autoSize','autoTracking','autoWeight'])if(args[k]!==undefined&&typeof args[k]!=='boolean')throw Error('自动适配选项必须为勾选或取消');
 const base=validateTypography({font:args.font,...(args.tracking!==undefined?{tracking:args.tracking}:{})});
 const selected=catalog.find(f=>f.name===base.font);if(!selected)throw Error('当前 Adobe 中未找到该字体，请刷新字体列表');
 const requested=args.overrides||[];if(!Array.isArray(requested)||requested.some(o=>!o||Object.keys(o).some(k=>!['layerId','sizeScale','tracking','font','reason'].includes(k)))||new Set(requested.map(o=>o.layerId)).size!==requested.length||requested.some(o=>!file.layers.some(l=>l.id===o.layerId)))throw Error('逐对象字体调整无效或来源已变化');
 const settings={font:base.font,tracking:base.tracking,autoSize:!!args.autoSize,autoTracking:!!args.autoTracking,autoWeight:!!args.autoWeight};
 const overrides=JSON.stringify(file.typographySettings)===JSON.stringify(settings)?[...(file.typographyAdjustments||[]).filter(o=>!requested.some(n=>n.layerId===o.layerId)),...requested]:requested;
 const edits=[],skipped=[];
 for(const l of file.layers){
  if(!l.original?.trim()||l.visible===false||l.skipExport||l.nativeDisposition)continue;
  if(l.nativeCreation||l.supported===false&&!l.mixedStyleRuns?.length||l.issues?.some(i=>!/混合.*样式/.test(i))){skipped.push({layerId:l.id,name:l.name,reason:l.issues?.join('；')||'没有可安全编辑的文字'});continue;}
  const o=overrides.find(o=>o.layerId===l.id);if(o&&(!args.autoSize&&o.sizeScale!==undefined||!args.autoTracking&&o.tracking!==undefined||!args.autoWeight&&o.font!==undefined))throw Error('AI 调整了未授权的字体参数');
  if(o&&(typeof o.reason!=='string'||!o.reason.trim()))throw Error('逐对象调整需说明视觉依据');
  const typography=validateTypography({...base,...(o?.font?{font:o.font}:{}),...(o?.sizeScale!==undefined?{sizeScale:o.sizeScale}:{}),...(o?.tracking!==undefined?{tracking:o.tracking}:{})});
  const face=catalog.find(f=>f.name===typography.font);if(!face||face.family!==selected.family)throw Error('字重必须使用所选字体家族内的实际款式');
  edits.push({layerId:l.id,typography});
 }
 if(!edits.length)throw Error('没有可修改字体的文字；转曲和像素文字不会冒充可编辑文字');
 return {edits,skipped,settings,adjustments:overrides,visualAcceptance:'待实际图片对照；数值检查不代表视觉通过'};
}
module.exports={validateTypography,typographyEditsFor,validateTypographyEdits,planTypography};
