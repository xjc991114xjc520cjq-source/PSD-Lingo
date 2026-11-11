// Deferred native Illustrator character edits. The canvas never approximates
// mixed typography: native background and export execute the same contract.
const mixedIssue='混合文字样式尚不支持';
function targetFor(record,part='full'){
 if(!record||typeof record.target!=='string')throw Error('混合改字缺少批准文案');
 if(part==='full')return record.target;
 if(part==='parameter-value'){const m=/^[^:：\r\n]+[:：]\s*([^\r\n]+)$/.exec(record.target);if(m)return m[1].trim();}
 throw Error('混合改字文案角色无效，不能自行截取译文');
}

function validateMixedEdits(edits,{records,layers,format='AI'}={}){
 if(edits===undefined||Array.isArray(edits)&&!edits.length)return [];
 if(format!=='AI'||!Array.isArray(edits)||edits.length>100)throw Error('混合字符修改目前仅支持AI原生文字');
 const ids=new Set();for(const e of edits){
  if(!e||!Number.isInteger(e.layerId)||e.layerId<1||ids.has(e.layerId)||typeof e.original!=='string'||!e.original.length||e.original.length>20000||typeof e.target!=='string'||!e.target.trim()||e.target.length>20000||/[\r\n\uD800-\uDFFF]/.test(e.original+e.target)||!['left','center','right'].includes(e.anchor)||!Number.isFinite(e.scale)||e.scale<.1||e.scale>10||typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>2000)throw Error('混合字符合同无效、重复、过大或包含暂不支持的换行/扩展字符');
  ids.add(e.layerId);
  if(!Array.isArray(e.spans)||!e.spans.length||e.spans.length>256||e.spans.some(s=>!s||Object.keys(s).some(k=>!['text','sourceStart'].includes(k))||typeof s.text!=='string'||!s.text.length||!Number.isInteger(s.sourceStart)||s.sourceStart<0||s.sourceStart>=e.original.length)||e.spans.map(s=>s.text).join('')!==e.target)throw Error('混合字符分段未覆盖完整译文或引用无效原字符');
  if(records){const r=records.find(r=>r.id===e.recordId);if(!r||r.digest!==e.sourceDigest||typeof e.sourceDigest!=='string'||!/^[a-f0-9]{64}$/.test(e.sourceDigest)||targetFor(r,e.part)!==e.target)throw Error('混合改字文案来源已变化或不完整');}
  if(layers){const l=layers.find(l=>l.id===e.layerId);if(!l||l.original!==e.original||l.skipExport||l.visible===false||!l.issues?.includes(mixedIssue)||l.issues.some(i=>i!==mixedIssue))throw Error('混合文字来源不匹配或存在其他原生编辑限制');}
 }return edits;
}
function makeMixedEdit(layer,args,records){
 const r=records.find(r=>r.id===args.recordId),target=targetFor(r,args.part);
 const e={layerId:layer.id,original:layer.original,target,recordId:r.id,sourceDigest:r.digest,part:args.part||'full',spans:args.spans,anchor:args.anchor||layer.alignment||'left',scale:args.scale??1,reason:args.reason};
 validateMixedEdits([e],{records,layers:[layer]});return structuredClone(e);
}
const mixedTextNative=String.raw`
var MIXED_KEYS=['size','tracking','leading','autoLeading','horizontalScale','verticalScale','baselineShift','rotation','strokeWeight','overprintFill','overprintStroke','capitalization','baselinePosition','ligature','discretionaryLigature','noBreak','kerningMethod'];
function mixedIdentity(a){var o={font:a.textFont.name,fill:encodeColor(a.fillColor),stroke:encodeColor(a.strokeColor)};for(var i=0;i<MIXED_KEYS.length;i++){var k=MIXED_KEYS[i];if(k==='leading'&&a.autoLeading)continue;try{var v=a[k];if(typeof v==='number')v=Math.round(v*1000000)/1000000;if(typeof v!=='undefined')o[k]=typeof v==='number'||typeof v==='boolean'?v:String(v);}catch(_){}}return encode(o);}
function mixedSnapshot(d,edits,frames){var a=[];for(var n=0;n<(edits||[]).length;n++){var t=frames?frames[n]:d.textFrames[(edits[n].layerId||edits[n].id)-1],id=edits[n].layerId||edits[n].id,s=[];if(frames){id=0;for(var k=0;k<d.textFrames.length;k++)if(d.textFrames[k]===t){id=k+1;break;}if(!id)throw Error('混合文字对象意外丢失');}for(var j=0;j<t.characters.length;j++)s.push(mixedIdentity(t.characters[j].characterAttributes));a.push({id:id,text:text(t.contents),styles:s});}return a;}
function verifyMixedSnapshot(d,edits,expected){if(encode(mixedSnapshot(d,expected))!==encode(expected))throw Error('保存重开后混合文字的内容或字符样式变化');}
function mixedCopy(src,dst,scale){dst.textFont=src.textFont;for(var k=0;k<MIXED_KEYS.length;k++){var key=MIXED_KEYS[k],v;try{v=src[key];}catch(_){continue;}if(typeof v==='undefined')continue;if(key==='size'||key==='leading'||key==='baselineShift')v*=scale;dst[key]=v;}dst.fillColor=src.fillColor;dst.strokeColor=src.strokeColor;}
function mixedRuns(t){var out=[],last=null;for(var i=0;i<t.characters.length;i++){var a=t.characters[i].characterAttributes,sig=signature(a);if(!last||last.sig!==sig){last={start:i,end:i+1,text:String(t.contents).charAt(i),font:a.textFont.name,family:a.textFont.family,size:Number(a.size),tracking:Number(a.tracking)||0,sig:sig};out.push(last);}else{last.end=i+1;last.text+=String(t.contents).charAt(i);}}for(var i=0;i<out.length;i++)delete out[i].sig;return out;}
function mixedSourceAllowed(t){if(!t||t.hidden||t.locked||t.kind===TextType.PATHTEXT||t.orientation!==TextOrientation.HORIZONTAL||t.story&&t.story.textFrames.length>1)return false;var p=t.parent;while(p&&p.typename!=='Document'){if(p.hidden||p.visible===false||p.locked)return false;p=p.parent;}var m=t.matrix;if(Math.abs(m.mValueB)>.00001||Math.abs(m.mValueC)>.00001||Math.abs(m.mValueA-1)>.00001||Math.abs(m.mValueD-1)>.00001)return false;var first=signature(t.characters[0].characterAttributes),mixed=false;for(var i=0;i<t.characters.length;i++){var a=t.characters[i].characterAttributes,c=capitalization(a);if(c==='small-caps'||c==='all-small-caps')return false;if(signature(a)!==first)mixed=true;}return mixed;}
function applyMixedText(d,r,edits){for(var n=0;n<(edits||[]).length;n++){
 var e=edits[n],t=d.textFrames[e.layerId-1];
 if(!t||text(t.contents)!==e.original||t.characters.length!==e.original.length||!mixedSourceAllowed(t))throw Error('混合文字来源或样式限制已变化');
 var holders=[],templates=[],before=inkBounds(t),expected=[],at=0;
 try{for(var s=0;s<e.spans.length;s++){var span=e.spans[s],src=t.characters[span.sourceStart].characterAttributes;app.textFonts.getByName(src.textFont.name);var h=d.textFrames.add();holders.push(h);h.contents='X';mixedCopy(src,h.characters[0].characterAttributes,1);templates.push(h.characters[0].characterAttributes);for(var j=0;j<span.text.length;j++)expected.push(s);}
 t.contents=e.target;for(var j=0;j<expected.length;j++)mixedCopy(templates[expected[j]],t.characters[j].characterAttributes,e.scale);
 if(text(t.contents)!==e.target)throw Error('混合文字写入内容不一致');
 for(var j=0;j<expected.length;j++){var a=t.characters[j].characterAttributes,src=templates[expected[j]];if(a.textFont.name!==src.textFont.name||Math.abs(a.size-src.size*e.scale)>.00001||encodeColor(a.fillColor)!==encodeColor(src.fillColor))throw Error('混合字符字体/字号/颜色校验失败');}
 var after=inkBounds(t),factor=0;if(e.anchor==='center')factor=0.5;else if(e.anchor==='right')factor=1;
 t.translate(before[0]+(before[2]-before[0])*factor-after[0]-(after[2]-after[0])*factor,0);
 }finally{for(var j=holders.length-1;j>=0;j--)holders[j].remove();}
}}
`;
module.exports={mixedIssue,targetFor,makeMixedEdit,validateMixedEdits,mixedTextNative};
