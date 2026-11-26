// Generate a self-contained repair command from a previously SHA-verified app.
// Pin its code, seal and native helpers; never trust metadata supplied by a target.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util'),exec=promisify(execFile);
const quote=value=>"'"+value.replace(/'/g,"'\\''")+"'";
async function generate(app,out){
 if(process.platform!=='darwin')throw Error('Generate on Mac from the original verified bundle');
 const plist=path.join(app,'Contents/Info.plist'),read=async key=>(await exec('/usr/libexec/PlistBuddy',['-c','Print :'+key,plist])).stdout.trim();
 const identifier=await read('CFBundleIdentifier'),version=await read('CFBundleShortVersionString');if(identifier!=='com.sparkit.desktop')throw Error('Wrong product');
 await exec('/usr/bin/codesign',['--verify','--deep','--strict',app]);
 const files=['Contents/Info.plist','Contents/MacOS/Sparkit','Contents/_CodeSignature/CodeResources','Contents/Resources/app/main.cjs','Contents/Resources/app/bin/sparkit-device','Contents/Resources/app/bin/codex/bin/codex'];
 const hashes={};for(const relative of files)hashes[relative]=crypto.createHash('sha256').update(await fs.readFile(path.join(app,relative))).digest('hex');
 const checks=Object.entries(hashes).map(([relative,hash])=>`check_hash ${quote(relative)} ${quote(hash)}`).join('\n');
 const script=`#!/bin/zsh
set -eu
set -o pipefail
fail(){ print -r -- "$1" >&2; exit 1; }
HERE="\${0:A:h}"
CHECK_ONLY=0
if [[ "\${1:-}" == '--no-launch' ]]; then CHECK_ONLY=1; shift; fi
APP="\${1:-}"
if [[ -z "$APP" && -d '/Applications/Sparkit.app' ]]; then APP='/Applications/Sparkit.app'; fi
if [[ -z "$APP" && -d "$HOME/Applications/Sparkit.app" ]]; then APP="$HOME/Applications/Sparkit.app"; fi
if [[ -z "$APP" && -d "$HERE/Sparkit.app" ]]; then APP="$HERE/Sparkit.app"; fi
[[ -d "$APP" && ! -L "$APP" ]] || fail '请指定当前测试版 Sparkit.app；不处理符号链接或不存在的应用。'
APP="\${APP:A}"
ID=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist") || fail '应用信息读取失败。'
VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist") || fail '版本读取失败。'
[[ "$ID" == ${quote(identifier)} && "$VERSION" == ${quote(version)} ]] || fail '产品或版本不匹配；未修改隔离属性。'
/usr/bin/codesign --verify --deep --strict "$APP" || fail '签名完整性失败；未修改隔离属性，请重新取得原包。'
check_hash(){
 local file="$APP/$1" expected="$2" actual
 [[ -f "$file" && ! -L "$file" ]] || fail '关键文件不存在或为符号链接。'
 actual=$(/usr/bin/shasum -a 256 "$file") || fail '文件校验失败。'
 [[ "\${actual%% *}" == "$expected" ]] || fail '文件不属于绑定的测试包；未修改隔离属性。'
}
${checks}
print -r -- "校验通过，仅处理：$APP"
ATTRIBUTES=$(/usr/bin/xattr -r "$APP") || fail '无法读取应用属性。'
if [[ "$ATTRIBUTES" == *com.apple.quarantine* ]]; then
 /usr/bin/xattr -dr com.apple.quarantine "$APP" || fail '下载隔离移除失败。'
fi
/usr/bin/codesign --verify --deep --strict "$APP" || fail '处理后的签名检查失败。'
if [[ "$CHECK_ONLY" == '1' ]]; then print -r -- 'SPARKIT_REPAIR_CHECK_OK'; exit 0; fi
/usr/bin/open "$APP" || fail '系统未能打开应用，请保留错误信息。'
print -r -- '已发起打开灵搭 Sparkit。此操作不代表 Apple 签名或公证通过。'
`;
 await fs.mkdir(out,{recursive:true});const command=path.join(out,'Sparkit-首次启动修复.command');await fs.writeFile(command,script,{mode:0o755});await fs.chmod(command,0o755);
 const manifest={identifier,version,hashes,commandSha256:crypto.createHash('sha256').update(script).digest('hex'),appleNotarized:false};await fs.writeFile(path.join(out,'startup-repair-manifest.json'),JSON.stringify(manifest,null,2));
 const guide='本工具仅适用于同目录清单绑定的 Sparkit 测试包。把 Sparkit.app 与本 command 放在同一文件夹后运行；也可由开发人员通过 SSH 指定应用路径执行。先检查产品、版本、完整性签名和六个关键文件 SHA256，全部通过才移除此应用的 com.apple.quarantine。不会关闭 Gatekeeper、重签名、清除其他属性或修改用户数据。这是本机测试放行，不是 Apple 签名公证；修复脚本本身若被 Finder 拦截，可让开发人员通过已有 SSH 执行。\n';
 await fs.writeFile(path.join(out,'启动修复说明.txt'),guide);
 const zip=new(require('jszip'))();zip.file(path.basename(command),script,{unixPermissions:0o100755});zip.file('启动修复说明.txt',guide,{unixPermissions:0o100644});zip.file('startup-repair-manifest.json',JSON.stringify(manifest,null,2),{unixPermissions:0o100644});
 await fs.writeFile(path.join(out,'Sparkit-Mac-启动修复.zip'),await zip.generateAsync({type:'nodebuffer',platform:'UNIX',compression:'DEFLATE'}));
 return {command,...manifest};
}
if(require.main===module)generate(path.resolve(process.argv[2]),path.resolve(process.argv[3])).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={generate};
