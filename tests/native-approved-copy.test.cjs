const {test}=require('node:test'),assert=require('node:assert/strict');
const {nativeApprovedCopy}=require('../native-approved-copy.cjs');
const spans=text=>[{text,sourceStart:0}];
test('native text selects a unique approved passage and preserves only visual whitespace changes',()=>{
 const approved='标题: Alpha constructionSecond line\n小标题： Approved complete body.';
 const r=nativeApprovedCopy(approved,spans('Alpha construction\rSecond line'));
 assert.equal(r.target,'Alpha construction\rSecond line');assert.equal(approved.slice(...r.recordSlice),'Alpha constructionSecond line');
 assert.equal(nativeApprovedCopy('Alpha\r\nBeta',spans('Alpha\nBeta')).target,'Alpha\nBeta');
 assert.equal(nativeApprovedCopy('标题：标题一\n小标题：说明',spans('标题一')).target,'标题一');
});
test('native passage selection rejects invented copy, lost punctuation, numeric fragments and ambiguous matches',()=>{
 for(const [approved,target]of [['Price: 199 USD','99'],['Price: 199 USD','199 EUR'],['Headline: Full approved copy','Full copy'],['A: repeated\nB: repeated','repeated'],['Value: 3,55 mm','3.55 mm']])assert.throws(()=>nativeApprovedCopy(approved,spans(target)),/不能唯一/);
 const approved='A: repeated\nB: repeated',start=approved.lastIndexOf('repeated');assert.deepEqual(nativeApprovedCopy(approved,spans('repeated'),[start,start+8]).recordSlice,[start,start+8]);
 assert.throws(()=>nativeApprovedCopy(approved,spans('changed'),[start,start+8]),/不一致/);
 for(const slice of [[-1,3],[3,2],[0,999],[0,1.5]])assert.throws(()=>nativeApprovedCopy(approved,spans('repeated'),slice),/范围无效/);
});
test('native multi-record passage retains its join separator and exact provenance during incremental rebuild',()=>{
 const {makeArtboardPlan}=require('../photoshop-artboard-plan.cjs'),file={format:'PSB',width:200,height:200,artboards:[{id:1,name:'A',nativePath:[0],box:[0,0,200,200]}],layers:[{id:'native:a',name:'A',original:'Original',nativePath:[0,0],boardId:1,issues:[]}]},records=[{id:'a',target:'标题: Alpha',digest:'first'},{id:'b',target:'Beta',digest:'second'}];
 const args={nativeTextScanId:'scan',operation:'edit',boards:[{name:'A',templateId:1,changes:[{layerId:'native:a',recordIds:['a','b'],separator:'\n',spans:[{text:'Alpha\rBeta',sourceStart:0}],reason:'Approved contiguous passage'}]}]};
 const first=makeArtboardPlan(file,args,records),second=makeArtboardPlan(file,{...args,boards:first.boards},records);assert.equal(second.boards[0].changes[0].target,'Alpha\rBeta');assert.equal(second.boards[0].changes[0].separator,'\n');assert.deepEqual(second.boards[0].changes[0].sourceRecords.map(r=>r.id),['a','b']);
});
