const path=require('node:path').win32;
// A successful PSD/PSB replacement can retire only the old size admission error.
// It must not erase failed imports of other artwork or native execution errors.
function resolvedSourceSizeErrors(task,successfulArgs,result){
 const current=task.files?.find(f=>f.id===successfulArgs?.fileId);if(!current||!Array.isArray(result?.files)||!result.files.some(f=>path.normalize(f.path||'').toLowerCase()===path.normalize(current.path).toLowerCase()))return [];
 const stem=p=>path.join(path.dirname(p),path.basename(p,path.extname(p))).toLowerCase();
 const errors=[];let args=null;
 for(const h of task.history||[]){if(h.type==='tool_start')args=h.tool==='import_source'?h.args:null;else if(h.type==='tool_error'&&h.tool==='import_source'&&args&&/^(PSD|PSB) 单文件上限 /.test(h.error||'')){const prior=task.files.find(f=>f.id===args.fileId);if(prior&&/\.(psd|psb)$/i.test(prior.path)&&/\.(psd|psb)$/i.test(current.path)&&stem(prior.path)===stem(current.path))errors.push('import_source:'+JSON.stringify({fileId:args.fileId}));}}
 return errors;
}
module.exports={resolvedSourceSizeErrors};
