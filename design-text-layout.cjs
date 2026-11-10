// Explicit visual line breaks preserve every approved paragraph and character.
const {canonicalText,breakPositions}=require('./layout.cjs');
function validateParagraphs(target,paragraphs){
 const source=canonicalText(target).split('\n');
 if(!Array.isArray(paragraphs)||paragraphs.length!==source.length||paragraphs.length>200)throw Error('排版断行必须逐段对应完整批准文案');
 let count=0;
 for(let i=0;i<source.length;i++){
  const lines=paragraphs[i],original=source[i].trim(),allowed=new Set(breakPositions(original));let cursor=0;
  if(!Array.isArray(lines)||!lines.length||lines.length>40)throw Error('排版断行数量无效');
  for(const raw of lines){
   if(typeof raw!=='string'||/[\r\n]/.test(raw)||++count>500)throw Error('排版断行格式无效');
   const line=raw.trim();if(!line)continue;
   while(/[ \t]/.test(original[cursor]||'')&&cursor<original.length)cursor++;
   if(cursor&& !allowed.has(cursor))throw Error('排版断行拆开了单词、数字或单位');
   if(original.slice(cursor,cursor+line.length)!==line)throw Error('排版断行改变了批准文案');cursor+=line.length;
  }
  if(original.slice(cursor).trim())throw Error('排版断行遗漏了批准文案');
 }
 return paragraphs.map(p=>p.map(s=>s.trim()));
}
function layoutText(layer,target){
 const value=layer.textLayout;if(!value||value.sourceText!==target)return target;
 try{return validateParagraphs(target,value.paragraphs).flat().join('\n');}catch{return target;}
}
module.exports={validateParagraphs,layoutText};
