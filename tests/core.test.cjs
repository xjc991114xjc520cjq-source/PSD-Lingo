const test = require('node:test');
const assert = require('node:assert/strict');
const {hash,parseCsv,recordsFromRows,recordsFromText,resplitRecords,validatePlan,jsxForPlan} = require('../core.cjs');
const {extractLayers} = require('../metadata.cjs');
function plan() {
  const r = {id:'row1',target:'Exact target, no rewriting\nSecond line',digest:hash('Exact target, no rewriting\nSecond line')};
  return {version:1,records:[r],files:[{path:'C:/test/source.psd',name:'source.psd',fingerprint:'abc',jobs:[{layerId:42,recordId:'row1',target:r.target,original:'原文',font:'SegoeUI',size:20,minSize:15,box:[10,10,200,60]}]}]};
}
test('CSV quoted commas, embedded newlines and BOM retain exact text',()=>{
  const records=recordsFromRows(parseCsv('\uFEFF编号,原文,目标文案\r\na,原文," exact, text\nsecond "\r\n'),'copy.csv');
  assert.equal(records[0].target,' exact, text\nsecond ');assert.equal(records[0].digest,hash(records[0].target));
});
test('TSV retains commas inside unquoted targets',()=>{assert.equal(recordsFromRows(parseCsv('编号\t原文\t目标文案\na\t原\tone, two'),'copy.tsv')[0].target,'one, two');});
test('TXT preserves paragraph whitespace',()=>{assert.equal(recordsFromText('  exact text  \n\nnext','copy.txt')[0].target,'  exact text  ');});
test('consecutive lines are separate copy records without blank-line requirement',()=>{
  const lines=['Fog through the shell','Pokémon Collaboration','ATK in-house 54 series','SharkMAX mouse solution','NORDIC54 Series Main Controller','Excellent energy efficiency ratio','Trendy design, truly outstanding'];
  const records=recordsFromText(lines.join('\n'),'copy.docx');assert.deepEqual(records.map(r=>r.target),lines);
  assert.equal(records[6].source,'copy.docx · 第 7 行');assert.equal(records[1].digest,hash(lines[1]));
});
test('line splitting handles Windows, old Mac and Unicode line breaks with exact spaces',()=>{
  assert.deepEqual(recordsFromText('\uFEFF  One  \r\n\r\nTwo\rThree\u2028Four\n','copy.txt').map(r=>r.target),['  One  ','Two','Three','Four']);
  assert.equal(recordsFromText('one\r\n\r\ntwo','copy.txt')[1].source,'copy.txt · 第 3 行');
});
test('paragraph mode keeps a multi-line slogan intact, including CRLF',()=>{
  const records=recordsFromText('first\r\nsecond\r\n\r\n  third  ','copy.docx','paragraph');
  assert.deepEqual(records.map(r=>r.target),['first\r\nsecond','  third  ']);
  assert.throws(()=>recordsFromText('text','copy','invalid'));
});
test('old combined records can be split without assigning their source phrase to every line',()=>{
  const old={id:'old',key:'1',source:'copy.docx · 第 1 段',original:'源文',target:'One\nTwo',digest:hash('One\nTwo')};
  const split=resplitRecords([old],'line');assert.deepEqual(split.map(r=>r.target),['One','Two']);
  assert.ok(split.every(r=>r.id!==old.id&&r.original===''&&r.digest===hash(r.target)));
  assert.deepEqual(resplitRecords([old],'paragraph'),[old]);
});
test('CSV missing target header and malformed quotes are rejected',()=>{assert.throws(()=>recordsFromRows(parseCsv('id,text\na,x'),'x'));assert.throws(()=>parseCsv('目标文案\n"unclosed'));});
test('altered wording cannot pass an otherwise valid plan',()=>{const p=plan();validatePlan(p);p.files[0].jobs[0].target='invented';assert.throws(()=>validatePlan(p),/文档原文/);});
test('changed document digest, duplicate layers and invalid font limits are rejected',()=>{
  let p=plan();p.records[0].target+='x';assert.throws(()=>validatePlan(p),/校验/);
  p=plan();p.files[0].jobs.push({...p.files[0].jobs[0]});assert.throws(()=>validatePlan(p),/重复/);
  p=plan();p.files[0].jobs[0].minSize=21;assert.throws(()=>validatePlan(p),/字号/);
});
test('JSX contains exact text as data and protects originals',()=>{
  const p=plan();const s=jsxForPlan(p);assert.ok(s.includes(JSON.stringify(p)));assert.ok(s.includes('original.duplicate'));assert.ok(s.includes('while (out.exists)'));assert.ok(s.includes('DONOTSAVECHANGES'));assert.ok(!s.includes('SaveOptions.SAVECHANGES'));
});
test('PSD preflight blocks hidden group, paragraph text and mixed styles',()=>{
  const base={id:1,name:'title',left:10,top:10,right:110,bottom:50,text:{text:'原文',shapeType:'point',style:{font:{name:'SegoeUI'},fontSize:20}}};
  assert.equal(extractLayers({children:[base]})[0].supported,true);
  assert.equal(extractLayers({children:[{name:'group',hidden:true,children:[base]}]})[0].supported,false);
  assert.equal(extractLayers({children:[{...base,text:{...base.text,shapeType:'box'}}]})[0].supported,false);
  assert.equal(extractLayers({children:[{...base,text:{...base.text,styleRuns:[{length:1,style:{fontSize:20}},{length:1,style:{fontSize:30}}]}}]})[0].supported,false);
});
