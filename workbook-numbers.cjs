// XLSX numeric storage is distinct from the text printed in an artwork.
const SSF=require('./vendor/ssf/ssf.cjs');
const CONTRACT='xlsx-number-v1-15sig-ssf0.11.2';
function numberCell(raw,{styleIndex=0,formatId=0,formatCode='General',formula=null,date1904=false}={}){
 const source={contract:CONTRACT,type:'number',raw,styleIndex,formatId,formatCode,formula,date1904};
 if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)||!Number.isFinite(Number(raw)))return {...source,error:'无效或超出范围的数值缓存'};
 // Excel numeric precision is 15 significant digits; never apply a fixed decimal count.
 const n=Number(Number(raw).toPrecision(15)),canonical=String(n);
 try{
  if(typeof formatCode!=='string'||!formatCode||formatCode.length>1024)throw Error('未知或过长的数值格式');
  const display=/^general$/i.test(formatCode)?canonical:SSF.format(formatCode,n,{date1904});
  return {...source,canonical,display,kind:SSF.is_date(formatCode)?'date':/%/.test(formatCode.replace(/"[^"]*"|\\./g,''))?'percent':'number'};
 }catch{return {...source,canonical,error:'不支持的数值格式，请核对表格格式后重新分析'};}
}
module.exports={numberCell,CONTRACT,builtinFormats:SSF.get_table()};
