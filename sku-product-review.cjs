// Review drafts are suggestions until the user saves; bulk actions never infer
// new product identities or delete artwork.
function skipUnconfirmed(report,choices,protectedIds=[]){
 const protect=new Set(protectedIds.map(String)),boards=new Map(report.boards.map(b=>[String(b.boardId),b]));
 return choices.map(c=>{const b=boards.get(String(c.boardId));if(!b||protect.has(String(c.boardId))||['skip','delete'].includes(c.action)||b.status==='proposed'&&c.action==='use')return {...c};return {...c,action:'skip',rowId:'',reason:'用户选择本轮跳过待核实画板，保留原稿'};});
}
function reviewIssues(report,choices){
 const issues=[],claims=new Map();for(const c of choices){if(!['use','skip','delete'].includes(c.action)){issues.push({boardId:c.boardId,kind:'pending',message:'请选择对应产品，或跳过此画板'});continue;}if(!c.reason?.trim())issues.push({boardId:c.boardId,kind:'reason',message:'请补充备注'});if(c.action==='delete'&&c.deleteConfirmed!==true)issues.push({boardId:c.boardId,kind:'delete',message:'请确认删除'});if(c.action!=='use')continue;const r=report.rows.find(r=>r.id===c.rowId);if(!r){issues.push({boardId:c.boardId,kind:'product',message:'请重新选择表格产品'});continue;}if(r.fields.some(f=>f.role!=='gift'&&f.state!=='value')&&c.placeholderPolicy!=='leave-unchanged')issues.push({boardId:c.boardId,kind:'placeholder',message:'请选择空白或“/”字段的处理方式'});if(!claims.has(c.rowId))claims.set(c.rowId,[]);claims.get(c.rowId).push(c);}
 for(const group of claims.values())if(group.length>1)for(const c of group)if(c.allowReuse!==true)issues.push({boardId:c.boardId,kind:'reuse',message:'同一产品用于多张图，请确认下方选项'});
 return issues;
}
function unusedRows(report,choices){const used=new Set(choices.filter(c=>c.action==='use').map(c=>c.rowId));return report.rows.filter(r=>!used.has(r.id));}
module.exports={skipUnconfirmed,reviewIssues,unusedRows};
