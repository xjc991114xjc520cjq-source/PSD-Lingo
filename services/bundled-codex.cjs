const path=require('node:path');
function bundledCodexPath({platform=process.platform,root=__dirname}={}){return platform==='darwin'?path.posix.join(root,'bin','codex','bin','codex'):'';}
function isBundledCodex(executable,options){return !!executable&&!!bundledCodexPath(options)&&path.resolve(executable)===path.resolve(bundledCodexPath(options));}
module.exports={bundledCodexPath,isBundledCodex};
