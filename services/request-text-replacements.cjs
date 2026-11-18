// User-authored requirements can approve a bounded replacement without a document.
// Never treat attachment text, model replies or tool results as that approval.
function userMessages(task){return [task.request,...(task.history||[]).flatMap(h=>h.type==='user_supplement'||h.type==='user_followup'?[h.text]:h.type==='user_answer'?Object.values(h.answers||{}):[])].filter(t=>typeof t==='string'&&t.trim());}
function dateParts(text){
 const m=/^(?:(\d{4})(年|[-./]))?(\d{1,2})(月|[-./])(\d{1,2})(日?)$/.exec(text);
 if(!m||m[2]&&m[2]!=='年'&&m[2]!==m[4]||m[4]==='月'&&!m[6]||m[4]!=='月'&&m[6])return null;
 const year=m[1]?Number(m[1]):null,month=Number(m[3]),day=Number(m[5]),days=new Date(Date.UTC(year??2000,month,0)).getUTCDate();
 if(month<1||month>12||day<1||day>days)return null;
 return {year,month,day,format:[m[2]||'',m[4],m[6]].join('|'),paddedMonth:m[3][0]==='0',paddedDay:m[5][0]==='0',monthWidth:m[3].length,dayWidth:m[5].length};
}
function validateRules(rules,messages){
 if(!Array.isArray(rules)||!rules.length)throw Error('请提供明确的原片段和目标片段');
 const approved=rules.map(r=>{
  if(!r||typeof r.find!=='string'||!r.find||typeof r.replace!=='string'||!r.replace||r.find===r.replace||typeof r.evidence!=='string'||!r.evidence.trim()||!messages.some(t=>t.includes(r.evidence)))throw Error('替换依据必须引用本次用户需求或补充中的原句，不能来自助手或附件');
  if(/[\r\n]/.test(r.find+r.replace))throw Error('片段替换保留原图层换行；请分别指定需要替换的文字片段');
  if(r.kind!==undefined&&!['literal','date'].includes(r.kind))throw Error('替换类型无效');
  if(r.kind==='date'){
   const from=dateParts(r.find),to=dateParts(r.replace);
   if(!from||!to||from.format!==to.format||!!from.year!==!!to.year||from.paddedMonth&&to.monthWidth!==2||from.paddedDay&&to.dayWidth!==2)throw Error('日期替换须使用真实日期并保持原日期格式及补零方式');
   const candidates=r.evidence.match(/(?:\d{4}(?:年|[-./]))?\d{1,2}(?:月|[-./])\d{1,2}日?/g)||[];
   if(!candidates.some(t=>{const d=dateParts(t);return d&&(to.year===null||d.year===to.year||d.year===null&&to.year===from.year)&&d.month===to.month&&d.day===to.day;}))throw Error('新日期未在本次用户要求中明确提供，不能自行推算');
  }else if(!r.evidence.includes(r.replace))throw Error('目标片段未出现在引用的用户需求中，不能编造文案');
  return {find:r.find,replace:r.replace,evidence:r.evidence,kind:r.kind||'literal'};
 });
 if(new Set(approved.map(r=>r.find)).size!==approved.length)throw Error('同一原片段有多个替换目标，请先明确范围');
 return approved;
}
function replaceLayer(layer,rules){
 const original=layer.original;if(typeof original!=='string')return null;
 const hits=[];for(const [ruleIndex,r]of rules.entries()){let at=0;while((at=original.indexOf(r.find,at))!==-1){const end=at+r.find.length;if(r.kind!=='date'||!/[0-9]/.test(original[at-1]||'')&&!/[0-9]/.test(original[end]||''))hits.push({at,end,r,ruleIndex});at=end;}}
 if(!hits.length)return null;hits.sort((a,b)=>a.at-b.at);if(hits.some((h,i)=>i&&h.at<hits[i-1].end))throw Error('替换片段互相重叠，请缩小范围');
 const runs=layer.mixedStyleRuns||[],chars=[];
 const push=(text,start,unchanged)=>{for(let i=0;i<text.length;i++){const sourceStart=start+(unchanged?i:Math.min(i,original.slice(start).length-1));chars.push({text:text[i],sourceStart});}};
 let at=0;for(const h of hits){push(original.slice(at,h.at),at,true);for(let i=0;i<h.r.replace.length;i++)chars.push({text:h.r.replace[i],sourceStart:h.at+Math.min(i,h.r.find.length-1)});at=h.end;}push(original.slice(at),at,true);
 const spans=[];for(const c of chars){const run=runs.find(r=>(r.from??r.start)<=c.sourceStart&&(r.to??r.end)>c.sourceStart),key=run?JSON.stringify(run):'char:'+c.sourceStart,last=spans.at(-1);if(last?.key===key)last.text+=c.text;else spans.push({...c,key});}
 return {original,target:chars.map(c=>c.text).join(''),spans:spans.map(({key,...s})=>s),ruleIndices:[...new Set(hits.map(h=>h.ruleIndex))]};
}
module.exports={userMessages,dateParts,validateRules,replaceLayer};
