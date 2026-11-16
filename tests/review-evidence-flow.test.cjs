const {test}=require('node:test'),assert=require('node:assert/strict');
const {selectPreviewBoards}=require('../services/agent-artboards.cjs');
const {auditFailureSummary}=require('../services/audit-failure-summary.cjs');
test('global crop selects its containing board beyond the initial preview page',()=>{
 const entry={boards:Array.from({length:10},(_,i)=>({name:'B'+i,box:[i*1600,0,1500,1500]}))};
 assert.deepEqual(selectPreviewBoards(entry,{crop:[4801,1,1498,1498]}).map(b=>b.name),['B3']);
 assert.deepEqual(selectPreviewBoards(entry,{offset:3,limit:2}).map(b=>b.name),['B3','B4']);
 assert.throws(()=>selectPreviewBoards(entry,{crop:[1490,0,200,100]}),/完整落在一个画板/);
 assert.throws(()=>selectPreviewBoards(entry,{crop:[0,0,-1,100]}),/全局坐标/);
 assert.throws(()=>selectPreviewBoards({boards:[entry.boards[0],entry.boards[0]]},{crop:[1,1,20,20]}),/完整落在一个画板/);
});
test('repeated review uncertainty is summarized without losing detailed records or passing a defect',()=>{
 const audit={passed:false,boards:[{board:'Page',checks:[{id:'coverage',verdict:'uncertain',evidence:'Full page not visible'},{id:'hierarchy',verdict:'uncertain',evidence:'Full page not visible'}],skillReviews:[{id:'critique',verdict:'uncertain',evidence:'Full page not visible'}]}]},before=JSON.stringify(audit);
 const text=auditFailureSummary(audit);assert.equal(text.match(/Full page not visible/g).length,1);assert.match(text,/审验待确认/);assert.match(text,/3项/);assert.equal(JSON.stringify(audit),before);
 audit.boards[0].checks[0].verdict='fail';assert.match(auditFailureSummary(audit),/设计需修改/);assert.equal(auditFailureSummary({boards:[]}),undefined);
});
