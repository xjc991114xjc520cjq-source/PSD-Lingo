// Retire only pre-execution argument/discovery failures after a successful
// replacement on the same known resource. Never retire unknown native writes.
function resolvedArgumentKeys(history,tool,args,keys){
 const family=t=>['read_product_mapping','confirm_product_mapping','import_product_mapping'].includes(t)?'mapping':t;
 const allowed=new Set(['configure_product_template','inspect_product_template','inspect_product_copy','read_product_mapping','import_product_mapping','confirm_product_mapping','inspect_product_gifts']);
 if(!allowed.has(tool))return [];
 const resolved=[];let start;
 for(const h of history){if(h.type==='tool_start'){start=h;continue;}if(h.type!=='tool_error'||!start||!allowed.has(h.tool)||family(h.tool)!==family(tool))continue;
  const known=h.code==='TOOL_ARGUMENTS'||/^(只能读取用户已附加的文件或文件夹|产品对应记录ID无效|请选择可见的模板顶层分组\/智能对象|请明确模板价格字段与对象角色|模板替换必须恰好覆盖全部采用画板)$/.test(h.error||'');
  if(!known)continue;
  const a=start.args||{},scope=['sourceFileId','workbookFileId','mappingId','fileIndex',...(tool==='inspect_product_gifts'?['fileId']:[])];
  if(scope.some(k=>a[k]!==undefined&&a[k]!==args[k]))continue;
  if(!scope.some(k=>args[k]!==undefined))continue;
  resolved.push(...keys(h.tool,a));
 }
 return resolved;
}
module.exports={resolvedArgumentKeys};
