const test = require('node:test');
const assert = require('node:assert/strict');
const {extractLayers} = require('../metadata.cjs');
function layer(transform, extra = {}) {
  return extractLayers({children:[{id:1,left:10,top:20,right:210,bottom:70,...extra,
    text:{text:'测试',shapeType:'point',transform,style:{font:{name:'MicrosoftYaHei'},fontSize:20,leading:24}}} ]})[0];
}
test('positive text scaling supports effective font size and original proportions', () => {
  const l=layer([1.5,0,0,1.25,10,20]);
  assert.equal(l.supported,true);assert.equal(l.size,25);assert.equal(l.minSize,18.75);
  assert.equal(l.leading,30);assert.equal(l.aspectScale,1.2);
  assert.equal(layer([.5,0,0,.5,10,20]).size,10);
});
test('real rotation, shear, reflection and invalid transforms remain blocked', () => {
  for(const t of [[1,.1,0,1,0,0],[1,0,.1,1,0,0],[-1,0,0,1,0,0],[0,0,0,1,0,0],[NaN,0,0,1,0,0]]) {
    assert.equal(layer(t).supported,false);
    assert.ok(layer(t).issues.some(x=>x.includes('旋转、倾斜或镜像')));
  }
});
test('scaling does not remove independent hidden and locked restrictions', () => {
  assert.deepEqual(layer([2,0,0,2,0,0],{hidden:true}).issues,['隐藏文字层']);
  assert.deepEqual(layer([2,0,0,2,0,0],{protected:{all:true}}).issues,['文字层或分组已锁定']);
});
