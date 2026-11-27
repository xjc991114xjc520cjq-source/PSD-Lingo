const {test}=require('node:test'),assert=require('node:assert/strict');
const {contract,validate}=require('../services/agent-template-contract.cjs');
const {resolvedArgumentKeys}=require('../services/agent-argument-recovery.cjs');
test('template errors can carry a complete structured contract with precise missing fields',()=>{
 assert.throws(()=>validate('configure_product_template',{fileIndex:0}),e=>e.code==='TOOL_ARGUMENTS'&&e.missingFields.includes('sourceFileId')&&e.missingFields.includes('templateFields')&&e.toolContract.configuration.single.templateFields[0].objectIds.length===1);
 assert.equal(contract('preview'),undefined);assert.match(contract('configure_product_template').configuration.multiple,/SAME PSD/);
});
test('successful parameter correction resolves only known pre-execution failures on the same scope',()=>{
 const history=[{type:'tool_start',tool:'configure_product_template',args:{sourceFileId:'source',mappingId:'m'}},{type:'tool_error',tool:'configure_product_template',error:'请明确模板价格字段与对象角色'},{type:'tool_start',tool:'configure_product_template',args:{sourceFileId:'other'}},{type:'tool_error',tool:'configure_product_template',error:'请明确模板价格字段与对象角色'},{type:'tool_start',tool:'configure_product_template',args:{sourceFileId:'source'}},{type:'tool_error',tool:'configure_product_template',error:'Native timeout; result unknown'}];
 const keys=(t,a)=>[t+':'+a.sourceFileId];assert.deepEqual(resolvedArgumentKeys(history,'configure_product_template',{sourceFileId:'source',mappingId:'m'},keys),['configure_product_template:source']);
});
