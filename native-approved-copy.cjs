// Select only an unambiguous contiguous passage of approved copy. Whitespace
// may change for visual line breaks; letters, punctuation and numbers may not.
function canonical(text){
 const units=[];for(let i=0;i<text.length;i++)if(!/\s/u.test(text[i]))units.push({text:text[i],start:i,end:i+1});return {text:units.map(u=>u.text).join(''),units,original:text};
}
function nativeApprovedCopy(approved,spans,slice){
 const target=Array.isArray(spans)?spans.map(s=>s?.text??'').join(''):approved;
 if(typeof approved!=='string'||typeof target!=='string'||!target.trim())throw Error('原生改字缺少完整批准文案');
 if(slice!==undefined&&(!Array.isArray(slice)||slice.length!==2||!slice.every(Number.isInteger)||slice[0]<0||slice[1]<=slice[0]||slice[1]>approved.length))throw Error('字段字符段范围无效');
 const source=canonical(slice?approved.slice(...slice):approved),desired=canonical(target);
 if(source.text===desired.text)return {target,recordSlice:slice};
 if(slice)throw Error('原生改字分段与recordSlice批准文案不一致；仅允许调整空格和换行');
 const positions=[];let at=-1;while((at=source.text.indexOf(desired.text,at+1))!==-1){const end=at+desired.text.length,word=c=>!!c&&/[\p{L}\p{N}]/u.test(c);if(!(word(source.original[source.units[at].start-1])&&word(desired.text[0]))&&!(word(source.original[source.units[end-1].end])&&word(desired.text.at(-1))))positions.push(at);}
 if(positions.length!==1)throw Error('原生改字目标不能唯一对应批准文案；请提供recordSlice:[起始,结束]或拆分文案，不能改写、漏字或猜测');
 const start=positions[0],end=start+desired.text.length;return {target,recordSlice:[source.units[start].start,source.units[end-1].end]};
}
module.exports={nativeApprovedCopy};
