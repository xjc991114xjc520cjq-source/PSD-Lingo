const codes=new Set(['TASK_INTERRUPTED','NATIVE_PLAN_WORKFLOW','TASK_RUN_LIMIT']);
function errorDetails(error){return {...(error?.uncertain===true?{uncertain:true}:{}),...(codes.has(error?.code)?{errorCode:error.code}:{}),...(Number.isInteger(error?.fileIndex)?{fileIndex:error.fileIndex}:{})};}
function restoreError(value){const error=Error(String(value?.error||'软件操作失败'));return Object.assign(error,errorDetails({...value,code:value?.errorCode}),codes.has(value?.errorCode)?{code:value.errorCode}:{});}
function interrupted(message='任务已暂停、终止或收到新说明，未应用过期结果'){return Object.assign(Error(message),{code:'TASK_INTERRUPTED'});}
module.exports={errorDetails,restoreError,interrupted};
