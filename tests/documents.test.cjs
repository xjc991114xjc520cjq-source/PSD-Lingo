const test=require('node:test');
const assert=require('node:assert/strict');
const JSZip=require('jszip');
const {readDocxText}=require('../document-reader.cjs');
const {recordsFromText}=require('../core.cjs');
async function docx(body){const zip=new JSZip();zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>');return zip.generateAsync({type:'nodebuffer'});}
test('Word soft line breaks and carriage returns remain real separators',async()=>{
  const buffer=await docx('<w:p><w:r><w:t>First</w:t><w:br/><w:t>Second</w:t><w:cr/><w:t>Third</w:t></w:r></w:p>');
  const text=await readDocxText(buffer);assert.equal(text,'First\nSecond\nThird\n\n');
  assert.deepEqual(recordsFromText(text,'word.docx').map(r=>r.target),['First','Second','Third']);
  assert.deepEqual(recordsFromText(text,'word.docx','paragraph').map(r=>r.target),['First\nSecond\nThird']);
});
test('Word styled runs concatenate without inserting words or removing authored spaces',async()=>{
  const buffer=await docx('<w:p><w:r><w:t xml:space="preserve">  Pokémon </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>Collaboration &amp; care</w:t></w:r></w:p>');
  assert.equal((await readDocxText(buffer)).trimEnd(),'  Pokémon Collaboration & care');
});
test('Word body paragraphs and table cells separate; field instructions and deletions are excluded',async()=>{
  const buffer=await docx('<w:p><w:r><w:instrText>INSTRUCTION</w:instrText><w:t>Visible</w:t></w:r><w:del><w:r><w:t>Deleted</w:t></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
  assert.deepEqual(recordsFromText(await readDocxText(buffer),'word.docx').map(r=>r.target),['Visible','Cell']);
});
