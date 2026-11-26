const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
async function main(){
 const session=path.resolve(__dirname,'../..'),source=path.join(session,'packages/expanded5/Payload/Sparkit.app'),directory=await fs.mkdtemp(path.join(session,'packages/repair-qa-')),app=path.join(directory,'中文 空格','Sparkit.app'),out=path.join(directory,'repair');
 await fs.mkdir(path.dirname(app),{recursive:true});await exec('/usr/bin/ditto',[source,app]);const generated=await require('./mac-startup-repair.cjs').generate(source,out),command=generated.command;
 await exec('/bin/zsh',['-n',command]);
 const quarantine='0081;00000000;Sparkit-QA;',attribute=async p=>(await exec('/usr/bin/xattr',['-p','com.apple.quarantine',p])).stdout;
 const sentinel=path.join(directory,'other-app');await fs.writeFile(sentinel,'unrelated');await exec('/usr/bin/xattr',['-w','com.apple.quarantine',quarantine,sentinel]);
 await exec('/usr/bin/xattr',['-w','com.apple.quarantine',quarantine,app]);await exec('/usr/bin/xattr',['-w','com.sparkit.qa.keep','keep',app]);
 const fixed=await exec('/bin/zsh',[command,'--no-launch',app]);assert.match(fixed.stdout,/SPARKIT_REPAIR_CHECK_OK/);
 await assert.rejects(attribute(app));assert.equal((await exec('/usr/bin/xattr',['-p','com.sparkit.qa.keep',app])).stdout.trim(),'keep');assert.equal((await attribute(sentinel)).trim(),quarantine);await exec('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 const alias=path.join(directory,'alias.app');await fs.symlink(app,alias);await assert.rejects(exec('/bin/zsh',[command,'--no-launch',alias]));
 await fs.appendFile(path.join(app,'Contents/Resources/app/main.cjs'),'\n// tampered test\n');await exec('/usr/bin/xattr',['-w','com.apple.quarantine',quarantine,app]);await assert.rejects(exec('/bin/zsh',[command,'--no-launch',app]));assert.equal((await attribute(app)).trim(),quarantine);
 const report={passed:true,source,qaDirectory:directory,commandSha256:generated.commandSha256,chineseAndSpacePaths:true,quarantineRemovedOnlyAfterValidation:true,signaturePreserved:true,otherAttributePreserved:true,unrelatedFilePreserved:true,symlinkRejected:true,tamperingRejectedAndQuarantineRetained:true,appleNotarized:false};await fs.writeFile(path.join(session,'logs/startup-repair-qa.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
