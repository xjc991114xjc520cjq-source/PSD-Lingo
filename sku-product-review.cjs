// Review drafts are suggestions until the user saves; bulk actions never infer
// new product identities or delete artwork.
function skipUnconfirmed(report,choices,protectedIds=[]){
 const protect=new Set(protectedIds.map(String)),boards=new Map(report.boards.map(b=>[String(b.boardId),b]));
 return choices.map(c=>{const b=boards.get(String(c.boardId));if(!b||protect.has(String(c.boardId))||['skip','delete'].includes(c.action)||b.status==='proposed'&&c.action==='use')return {...c};return {...c,action:'skip',rowId:'',reason:'用户选择本轮跳过待核实画板，保留原稿'};});
}
function reviewIssues(report,choices){
 const issues=[],claims=new Map();for(const c of choices){if(!['use','skip','delete'].includes(c.action)){issues.push({boardId:c.boardId,kind:'pending',message:'请选择对应产品，或跳过此画板'});continue;}if(!c.reason?.trim())issues.push({boardId:c.boardId,kind:'reason',message:'请补充备注'});if(c.action==='delete'&&c.deleteConfirmed!==true)issues.push({boardId:c.boardId,kind:'delete',message:'请确认删除'});if(c.action!=='use')continue;const r=report.rows.find(r=>r.id===c.rowId);if(!r){issues.push({boardId:c.boardId,kind:'product',message:'请重新选择表格产品'});continue;}if(r.fields.some(f=>f.role!=='gift'&&f.state!=='value')&&!['leave-unchanged','remove-and-reflow'].includes(c.placeholderPolicy))issues.push({boardId:c.boardId,kind:'placeholder',message:r.name+'的'+r.fields.filter(f=>f.role!=='gift'&&f.state!=='value').map(f=>f.key+(f.cell?'（'+f.cell+'）':'')+'为'+(f.value?'“'+f.value+'”':'空白')).join('、')+'，请在上方选择保留模板文案或删除后重排'});if(!claims.has(c.rowId))claims.set(c.rowId,[]);claims.get(c.rowId).push(c);}
 for(const group of claims.values())if(group.length>1)for(const c of group)if(c.allowReuse!==true)issues.push({boardId:c.boardId,kind:'reuse',message:'此产品也被其他画板选中；如果确实是同款多图，请勾选“允许选择其他画板已使用的产品”'});
 return issues;
}
function unusedRows(report,choices){const used=new Set(choices.filter(c=>c.action==='use').map(c=>c.rowId));return report.rows.filter(r=>!used.has(r.id));}
function availableProducts(report,choices,boardId,allowReuse=false){
 const own=choices.find(c=>String(c.boardId)===String(boardId)),used=new Set(choices.filter(c=>String(c.boardId)!==String(boardId)&&c.action==='use').map(c=>c.rowId));
 return report.rows.filter(r=>allowReuse||r.id===own?.rowId||!used.has(r.id));
}
// Reuse the already inspected product identities. A reset never scans Adobe again
// or guesses a different model merely because its price is the same.
function suggestChoices(report,choices){
 const current=new Map(choices.map(c=>[String(c.boardId),c])),used=new Set(choices.filter(c=>c.action==='use').map(c=>c.rowId));
 return report.boards.map(b=>{const before=current.get(String(b.boardId))||{boardId:b.boardId};if(['use','delete'].includes(before.action))return {...before};const ids=[b.rowId,...(b.candidates||[]).filter(c=>!c.modelConflict&&(c.exact||c.contained)).map(c=>c.rowId)].filter(Boolean),rowId=ids.find(id=>report.rows.some(r=>r.id===id)&&!used.has(id));if(rowId)used.add(rowId);return {...before,action:rowId?'use':'pending',rowId:rowId||'',allowReuse:false,reason:rowId?'已根据型号、配色与产品名预选，请核对':'尚无可安全预选的产品，请手动选择或跳过'};});
}
function placeholderFields(report,choices){
 const selected=new Set(choices.filter(c=>c.action==='use').map(c=>c.rowId));
 return report.rows.filter(r=>selected.has(r.id)).flatMap(r=>(r.fields||[]).filter(f=>f.role!=='gift'&&f.state!=='value').map(f=>({rowId:r.id,name:r.name,row:r.row,key:f.key,cell:f.cell||'',value:f.value,state:f.state})));
}
module.exports={skipUnconfirmed,reviewIssues,unusedRows,availableProducts,suggestChoices,placeholderFields};
