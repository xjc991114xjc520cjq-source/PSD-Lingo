const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateBoards,verifyDelivery}=require('../illustrator-delivery.cjs');
test('delivery refuses ambiguous names, invalid crops and missing selected artboards',async()=>{
 const board={name:'A',crop:[0,0,500,800]};validateBoards([board]);for(const b of [[],[board,board],[{...board,crop:[0,0,0,800]}],[{...board,crop:[0,NaN,500,800]}]])assert.throws(()=>validateBoards(b),/交付画板/);
 await assert.rejects(verifyDelivery({delivery:{reopened:true,boards:[board]}},{nativeImage:{},expectedBoards:[board,{name:'B',crop:[600,0,500,800]}]}),/数量/);
 await assert.rejects(verifyDelivery({delivery:{reopened:true,boards:[{...board,crop:[0,0,500,799]}]}},{nativeImage:{},expectedBoards:[board]}),/范围/);
});
