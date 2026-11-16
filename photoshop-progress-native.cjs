// Progress is telemetry, never a prerequisite for an artwork operation.
const progressNative=String.raw`
var progressWarnings=[],progressWriteFailures=0;
function write(p,v){var message='';for(var attempt=0;attempt<3;attempt++){var f=new File(p);f.encoding='UTF8';try{if(!f.open('w'))throw Error(f.error||'无法打开文件');if(f.write(enc(v))===false)throw Error(f.error||'写入失败');return;}catch(e){message=e.message;}finally{try{f.close();}catch(_){}}}throw Error('无法写入结果文件 '+p+'：'+message);}
function checkpoint(s,details){stage=s;var event={stage:s,at:String(new Date()),elapsedMs:(new Date()).getTime()-startedAt,details:details||null};
 try{write(folder+'/native-progress.json',event);}catch(e){progressWriteFailures++;if(progressWarnings.length<4)progressWarnings.push(e.message);}
 var trace=new File(folder+'/native-progress.jsonl');trace.encoding='UTF8';try{if(!trace.open('a'))throw Error(trace.error||'无法打开进度历史');if(trace.writeln(enc(event))===false)throw Error(trace.error||'无法写入进度历史');}catch(e){progressWriteFailures++;if(progressWarnings.length<4)progressWarnings.push(e.message);}finally{try{trace.close();}catch(_){}}
 if(new File(folder+'/cancel.request').exists)throw Error('用户请求取消，正在清理工作副本');}
`;
module.exports={progressNative};
