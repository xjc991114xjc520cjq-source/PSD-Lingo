const {test}=require('node:test'),assert=require('node:assert/strict'),JSZip=require('jszip');
const {readTranslationWorkbook,recordsFromWorkbook}=require('../translation-workbook.cjs');
const {productRows,matchProducts,confirmMapping}=require('../sku-product-matching.cjs');
async function book(raw='309.64999999999998',format='General',type='n',formula=''){
 const z=new JSZip();
 z.file('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Prices" r:id="s"/></sheets></workbook>');
 z.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="s" Target="worksheets/s.xml"/></Relationships>');
 z.file('xl/styles.xml',`<styleSheet><numFmts><numFmt numFmtId="178" formatCode="${format.replaceAll('&','&amp;').replaceAll('"','&quot;')}"/></numFmts><cellXfs><xf numFmtId="178"/></cellXfs></styleSheet>`);
 z.file('xl/worksheets/s.xml',`<worksheet><sheetData><row><c r="A2" t="inlineStr"><is><t>Keyboard</t></is></c><c r="C2" t="${type}" s="0">${formula?`<f>${formula}</f>`:''}<v>${raw}</v></c></row></sheetData></worksheet>`);
 return readTranslationWorkbook(await z.generateAsync({type:'nodebuffer'}));
}
const selection={sheet:'Prices',nameColumn:'A',codeColumn:'B',rowStart:2,rowEnd:2,fields:[{key:'price',column:'C',role:'price'}]};
test('actual XLSX numeric storage artifacts normalize without a fixed decimal count',async()=>{
 for(const [raw,expected]of [['309.64999999999998','309.65'],['279.14999999999998','279.15'],['544.79999999999995','544.8'],['305.14999999999998','305.15'],['265.14999999999998','265.15'],['0','0'],['1.23456789012345','1.23456789012345'],['1.23456789e-7','1.23456789e-7']]){
  const b=await book(raw),c=b.sheets[0].cells[1];assert.equal(c.value,expected);assert.equal(c.numeric.raw,raw);assert.equal(productRows(b,selection)[0].fields[0].value,expected);
 }
});
test('explicit XLSX precision, grouping, currency and scientific formats are respected',async()=>{
 for(const [raw,fmt,expected]of [['1.23456','0.0000','1.2346'],['0','0.00','0.00'],['1234.5','"$"#,##0.00','$1,234.50'],['1234','0.00E+00','1.23E+03'],['12','00000','00012']])assert.equal((await book(raw,fmt)).sheets[0].cells[1].value,expected);
 const text=(await book('001234567890123456789','0.00','str')).sheets[0].cells[1];assert.equal(text.value,'001234567890123456789');assert.equal(text.numeric,undefined);
});
test('cached formulas keep provenance and are not recalculated',async()=>{
 const b=await book('309.64999999999998','0.00','n','A1*0.85'),field=productRows(b,selection)[0].fields[0];assert.equal(field.value,'309.65');assert.equal(field.numeric.formula,'A1*0.85');assert.equal(field.formula,true);
 const record=recordsFromWorkbook(b,{sheet:'Prices',sourceColumns:'A',targetColumns:'C',rowStart:2,rowEnd:2},'book.xlsx').records[0];assert.deepEqual(record.context.numeric,field.numeric);
});
test('format or raw cache changes invalidate identity and approval even when display stays the same',async()=>{
 const reports=[];for(const [raw,fmt]of [['309.64999999999998','General'],['309.65','General'],['309.65','0.00']])reports.push(matchProducts([{id:1,name:'Keyboard'}],productRows(await book(raw,fmt),selection)));
 const approvals=reports.map(r=>confirmMapping(r,{identityDigest:r.identityDigest,choices:[{boardId:1,rowId:r.rows[0].id,action:'use',reason:'confirmed'}]}));assert.equal(new Set(reports.map(r=>r.identityDigest)).size,3);assert.equal(new Set(approvals.map(a=>a.approvalDigest)).size,3);
});
test('dates, percent and numeric errors cannot silently become approved prices',async()=>{
 for(const fmt of ['0%','m/d/yy']){const b=await book('0.5',fmt);assert.throws(()=>productRows(b,selection),/价格字段/);}
 for(const [raw,type]of [['NaN','n'],['#DIV/0!','e']]){const b=await book(raw,'General',type);assert.throws(()=>productRows(b,selection),/缓存|公式错误/);}
});
