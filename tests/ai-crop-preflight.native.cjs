const fs=require('node:fs/promises'),assert=require('node:assert/strict');
if(process.env.SPARKIT_ADOBE_TEST!=='1')throw Error('Requires current background Adobe permission');
(async()=>{const out=process.env.SPARKIT_NATIVE_OUTPUT;await fs.mkdir(out,{recursive:true});const source='D:/PSD-Lingo/work/multigraph-v31/native/mixed.psd',hash=require('../photoshop-file-io.cjs').hashFile,before=await hash(source),engine=new(require('../sku-workflow.cjs').SkuWorkflow)(out+'/jobs');
 const plan=await engine.analyze(source,{rules:[{needle:'1000Hz',target:'12000Hz'},{needle:'SALE',target:'MEGA SALE'}],includeHidden:true});assert.ok(plan.blockers.some(b=>b.includes('AI 原始裁切尺寸')),'Unsafe cached vector frame must be reported in analysis');await assert.rejects(engine.run(plan.id,out),/阻止|解决|问题|裁切|阻塞/);assert.equal(await hash(source),before);
 await fs.writeFile(out+'/verified.json',JSON.stringify({passed:true,blockedBeforeEdits:true,sourceUnchanged:true,sourceHash:before,blockers:plan.blockers},null,2));console.log('PASS AI frame mismatch identified before edits');
})().catch(e=>{console.error(e);process.exitCode=1;});
