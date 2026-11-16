// An absent receipt after native submission must never trigger a blind rewrite.
function missingReceipt(error,message='原生脚本已提交但没有完整回执，请先核对已有副本，不要重复执行'){
 return Object.assign(Error(message+'：'+String(error?.message||error||'结果缺失')),{uncertain:true});
}
module.exports={missingReceipt};
