const fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {SkuWorkflow}=require('../sku-workflow.cjs'),{executeScript}=require('../photoshop-preview.cjs'),{hashFile}=require('../photoshop-file-io.cjs');
(async()=>{
 const directory='D:/PSD-Lingo/work/sku-bridge-diagnostic/multirule';await fs.mkdir(directory,{recursive:true});const input=directory+'/rules-fixture.psd';
 await executeScript(directory+'/create',`#target photoshop
 (function(){var d=null,c=null;try{d=app.open(new File('D:/PSD-Lingo/work/ps-bulk-replace/extended/boards.psd'));c=d.duplicate('SKU multi-rule fixture',false);function walk(p){for(var i=0;i<p.layers.length;i++){var l=p.layers[i];if(l.typename==='LayerSet')walk(l);else if(l.kind===LayerKind.TEXT&&l.textItem.contents.indexOf('First')===0)l.textItem.contents='双十一狂欢季 | 双11狂欢季立减';}}walk(c);c.saveAs(new File('${input}'),new PhotoshopSaveOptions(),true,Extension.LOWERCASE);}finally{if(c)c.close(SaveOptions.DONOTSAVECHANGES);if(d)d.close(SaveOptions.DONOTSAVECHANGES);}})();`);
 const engine=new SkuWorkflow(directory+'/jobs'),before=await hashFile(input);
 const plan=await engine.analyze(input,{rules:[{needle:'双十一狂欢季',target:'双十一开门红'},{needle:'1000Hz',target:'8000Hz'}],includeHidden:true,detectVariants:true});
 assert.deepEqual(plan.blockers,[]);assert.equal(plan.matches.length,2);assert.equal(plan.related.length,1);
 const kept=await engine.run(plan.id,directory);assert.equal(kept.result.audit.length,2);assert.equal(kept.variantDecisions[0].selected,false);assert.ok(kept.result.audit.some(a=>a.after.includes('双11狂欢季立减')));
 const selected=await engine.run(plan.id,directory,plan.related.map(c=>({key:c.key,target:c.target})));assert.equal(selected.result.audit.length,2);assert.equal(selected.variantDecisions[0].selected,true);assert.ok(selected.result.audit.some(a=>a.after==='双十一开门红 | 双11开门红立减'));assert.equal(selected.result.files.length,2);assert.equal(selected.result.verifiedTargets,plan.matches.length);assert.equal(await hashFile(input),before);
 await fs.writeFile(directory+'/verified.json',JSON.stringify({kept,selected},null,2));console.log('PASS native COM and multi-rule workflow: two rules, same-layer exact/variant merge, keep vs modify, save/reopen/JPG, source unchanged');
})().catch(e=>{console.error(e);process.exitCode=1});
