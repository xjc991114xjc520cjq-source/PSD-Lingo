const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),JSZip=require('jszip');
const {readPhotoshopInput}=require('../photoshop-import.cjs');
const {createDocumentReader}=require('../services/assistant-document.cjs');
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sparkit-large-input-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
test('PSD above 300 MiB routes through the actual import loader without allocating file bytes or changing source',async t=>{
 const dir=await temp(t),file=path.join(dir,'large.psd'),header=Buffer.alloc(26);header.write('8BPS');header.writeUInt16BE(1,4);header.writeUInt32BE(800,14);header.writeUInt32BE(1200,18);header.writeUInt16BE(8,22);header.writeUInt16BE(3,24);
 const handle=await fs.open(file,'w');await handle.write(header);await handle.truncate(301*1024**2);await handle.close();const before=await fs.stat(file);let native=0;
 const r=await readPhotoshopInput(file,{read:()=>assert.fail('large PSD must not use readFile'),native:async info=>{native++;assert.equal(info.stat.size,before.size);return {metadata:{width:1200,height:800,bitsPerChannel:8,colorMode:3,layers:[]}};}});
 assert.equal(native,1);assert.equal(r.format,'PSD');assert.equal(r.bytes,undefined);assert.match(r.fingerprint,/^[a-f0-9]{64}$/);assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);
});
test('native loader covers huge PSB sizes and refuses changed or mismatching native metadata',async()=>{
 const info={format:'PSB',width:100,height:100,stat:{size:12*1024**3}},metadata={width:100,height:100,bitsPerChannel:8,colorMode:3};
 const deps={inspect:async()=>info,checksum:async()=> 'stable',read:()=>assert.fail('no whole-file allocation'),native:async()=>({metadata})};assert.equal((await readPhotoshopInput('huge.psb',deps)).format,'PSB');
 let n=0;await assert.rejects(readPhotoshopInput('huge.psb',{...deps,checksum:async()=>String(n++)}),/变化/);
 await assert.rejects(readPhotoshopInput('huge.psb',{...deps,native:async()=>({metadata:{...metadata,width:101}})}),/变化/);
});
test('long UTF8 documents paginate without dropped or split multilingual characters',async t=>{
 const dir=await temp(t),file=path.join(dir,'text.txt'),text='价格😀测试俄文Привет'.repeat(80),reader=createDocumentReader();await fs.writeFile(file,text);let offset=0,result='';do{const r=await reader(file,{textOffset:offset,textLimit:17});result+=r.text;assert.ok(!r.text.includes('\ufffd'));offset=r.nextTextOffset;}while(offset!==null);assert.equal(result,text);
 const h=await fs.open(file,'r+');try{await h.truncate(21*1024**2);}finally{await h.close();}const large=await reader(file);assert.equal(large.totalBytes,21*1024**2);assert.ok(large.nextTextOffset>0);assert.ok(large.text.length<=120000);
});
test('Word body above former 20 MiB ceiling remains readable and explicitly paginated',async t=>{
 const dir=await temp(t),file=path.join(dir,'large.docx'),zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><!--'+' '.repeat(21*1024**2)+'--><w:p><w:r><w:t>标题😀尾部内容</w:t></w:r></w:p></w:body></w:document>');await fs.writeFile(file,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));const reader=createDocumentReader();let offset=0,text='';do{const r=await reader(file,{textOffset:offset,textLimit:5});text+=r.text;offset=r.nextTextOffset;}while(offset!==null);assert.equal(text.trim(),'标题😀尾部内容');
});
test('SKU mapping accepts XLSX above 32 MiB and worksheets above the former XML budget',async t=>{
 const dir=await temp(t),source=path.join(dir,'source.psb'),workbook=path.join(dir,'large.xlsx'),zip=new JSZip();
 await fs.writeFile(source,require('ag-psd').writePsdBuffer({width:10,height:10,children:[{id:10,name:'N9白色',children:[],artboard:{rect:{top:0,left:0,bottom:10,right:10}}}]},{psb:true}));
 zip.file('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="活动" r:id="s"/></sheets></workbook>');zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="s" Target="worksheets/sheet1.xml"/></Relationships>');
 zip.file('xl/worksheets/sheet1.xml','<worksheet><!--'+' '.repeat(33*1024**2)+'--><sheetData><row><c r="A2" t="inlineStr"><is><t>N9白色</t></is></c><c r="C2"><v>199</v></c></row></sheetData></worksheet>',{compression:'DEFLATE'});zip.file('xl/media/unused.bin',Buffer.alloc(33*1024**2));await fs.writeFile(workbook,await zip.generateAsync({type:'nodebuffer'}));
 assert.ok((await fs.stat(workbook)).size>32*1024**2);const store=require('../services/sku-product-mappings.cjs').createProductMappings(()=>path.join(dir,'mappings'));const r=await store.analyze({source,workbook,selection:{sheet:'活动',fields:[{key:'价格',column:'C'}]}});assert.equal(r.report.rows[0].fields[0].value,'199');assert.equal(r.report.boards[0].rowId,'活动!A2');assert.equal((await store.read(r.id)).report.identityDigest,r.report.identityDigest);
});
