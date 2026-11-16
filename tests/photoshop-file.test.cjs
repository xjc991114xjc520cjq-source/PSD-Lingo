const {test}=require('node:test'),assert=require('node:assert/strict');
const {inspectPhotoshopFile,previewDimensions,needsNativePhotoshop}=require('../photoshop-file.cjs');
const PSD_MAX_BYTES=300*1024**2,PSB_MAX_BYTES=6*1024**3;
function header(version=2,width=1080,height=40000){const b=Buffer.alloc(26);b.write('8BPS');b.writeUInt16BE(version,4);b.writeUInt32BE(height,14);b.writeUInt32BE(width,18);b.writeUInt16BE(8,22);b.writeUInt16BE(3,24);return b;}
test('PSB header accepts tall canvas and larger file allocation without decoding pixels',()=>{
 assert.deepEqual(inspectPhotoshopFile(header(),PSD_MAX_BYTES+1),{format:'PSB',width:1080,height:40000});
 assert.throws(()=>inspectPhotoshopFile(header(1,1080,40000),100),/画布/);
 assert.equal(inspectPhotoshopFile(header(),PSB_MAX_BYTES+1).format,'PSB');
});
test('truncated, unknown version, colour depth and pixel bounds fail before full-file allocation',()=>{
 assert.throws(()=>inspectPhotoshopFile(Buffer.from('8BPS'),26),/有效/);
 assert.throws(()=>inspectPhotoshopFile(header(3),100),/版本/);
 const b=header();b.writeUInt16BE(16,22);assert.throws(()=>inspectPhotoshopFile(b,100),/8 位 RGB/);
 assert.deepEqual(inspectPhotoshopFile(header(2,20000,20000),100),{format:'PSB',width:20000,height:20000});
 assert.throws(()=>inspectPhotoshopFile(header(2,300001,100),100),/300000/);
 assert.equal(inspectPhotoshopFile(header(1,800,1000),PSD_MAX_BYTES+1).format,'PSD');
});
test('preview backing canvases stay within browser limits while original geometry is untouched',()=>{
 for(const [w,h] of [[1080,4320],[1080,40000],[500,300000],[20000,10000]]){
  const p=previewDimensions(w,h);assert.ok(p.width<=16384&&p.height<=16384&&p.width*p.height<=6000000);
  assert.ok(Math.abs(p.width/w-p.height/h)<=1/Math.min(w,h));
 }
 assert.deepEqual(previewDimensions(800,1000),{width:800,height:1000});
});

test('PSD/PSB accept safe file sizes beyond historical ceilings',()=>{
 for(const bytes of [2,4,6,16,64].map(n=>n*1024**3))assert.equal(inspectPhotoshopFile(header(),bytes).format,'PSB');
 for(const bytes of [NaN,Infinity,-1,26.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>inspectPhotoshopFile(header(),bytes));
});

test('valid sparse PSD artboards are not rejected by whole-document pixel area',()=>{
 for(const [width,height] of [[15000,10000],[30000,30000]])assert.deepEqual(inspectPhotoshopFile(header(1,width,height),235247381),{format:'PSD',width,height});
 assert.throws(()=>inspectPhotoshopFile(header(1,0,10000),100),/尺寸无效/);
 assert.throws(()=>inspectPhotoshopFile(header(1,30001,10000),100),/30001.*30000/);
 const preview=previewDimensions(30000,30000);assert.ok(preview.width*preview.height<=6000000);
});
