// Shared, deterministic layout search. Words and punctuation are never rewritten.
// One complete typography contract for AI, preview, controls and PSD export.
// Fill absent legacy fields only; invalid explicit numbers remain invalid.
function manualStyleFor(layer,overrides={}) {
 const m={...(layer.manual||{}),...overrides};
 return {...m,enabled:m.enabled??true,font:typeof m.font==='string'&&m.font.trim()?m.font:layer.font,weight:m.weight||'original',size:m.size??layer.size,tracking:m.tracking??layer.tracking??0,leading:m.leading??layer.leading??(m.size??layer.size)*1.2,stretchX:m.stretchX??100,stretchY:m.stretchY??100};
}
function manualStyleIssues(m) {
 const errors=[];
 if(m?.enabled!==true)errors.push('启用标记');
 if(typeof m?.font!=='string'||!m.font.trim()||m.font.length>200)errors.push('字体');
 if(!['original','light','regular','medium','semibold','bold','black'].includes(m?.weight))errors.push('字重');
 for(const [key,label,min,max]of [['size','字号',1,2000],['tracking','字距',-200,1000],['leading','行距',1,4000]])if(!Number.isFinite(m?.[key])||m[key]<min||m[key]>max)errors.push(label);
 for(const [key,label]of [['stretchX','水平拉伸'],['stretchY','垂直拉伸']])if(m?.[key]!==undefined&&(!Number.isFinite(m[key])||m[key]<10||m[key]>1000))errors.push(label);
 return errors;
}
function canonicalText(text) { return text.replace(/\r\n?/g, '\n'); }
function breakPositions(text) {
  const positions = [];
  for (let i = 1; i < text.length; i++) {
    const a = text[i - 1], b = text[i];
    if (a === '\n' || b === '\n') continue;
    if (/[ \t]/.test(a) && !/[ \t]/.test(b)) positions.push(i);
    else if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(a) && /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(b)) positions.push(i);
  }
  return positions;
}
function insertBreaks(text, positions) {
  let result = '', previous = 0;
  for (const position of positions) { result += text.slice(previous, position) + '\n'; previous = position; }
  return result + text.slice(previous);
}
function wrapText(text, width, measure) {
  const points = breakPositions(text), added = [];
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf('\n', start), end = newline < 0 ? text.length : newline;
    if (measure(text.slice(start, end)) <= width) { start = end + 1; continue; }
    let chosen = -1;
    for (const point of points) if (point > start && point < end) { if (measure(text.slice(start, point)) > width) break; chosen = point; }
    if (chosen < 0) { start = end + 1; continue; }
    added.push(chosen); start = chosen;
  }
  return {text: insertBreaks(text, added), breaks: added};
}
function smartFit(input, measure) {
  const text = canonicalText(input.text), originalSize = input.size, minimum = input.minSize;
  const originalTracking = input.tracking || 0, originalLeading = input.leading || originalSize * 1.2;
  const sizes = [originalSize];
  for (let ratio = .95; originalSize * ratio > minimum + .01; ratio -= .05) sizes.push(Math.round(originalSize * ratio * 100) / 100);
  if (minimum < originalSize) sizes.push(minimum);
  const limit = input.trackingLimit ?? 30, trackingDeltas = [0];
  for (let d = 10; d <= limit; d += 10) trackingDeltas.push(d);
  if (limit && trackingDeltas.at(-1) !== limit) trackingDeltas.push(limit);
  const cache = new Map();
  function metrics(value, size, tracking) {
    const key = JSON.stringify([value,size,tracking]);
    if (!cache.has(key)) cache.set(key, measure(value.replace(/[ \t]+$/g, ''), size, tracking));
    return cache.get(key);
  }
  let best = null;
  for (const size of sizes) for (const delta of trackingDeltas) {
    const tracking = originalTracking - delta, leading = originalLeading * size / originalSize;
    const variants = [{text, breaks: []}];
    if (input.allowWrap !== false) {
      for (const ratio of [1, .9, .8]) {
        const wrapped = wrapText(text, input.width * ratio, value => metrics(value,size,tracking).width);
        if (!variants.some(v => v.text === wrapped.text)) variants.push(wrapped);
      }
    }
    for (const variant of variants) {
      const lines = variant.text.split('\n'), measured = lines.map(line => metrics(line,size,tracking));
      const width = Math.max(0,...measured.map(m=>m.width));
      const inkHeight = Math.max(size*.5,...measured.map(m=>m.height));
      const options = [leading];
      if (input.allowLeading !== false && lines.length > 1) for (const ratio of [1.3,1.15,1.05]) {
        const value = Math.min(leading,size*ratio); if (!options.includes(value)) options.push(value);
      }
      for (const lineHeight of options) {
        const height = inkHeight + (lines.length - 1) * lineHeight;
        const overflow = Math.max(width / input.width, height / input.height);
        const candidate = {ok: overflow <= 1.001, text:variant.text, lines, breaks:variant.breaks, size,tracking,leading:lineHeight,width,height,inkHeight,ascent:Math.max(size*.5,...measured.map(m=>m.ascent||size*.75)),
          adjustments: {fontReduction: Math.round((1-size/originalSize)*100),addedLines:variant.breaks.length,trackingReduction:delta,leadingReduction:Math.round((1-lineHeight/leading)*100)}};
        if (!best || overflow < best.overflow) best = {...candidate,overflow};
        if (candidate.ok) return candidate;
      }
    }
  }
  return {...best,ok:false,reason:'已尝试合法换行、字号、字距和行距，仍超出当前允许区域。',suggestedMinSize:Math.max(8,Math.floor(minimum / (best?.overflow||1) * .95 * 10)/10)};
}
module.exports = {canonicalText,breakPositions,insertBreaks,wrapText,smartFit,manualStyleFor,manualStyleIssues};
