const {test}=require('node:test'),assert=require('node:assert/strict');
const {joinGiftRows}=require('../services/sku-template-gift-source.cjs');
const fixture=()=>({id:'approved-map',approved:{approvalDigest:'keep-price-approval',boards:[{boardId:1,action:'use',code:'00123',productName:'Short name',fields:[{key:'price',value:'199'}]},{boardId:2,action:'skip'}]}});
const config={field:'Gift',sheet:'Daily',workbook:{fingerprint:'actual-workbook'}};
const row=(code,value)=>({code,name:'Different long name',fields:[{key:'Gift',role:'gift',cell:'E2',value,state:value?'value':'missing'}]});
test('supplemental gift table joins exact product codes without changing approved prices, mappings or skips',()=>{
 const m=fixture(),r=joinGiftRows(m,[row('00123','Cap 价值79元')],config);
 assert.equal(r.approved.approvalDigest,m.approved.approvalDigest);assert.equal(r.approved.boards[0].fields[0],m.approved.boards[0].fields[0]);assert.equal(r.approved.boards[0].fields[1].value,'Cap 价值79元');assert.equal(r.approved.boards[0].fields[1].sourceWorkbookFingerprint,'actual-workbook');assert.equal(r.approved.boards[1],m.approved.boards[1]);assert.equal(m.approved.boards[0].fields.length,1);
});
test('gift joins reject conflicting duplicate codes, missing unapproved fallback and overwriting existing gift roles',()=>{
 assert.throws(()=>joinGiftRows(fixture(),[row('00123','Cap'),row('00123','Mat')],config),/冲突/);
 assert.throws(()=>joinGiftRows(fixture(),[row('123','Cap')],config),/未找到/);
 const empty=joinGiftRows(fixture(),[],{...config,unmatchedPolicy:'none'});assert.equal(empty.approved.boards[0].fields[1].state,'missing');
 assert.throws(()=>joinGiftRows(empty,[],{...config,unmatchedPolicy:'none'}),/已有/);
});
