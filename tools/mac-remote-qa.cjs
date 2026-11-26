// SSH entry point: only this task's source, profile and artifacts are used.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),session=path.dirname(root),logs=path.join(session,'logs');
const report={startedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,commands:[],modelCalls:0};
async function run(name,exe,args,{timeout=180000,env={}}={}){
 const file=path.join(logs,name+'.log'),output=await fs.open(file,'w');let data='';
 const child=spawn(exe,args,{cwd:root,env:{...process.env,CODEX_HOME:path.join(session,'data/codex-qa'),SPARKIT_KEYCHAIN_TEST_NAMESPACE:path.basename(session),...env},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{data+=b;void output.write(b);});child.stderr.on('data',b=>{data+=b;void output.write(b);});
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');setTimeout(()=>child.kill('SIGKILL'),3000).unref();},timeout);
 const code=await new Promise(resolve=>{child.on('error',e=>{data+=e.message;resolve(-1);});child.on('close',resolve);});clearTimeout(timer);await output.close();
 const result={name,exe,args,pid:child.pid,code,timedOut,log:file};report.commands.push(result);await fs.writeFile(path.join(logs,'qa-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(result));return {code,data};
}
async function main(){
 if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Apple Silicon Mac required');await fs.mkdir(logs,{recursive:true});
 const app=path.join(session,'packages/expanded/Payload/Sparkit.app');
 await run('system','/usr/bin/sw_vers',[]);await run('bundle-signature','/usr/bin/codesign',['--verify','--deep','--strict','--verbose=2',app]);
 await run('gatekeeper-app','/usr/sbin/spctl',['--assess','--type','execute','--verbose=2',app]);
 await run('gatekeeper-installer','/usr/sbin/spctl',['--assess','--type','install','--verbose=2',path.join(session,'packages/candidate.pkg')]);
 await run('bundle-plist','/usr/bin/plutil',['-p',path.join(app,'Contents/Info.plist')]);
 await run('quarantine','/usr/bin/xattr',['-l',app]);
 await run('icon','/usr/bin/sips',['-s','format','png',path.join(app,'Contents/Resources/sparkit.icns'),'--out',path.join(logs,'app-icon.png')]);
 const helper=path.join(app,'Contents/Resources/app/bin/sparkit-device');
 const capability=spawn(helper,[],{stdio:['pipe','pipe','pipe']});let caps='';capability.stdout.on('data',b=>caps+=b);capability.stdin.end('{"op":"capabilities"}\n');await new Promise(r=>capability.on('close',r));await fs.writeFile(path.join(logs,'native-capabilities.json'),caps);
 for(const host of ['photoshop','illustrator']){try{await require('../services/macos-adobe.cjs').findMacAdobe(host);report[host]='installed';}catch(e){report[host]={message:e.message,uncertain:e.uncertain,phase:e.nativePhase};}}
 const Codex=require('../services/codex-app-session.cjs').CodexAppSession,home=path.join(session,'data/codex-qa');await fs.mkdir(home,{recursive:true});
 const cli=new Codex({executable:path.join(app,'Contents/Resources/app/bin/codex/bin/codex'),env:{...process.env,CODEX_HOME:home}});
 try{await cli.initialize();const a=await cli.request('account/read',{refreshToken:false});await cli.request('config/read',{includeLayers:false});report.codex={initialized:true,isolatedAccountEmpty:!a.account,modelCalls:0};}finally{cli.close();}
 const excluded=new Set(['macos-device-native.test.cjs','updater-windows.test.cjs','services.test.cjs','codex-settings.test.cjs']);
 report.unitExcluded=[...excluded];
 const tests=(await fs.readdir(path.join(root,'tests'))).filter(n=>n.endsWith('.test.cjs')&&!excluded.has(n)).map(n=>'tests/'+n);
 await run('node-regression',process.execPath,['--test','--test-reporter=tap',...tests],{timeout:240000});
 const electron=require('electron');
 for(const name of ['startup-first-paint','agent','work-records','advanced-review','typography-ui','typography-assistant','select-controls','sku-product-ui'])await run('ui-'+name,electron,['tests/'+name+'.electron.cjs'],{timeout:120000});
 report.automatedPassed=report.commands.filter(c=>c.name==='node-regression'||c.name.startsWith('ui-')).every(c=>c.code===0&&!c.timedOut);report.gatekeeperAccepted=report.commands.filter(c=>c.name.startsWith('gatekeeper-')).every(c=>c.code===0);if(!report.automatedPassed)process.exitCode=1;
 report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(logs,'qa-report.json'),JSON.stringify(report,null,2));
}
main().catch(async error=>{console.error(error);report.fatal=error.stack;await fs.mkdir(logs,{recursive:true});await fs.writeFile(path.join(logs,'qa-report.json'),JSON.stringify(report,null,2));process.exitCode=1;});
