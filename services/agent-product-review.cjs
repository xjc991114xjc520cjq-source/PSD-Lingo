// Keep source proofs and numeric contracts in the validated local record. The
// model needs product identities, actual copy and decisions, not repeated proofs.
const fieldsForAgent=fields=>(fields||[]).map(({key,role,column,cell,value,state,formula,numeric})=>({key,role,column,cell,value,state,formula,...(numeric?{numeric:{raw:numeric.raw,display:numeric.display,canonical:numeric.canonical,formula:numeric.formula}}:{})}));
function mappingForAgent(r){
 const {rows=[],boards=[],...rest}=r.report;
 const approved=r.approved?{...r.approved,boards:r.approved.boards.map(b=>({...b,fields:fieldsForAgent(b.fields)}))}:null;
 return {mappingId:r.id,source:r.source.path,structureDigest:r.source.structureDigest,pixelDataRead:r.source.pixelDataRead,
  report:approved?{identityDigest:r.report.identityDigest,summary:r.report.summary}:{...rest,rows:rows.map(row=>({...row,fields:fieldsForAgent(row.fields)})),boards:boards.map(({candidates=[],modelConflicts=[],...b})=>({...b,candidates:candidates.map(({name,code,...c})=>c),modelConflicts:modelConflicts.map(({name,code,...c})=>c)})),rowReferences:'candidates和modelConflicts的rowId引用rows中完整产品名与编码；不是缺失数据'},approved,
  instruction:approved?'用户已实际确认保存。只使用approved中use的fields原文；skip保持原稿。后续import_product_mapping等工具会从本机校验完整记录，不要重读相同候选或要求再次回复已保存；身份确认不授权改产品图，仍需最终导出审验。':'候选未批准。结合本任务用户已有回答分析并用confirm_product_mapping提交逐板choices草案；当前蒙版内将直接显示可操作的确认表。不要要求切换被蒙版遮挡的面板，不接受口头已保存代替实际记录。完整证据与数值合同保存在本机记录，由后续写入接口重新校验。'};
}
module.exports={mappingForAgent};
