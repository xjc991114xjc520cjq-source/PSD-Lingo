const test=require('node:test'),assert=require('node:assert/strict');
const {decodeBridgeOutput,backgroundScript}=require('../photoshop-preview.cjs');
test('Unicode cscript errors retain Chinese across byte chunks',()=>{const text='读取源 PSD 失败：无法打开文件，因为打开选项不正确';const bytes=Buffer.from(text,'utf16le');assert.equal(decodeBridgeOutput([bytes.subarray(0,13),bytes.subarray(13,26),bytes.subarray(26)]),text);});
test('preview script closes only its own temporary documents and reports the failed stage',()=>{const script=backgroundScript('D:/原稿.psd',[38,40],'D:/预览.png');assert(script.includes('stage="隐藏绑定原文"'));assert(script.includes('if(opened&&source)'));assert(script.includes('if(failure)throw failure'));assert(script.includes('l.visible=false'));});
