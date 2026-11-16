// Opt-in, with current Adobe permission. Blocks only telemetry paths deliberately.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.SPARKIT_NATIVE_OUTPUT;
if(process.env.SPARKIT_ADOBE_TEST!=='1'||!out)throw Error('Requires current Adobe permission and fresh output directory');
async function main(){
 await fs.mkdir(out,{recursive:true});for(const name of ['native-progress.json','native-progress.jsonl'])await fs.mkdir(path.join(out,name));
 const {compositionScript}=require('../photoshop-artboards.cjs');let jsx=compositionScript('unused.psd',[],'PSB',out);jsx=jsx.slice(0,jsx.indexOf('try{var file='));jsx+=String.raw`try{
 checkpoint('Forced telemetry failure before artwork');work=app.documents.add(200,200,72,'Sparkit isolated telemetry test',NewDocumentMode.RGB,DocumentFill.WHITE);var l=work.artLayers.add();l.kind=LayerKind.TEXT;l.textItem.contents='Progress test';l.textItem.font='ArialMT';l.textItem.size=12;l.textItem.position=[10,100];checkpoint('Forced telemetry failure after text');save(work,folder+'/copy.psd',false);work.close(SaveOptions.DONOTSAVECHANGES);work=null;reopened=app.open(new File(folder+'/copy.psd'));if(reopened.layers[0].textItem.contents!=='Progress test')throw Error('Text not retained');jpg(reopened,{box:[0,0,200,200]},folder+'/proof.jpg');write(folder+'/verified.json',{passed:true,saved:true,reopened:true,jpg:true,progressWriteFailures:progressWriteFailures,warnings:progressWarnings});
 }catch(e){failure=e;}finally{for(var i=proofDocs.length-1;i>=0;i--)try{proofDocs[i].close(SaveOptions.DONOTSAVECHANGES);}catch(_){}if(reopened)reopened.close(SaveOptions.DONOTSAVECHANGES);if(work)work.close(SaveOptions.DONOTSAVECHANGES);if(previous)app.activeDocument=previous;app.displayDialogs=dialogs;app.preferences.rulerUnits=units;}if(failure)throw failure;})();`;
 await require('../photoshop-preview.cjs').executeScript(out,jsx);const r=JSON.parse((await fs.readFile(path.join(out,'verified.json'),'utf8')).replace(/^\uFEFF/,''));assert.equal(r.passed,true);assert.equal(r.progressWriteFailures,4);assert.ok((await fs.stat(path.join(out,'proof.jpg'))).size>0);console.log(JSON.stringify(r));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
