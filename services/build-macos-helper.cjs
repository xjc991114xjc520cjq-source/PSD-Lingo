const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('此构建需在 Apple 芯片 Mac 上执行');
const output=path.join(__dirname,'bin','sparkit-device');
fs.mkdirSync(path.dirname(output),{recursive:true});
execFileSync('/usr/bin/xcrun',['swiftc','-O','-target','arm64-apple-macosx13.0','-framework','Security','-framework','CryptoKit',path.join(__dirname,'macos-device.swift'),'-o',output],{stdio:'inherit'});
console.log('Mac helper compiled. Signing and real Keychain verification are still required.');
