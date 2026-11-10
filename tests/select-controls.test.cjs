const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {nextOption}=(()=>{const vm=require('node:vm'),code=require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../renderer/select-controls.js')],bundle:true,format:'cjs',write:false}).outputFiles[0].text,c={module:{exports:{}}};vm.runInNewContext(code,c);return c.module.exports;})();
test('themed select navigation skips unavailable choices and respects list boundaries',()=>{
 const options=[{disabled:true},{},{hidden:true},{},{disabled:true}];assert.equal(nextOption(options,-1,1),1);assert.equal(nextOption(options,1,1),3);assert.equal(nextOption(options,3,1),3);assert.equal(nextOption(options,3,-1),1);assert.equal(nextOption(options,1,-1),1);assert.equal(nextOption(options,2,'first'),1);assert.equal(nextOption(options,2,'last'),3);assert.equal(nextOption([{disabled:true}],0,1),-1);assert.equal(nextOption([],0,1),-1);
});
