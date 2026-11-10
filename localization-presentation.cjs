// Deliberately bounded rules. Amounts, currencies, units and versions are never inferred.
function presentationSuggestions(record,layer){
 if(!record||typeof record.target!=='string')return [];
 const text=record.target,source=String(record.original||layer?.original||''),out=[];
 if(/^\s*(?:原价|初始价格)\s*[:：]?\s*(?:[¥￥$€£]\s*)?\d+(?:\.\d+)?\s*$/.test(source)&&/^\s*[$€£]\s*\d+(?:\.\d+)?\s*$/.test(text))out.push({ruleId:'price-role-label',text:'Original: '+text.trim(),reason:'原文明示原价，补充原价标签；金额及币种保持不变。'});
 const lines=text.split('\n');
 if(layer&&/title|heading|标题/i.test(layer.name||'')&&lines.length>1&&lines.every(line=>/^[A-Za-z][A-Za-z ,'-]+\.$/.test(line)))out.push({ruleId:'minor-prose-punctuation',text:lines.map(line=>line.slice(0,-1)).join('\n'),reason:'多行标题可省略句末句点；不处理小数、版本、缩写或单位。'});
 return out.map(p=>({...p,before:text,sourceDigest:record.digest,source:record.source||'',recordId:record.id}));
}
function validatePresentation(change,record,layer){
 if(!change||!presentationSuggestions(record,layer).some(p=>p.ruleId===change.ruleId&&p.text===change.text&&p.sourceDigest===change.sourceDigest))throw Error('表达优化已失效，请重新检查建议');
 return {...change};
}
module.exports={presentationSuggestions,validatePresentation};
