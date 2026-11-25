const {validateTypographyEdits}=require('./services/typography.cjs');
const crypto = require('node:crypto');
const {validateMixedEdits}=require('./mixed-text.cjs');
const {validateCreation,validateTextActions,photoshopTextObjects}=require('./native-text-objects.cjs');
const {validateArtworkHides}=require('./artwork-visibility.cjs');
const {canonicalText,insertBreaks,manualStyleIssues}=require('./layout.cjs');
const photoshopFit = require('./photoshop-fit.cjs');
const {validateContainerEdits,containerScript}=require('./container-edit.cjs');
const {validateExtractedContainers,extractedMetadata,extractionScript}=require('./container-extraction.cjs');

function hash(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function parseCsv(input) {
  const rows = []; let row = [], cell = '', quoted = false;
  input = input.replace(/^\uFEFF/, '');
  const delimiter = input.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ',';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell.length) cell += ch;
      else quoted = !quoted;
    } else if (!quoted && ch === delimiter) { row.push(cell); cell = ''; }
    else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); if (row.some(s => s.trim())) rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号，请检查文档。');
  row.push(cell); if (row.some(s => s.trim())) rows.push(row);
  return rows;
}
function recordsFromRows(rows, source) {
  if (!rows.length) return [];
  const aliases = {
    id: ['id', '编号', '文案编号', 'key'],
    original: ['原文', '原文字', 'source', 'original', '中文', '用途说明'],
    target: ['目标文案', '目标语言', '译文', 'target', 'translation', '文案', '英文', 'english', '日文']
  };
  const header = rows[0].map(x => String(x).trim().toLowerCase());
  const col = {}; for (const [k, list] of Object.entries(aliases)) col[k] = header.findIndex(x => list.includes(x));
  const hasHeader = col.target >= 0;
  if (!hasHeader) throw new Error('表格需包含“目标文案”列，可同时包含“编号”和“原文”列。多语言请分别导入。');
  return rows.slice(1).filter(r => r[col.target] !== undefined && r[col.target] !== '').map((r, i) => ({
    id: `${source}:${i + 2}`,
    key: col.id >= 0 ? r[col.id] || String(i + 1) : String(i + 1),
    original: col.original >= 0 ? r[col.original] || '' : '',
    target: r[col.target], source: `${source} · 第 ${i + 2} 行`,
    digest: hash(r[col.target])
  }));
}
function recordsFromText(text, source, mode = 'line') {
  if (typeof text !== 'string') throw new Error('文档文本无效');
  if (!['line', 'paragraph'].includes(mode)) throw new Error('无效的文案拆分方式');
  text = text.replace(/^\uFEFF/, '');
  const separator = mode === 'line' ? /\r\n|[\r\n\u2028\u2029]/g : /\r?\n[ \t]*\r?\n|\r[ \t]*\r/g;
  const records = []; let offset = 0, match, part = 0, line = 1;
  const append = (target, startLine) => {
    part++;
    if (!target.trim()) return;
    records.push({id: `${source}:${mode}:${startLine}`, key: String(records.length + 1), original: '', target,
      source: `${source} · 第 ${startLine} 行${mode === 'paragraph' ? '起（空行分段）' : ''}`, digest: hash(target)});
  };
  while ((match = separator.exec(text))) {
    const target = text.slice(offset, match.index); append(target, line);
    line += (text.slice(offset, separator.lastIndex).match(/\r\n|[\r\n\u2028\u2029]/g) || []).length;
    offset = separator.lastIndex;
  }
  append(text.slice(offset), line); return records;
}
function resplitRecords(records, mode) {
  if (!Array.isArray(records) || records.some(r => typeof r.target !== 'string' || hash(r.target) !== r.digest)) throw new Error('原文案校验失败，无法重新拆分');
  return records.flatMap(r => {
    const parts = recordsFromText(r.target, r.source || r.id, mode);
    if (parts.length === 1 && parts[0].target === r.target) return [r];
    return parts.map((part, index) => ({...part, id: `${r.id}:${mode}:${index + 1}`, key: `${r.key || ''}.${index + 1}`, original: ''}));
  });
}
function normalize(text) { return String(text).replace(/\r\n?/g, '\n').normalize('NFC'); }
function validatePlan(plan) {
  if (!plan || plan.version !== 1 || !Array.isArray(plan.files) || !Array.isArray(plan.records)) throw new Error('无效的任务格式');
  const records = new Map();
  for (const record of plan.records) {
    if (records.has(record.id)) throw new Error('文案编号重复');
    if (typeof record.target !== 'string' || !record.target.length || hash(record.target) !== record.digest) throw new Error('文案内容或校验值不一致');
    records.set(record.id, record);
  }
  let count = 0;
  for (const file of plan.files) {
    if(file.deliveryBoards)require('./photoshop-delivery.cjs').validateBoards(file.deliveryBoards);
    validateMixedEdits(file.mixedTextEdits,{records:plan.records,format:/\.ai$/i.test(file.path||'')?'AI':'PSD'});count+=(file.mixedTextEdits||[]).length;
    validateTextActions(file.textActions,{jobs:file.jobs});count+=(file.textActions||[]).length;validateTypographyEdits(file.typographyEdits);count+=(file.typographyEdits||[]).length;
    validateArtworkHides(file.artworkHides,{textActions:file.textActions,format:/\.ai$/i.test(file.path||'')?'AI':'PSD'});count+=(file.artworkHides||[]).length;
    if (!file.path || !file.fingerprint || !Array.isArray(file.jobs) || (!file.jobs.length&&!file.artworkHides?.length&&!file.textActions?.length&&!file.mixedTextEdits?.length&&!file.typographyEdits?.length)) throw new Error('文件未绑定文案或没有真实 PSD／PSB 路径');
    if((file.mixedTextEdits||[]).some(e=>file.jobs.some(j=>j.layerId===e.layerId)||(file.textActions||[]).some(a=>a.layerId===e.layerId)||(file.artworkHides||[]).some(a=>a.objectId==='t:'+e.layerId)))throw Error('同一混合文字不能同时普通改字、隐藏或清除');
    const seen = new Set();
    for (const job of file.jobs) {
      validateCreation(job,{width:file.width,height:file.height});if(job.layerId<0&&!job.nativeCreation)throw Error("新增文字缺少创建合同");
      if (!Number.isInteger(job.layerId) || seen.has(job.layerId)) throw new Error('文字层缺少唯一 ID 或重复绑定');
      seen.add(job.layerId);
      const r = records.get(job.recordId);
      if (!r) throw new Error('待写入文字缺少绑定文档来源');
      if(job.override&&(job.override.enabled!==true||job.override.sourceDigest!==r.digest||typeof job.override.text!=='string'||!job.override.text.trim()||job.override.text.length>100000))throw new Error('手动文案或来源校验无效');
      if(job.target!==(job.override?job.override.text:r.target))throw new Error('待写入文字并非绑定文档原文或已确认的手动文案');
      if(job.documentText!==undefined&&job.documentText!==r.target)throw new Error('文档原文来源不一致');
      if (!job.font || !Number.isFinite(job.minSize) || job.minSize <= 0 || job.minSize > job.size) throw new Error('字体或字号限制无效');
      if (!Array.isArray(job.box) || job.box.length !== 4 || job.box.some(x => !Number.isFinite(x)) || job.box[2] <= 0 || job.box[3] <= 0) throw new Error('区域参数无效');
      if (job.smart && (typeof job.smart.allowWrap !== 'boolean' || typeof job.smart.allowLeading !== 'boolean' || !Number.isFinite(job.smart.trackingLimit) || job.smart.trackingLimit < 0 || job.smart.trackingLimit > 30)) throw new Error('智能排版约束无效');
      if(job.manual){const invalid=manualStyleIssues(job.manual);if(invalid.length)throw new Error(file.name+' / '+(job.name||job.original||'图层 '+job.layerId)+'：手动排版参数无效（'+invalid.join('、')+'）');}
      if(job.manual&&['stretchX','stretchY'].some(k=>job.manual[k]!==undefined&&(!Number.isFinite(job.manual[k])||job.manual[k]<10||job.manual[k]>1000)))throw new Error('手动排版拉伸参数无效');
      if(job.position&&(!Number.isFinite(job.position.x)||!Number.isFinite(job.position.y)||job.position.x< -300000||job.position.y< -300000||job.position.x>300000||job.position.y>300000))throw new Error('文字位置参数无效');
      if(job.previewLayout){const p=job.previewLayout;
        if(p.paragraphs!==undefined){const paragraphs=require('./design-text-layout.cjs').validateParagraphs(job.target,p.paragraphs);if(!Array.isArray(p.breaks)||p.breaks.length||p.text!==paragraphs.flat().join('\n'))throw new Error('预览排版断行与完整目标文案不一致');}
        else if(!Array.isArray(p.breaks)||p.breaks.some((v,i)=>!Number.isInteger(v)||v<=0||v>=canonicalText(job.target).length||(i>0&&v<=p.breaks[i-1]))||p.text!==insertBreaks(canonicalText(job.target),p.breaks))throw new Error('预览排版文字与目标文案不一致');
        if(!p.font||typeof p.font!=='string'||p.font.length>200||!['original','light','regular','medium','semibold','bold','black'].includes(p.weight)||!Number.isFinite(p.size)||p.size<1||p.size>2000||!Number.isFinite(p.tracking)||p.tracking < -200||p.tracking>1000||!Number.isFinite(p.leading)||p.leading<=0||p.leading>40000||!['stretchX','stretchY'].every(k=>Number.isFinite(p[k])&&p[k]>=10&&p[k]<=1000)||!Array.isArray(p.box)||p.box.length!==4||p.box.some(v=>!Number.isFinite(v)||Math.abs(v)>300000)||p.box[2]<=0||p.box[3]<=0)throw new Error('预览排版参数无效');
      }
      count++;
    }
  }
  for(const file of plan.files){validateExtractedContainers(file.extractedContainers,{width:file.width,height:file.height,fingerprint:file.fingerprint});validateContainerEdits(file.containerEdits,{width:file.width,height:file.height,textIds:file.jobs.map(j=>j.layerId)});for(const e of file.containerEdits||[])if(e.layerId<0&&!extractedMetadata(file.extractedContainers).some(c=>c.id===e.layerId&&JSON.stringify(c.box)===JSON.stringify(e.sourceBox)))throw Error('拆分容器调整来源不一致');}
  if (!count) throw new Error('没有可执行任务');
  return plan;
}
function jsxForPlan(input, options={}) {
  const plan = validatePlan(input);
  const json = JSON.stringify(plan).replace(/[\u2028\u2029]/g, c => c === '\u2028' ? '\\u2028' : '\\u2029');
  return `#target photoshop
${options.silent?'':'app.bringToFront();'}
(function () {
// Photoshop 的 ExtendScript 在部分版本没有 JSON，全程不依赖外部脚本。
function jsonEncode(v) {
  if (v === null || typeof v === "undefined") return "null";
  if (typeof v === "string") return '"' + v.replace(/[\\\\"\\x00-\\x1f]/g, function(c) { var code = c.charCodeAt(0), hex = code.toString(16); return c === '"' ? '\\\\"' : c === '\\\\' ? '\\\\\\\\' : '\\\\u' + ('0000' + hex).slice(-4); }) + '"';
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  var values = [], k;
  if (v instanceof Array) { for (k = 0; k < v.length; k++) values.push(jsonEncode(v[k])); return "[" + values.join(",") + "]"; }
  for (k in v) if (v.hasOwnProperty(k)) values.push(jsonEncode(k) + ":" + jsonEncode(v[k]));
  return "{" + values.join(",") + "}";
}
var plan = ${json};
var previousUnits = app.preferences.rulerUnits, previousDialogs = app.displayDialogs;
app.preferences.rulerUnits = Units.PIXELS;
app.displayDialogs = DialogModes.NO;
${options.outputDirectory?'var folder = new Folder('+JSON.stringify(options.outputDirectory.replace(/\\/g,'/'))+');':'var folder = Folder.selectDialog("选择新 PSD／PSB 输出目录（不会覆盖原稿）");'}
if (!folder) { app.preferences.rulerUnits = previousUnits; app.displayDialogs = previousDialogs; return; }
var results = [], current = null;
function canonical(s) { return String(s).replace(/\\r\\n?/g, "\\n"); }
function findLayer(container, id) {
  for (var i = 0; i < container.layers.length; i++) {
    var l = container.layers[i];
    if (l.id === id) return l;
    if (l.typename === "LayerSet") { var found = findLayer(l, id); if (found) return found; }
  }
  return null;
}
function bounds(layer) { var b = layer.bounds; return [b[0].as("px"), b[1].as("px"), b[2].as("px"), b[3].as("px")]; }
function within(layer, box) { var b = bounds(layer); return b[0] >= box[0] - 1 && b[1] >= box[1] - 1 && b[2] <= box[0] + box[2] + 1 && b[3] <= box[1] + box[3] + 1; }
${photoshopFit}
${photoshopTextObjects}
${require('./typography-native.cjs').psTypographyNative}
${require('./photoshop-delivery.cjs').nativeDelivery}
${containerScript}
${extractionScript}
try {
  for (var f = 0; f < plan.files.length; f++) {
      var item = plan.files[f], opened = false, original = null, layouts = [], out = null;
    try {
      var file = new File(item.path);
      if (!file.exists) throw new Error("原 PSD／PSB 不存在");
      for (var d = 0; d < app.documents.length; d++) { try { if (app.documents[d].fullName.fsName[/^windows/i.test($.os)?'toLowerCase':'toString']() === file.fsName[/^windows/i.test($.os)?'toLowerCase':'toString']()) original = app.documents[d]; } catch (_) {} }
      if (original && !original.saved) throw new Error("原 PSD／PSB 在 Photoshop 中有未保存改动，请先保存并重新导入");
      if (!original) { original = app.open(file); opened = true; }
      app.activeDocument = original;
      // 原文校验在复制前执行，防止绑定到已变化的 PSD。
      for (var j = 0; j < item.jobs.length; j++) {
        var job = item.jobs[j];if(job.nativeCreation)continue;var l = findLayer(original, job.layerId);
        if (!l || l.typename !== "ArtLayer" || l.kind !== LayerKind.TEXT) throw new Error("找不到可编辑文字层 ID " + job.layerId);
        if (l.textItem.kind !== TextType.POINTTEXT) throw new Error("段落文字暂不支持自动导出：" + l.name);
        if (canonical(l.textItem.contents) !== canonical(job.original)) throw new Error("原文变化：" + l.name);
        if (l.textItem.font !== job.font) throw new Error("字体变化或已被替换：" + l.name);
      }
      var edits=item.containerEdits||[];for(var ce=0;ce<edits.length;ce++)if(edits[ce].layerId>0)checkContainer(original,edits[ce]);
      current = original.duplicate(item.name.replace(/\\.ps[db]$/i, "") + "_localized", false);
      if (opened) original.close(SaveOptions.DONOTSAVECHANGES);
      app.activeDocument = current;
      var nativeEdits=materializeExtracted(current,item.extractedContainers||[],edits);applyContainers(current,nativeEdits);
      for (var j = 0; j < item.jobs.length; j++) {
        var job = item.jobs[j], layer = job.nativeCreation?nativeNewText(current,job):findLayer(current, job.layerId);
        if (!layer) throw new Error("复制文档中的图层 ID 不匹配");
        // 混合字体、旋转文字及复杂样式在客户端被拦截；此处再次检查字体可用性。
        var available = false;
        var targetFont=job.font;if(job.previewLayout){targetFont=job.previewLayout.font;}else if(job.manual){targetFont=job.manual.font;}
        for (var k = 0; k < app.fonts.length; k++) if (app.fonts[k].postScriptName === targetFont) { available = true; break; }
        if (!available) throw new Error("未安装目标字体：" + targetFont);
        if (layer.allLocked) throw new Error("文字层已锁定：" + layer.name);
        var ti = layer.textItem;
        if(job.position&&(job.position.x>=current.width.as("px")||job.position.y>=current.height.as("px")||job.position.x+job.box[2]<=0||job.position.y+job.box[3]<=0))throw new Error("文字目标区域超出画布："+layer.name);
        var fitted = job.previewLayout ? applyPreviewLayer(layer,job) : autoFitLayer(layer, job);
        ti = layer.textItem;
        if (canonical(ti.contents) !== fitted.text) throw new Error("文字写入后不一致：" + layer.name);
        if (ti.font !== targetFont) throw new Error("最终字体不一致：" + layer.name + "；期望 " + targetFont + "，实际 " + ti.font);
        var finalBold=null,finalHorizontalScale=null,finalVerticalScale=null;try{finalBold=ti.fauxBold;}catch(_){}try{finalHorizontalScale=ti.horizontalScale;finalVerticalScale=ti.verticalScale;}catch(_){}
        layouts.push({layerId:job.layerId,name:layer.name,sourceText:typeof job.documentText==="string"?job.documentText:job.target,editedText:job.override?job.target:null,recordId:job.recordId,override:job.override||null,renderedText:fitted.text,insertedBreaks:fitted.breaks,font:ti.font,sizePt:ti.size.as("pt"),tracking:fitted.tracking,leadingPt:typeof fitted.leading==="number"?fitted.leading:null,autoLeading:ti.useAutoLeading,fauxBold:finalBold,previewLayout:job.previewLayout||null,renderingMode:job.previewLayout?"preview":"legacy-fit",manual:job.manual||null,horizontalScale:finalHorizontalScale,verticalScale:finalVerticalScale,position:job.position||null,finalBounds:bounds(layer),unchanged:fitted.unchanged});
      }
      nativeTextActions(current,item.textActions||[]);nativeTypographyEdits(current,item.typographyEdits||[]);
      var expectedDelivery=item.deliveryBoards?psDeliverySnapshot(current):null;
      // 大型文档始终保留 PSB 格式；扩展名和 Photoshop 保存选项必须一致。
      var isLargeDocument = item.format === "PSB" || (!item.format && (/\\.psb$/i.test(item.path) || /\\.psb$/i.test(item.name))), extension = isLargeDocument ? ".psb" : ".psd";
      var stem = item.name.replace(/\\.ps[db]$/i, "") + "_localized", out = new File(folder.fsName + "/" + stem + extension), n = 1;
      while (out.exists) out = new File(folder.fsName + "/" + stem + "_" + n++ + extension);
      if (isLargeDocument) {
        // ExtendScript DOM does not expose a PSB save-options constructor in
        // current Photoshop. Its native Action Manager saves editable PSB.
        var save = new ActionDescriptor(), format = new ActionDescriptor();
        format.putBoolean(stringIDToTypeID("maximizeCompatibility"), true);
        save.putObject(charIDToTypeID("As  "), stringIDToTypeID("largeDocumentFormat"), format);
        save.putPath(charIDToTypeID("In  "), out);
        save.putBoolean(charIDToTypeID("Cpy "), true);
        save.putBoolean(stringIDToTypeID("lowerCase"), true);
        executeAction(charIDToTypeID("save"), save, DialogModes.NO);
      } else {
        var options = new PhotoshopSaveOptions(); options.layers = true; options.embedColorProfile = true;
        current.saveAs(out, options, true, Extension.LOWERCASE);
      }
      current.close(SaveOptions.DONOTSAVECHANGES); current = null;
      var delivery=null;if(item.deliveryBoards){current=app.open(out);psDeliveryCheck(current,expectedDelivery);delivery=psDeliveryJpegs(current,item.deliveryBoards,out);current.close(SaveOptions.DONOTSAVECHANGES);current=null;}
      results.push({file: item.name, status: item.deliveryBoards?"已保存重开PSD，最终JPG待审验":"已保存，待人工检查字体字形及图像差异", output: out.fsName, delivery:delivery,layouts:layouts,containerEdits:edits});
    } catch (e) {
      if (current) { try { current.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} current = null; }
      if (opened && original) { try { original.close(SaveOptions.DONOTSAVECHANGES); } catch (_) {} }
      var failedResult={file:item.name,status:out&&out.exists?"交付核验失败，已保存副本保留":"失败，未导出",error:String(e)+"（脚本行 "+e.line+"）"};if(out&&out.exists){failedResult.output=out.fsName;failedResult.nativeSaved=true;}results.push(failedResult);
    }
  }
} finally { app.preferences.rulerUnits = previousUnits; app.displayDialogs = previousDialogs; }
var report = new File(folder.fsName + "/PSD-Lingo-report-" + new Date().getTime() + ".json");
if(plan.skipped && plan.skipped.length)results.push({status:"用户确认跳过，保持原样",skipped:plan.skipped});
report.encoding = "UTF8"; report.open("w"); report.write(jsonEncode(results)); report.close();
var savedCount=0,failedCount=0,failures="";
for(var i=0;i<results.length;i++){if(results[i].output)savedCount++;if(results[i].error){failedCount++;failures+="\\n"+results[i].file+"："+results[i].error;}}
${options.silent?'if(false)':''}alert("处理结束。已保存 "+savedCount+" 份 PSD／PSB，失败 "+failedCount+" 份。\\n输出目录："+folder.fsName+failures+"\\n报告仅是记录；失败的文件不会生成 PSD／PSB。请复核 Photoshop 字体渲染。" );
})();
`;
}
module.exports = { hash, parseCsv, recordsFromRows, recordsFromText, resplitRecords, normalize, validatePlan, jsxForPlan };
