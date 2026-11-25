// Construct a source-only archive; never traverse work, Git, customer samples or credentials.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function main(){
 const root=path.resolve(__dirname,'..'),zip=new(require('jszip'))(),files=[];
 const forbidden=/(^|\/)(node_modules|bin|\.git|\.wrangler|private|work)(\/|$)|(^|\/)(\.env|\.dev\.vars)|\.(exe|dll|pem|key|pfx|psd|psb|ai|xlsx|log)$/i;
 async function add(relative){if(forbidden.test(relative))return;const file=path.join(root,relative),s=await fs.lstat(file);if(s.isSymbolicLink())throw Error('Source symlink rejected: '+relative);if(s.isDirectory()){for(const name of await fs.readdir(file))await add(relative+'/'+name);}else{zip.file(relative,await fs.readFile(file));files.push(relative);}}
 for(const name of await fs.readdir(root))if(name.endsWith('.cjs')||name==='package.json')await add(name);
 for(const folder of ['renderer','services','vendor','第三方许可'])await add(folder);
 for(const file of ['tools/mac-package-smoke.cjs','tools/mac-entitlements.plist','tests/macos-device-native.test.cjs','tests/file-identity.test.cjs','tests/macos-adobe.test.cjs'])await add(file);
 const output=path.join(root,'work/Sparkit-Mac-build-input.zip');await fs.mkdir(path.dirname(output),{recursive:true});
 const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});await fs.writeFile(output,bytes);
 await fs.writeFile(path.join(root,'work/mac-build-input-manifest.json'),JSON.stringify({files,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2));
 console.log(JSON.stringify({files:files.length,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
