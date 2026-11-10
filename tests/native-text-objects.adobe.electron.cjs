const {app}=require('electron');
if(process.env.SPARKIT_NATIVE_FIXTURE!=='1')throw Error('Set SPARKIT_NATIVE_FIXTURE=1 to create independent Adobe fixtures.');
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
const fs=require('fs/promises'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out='D:/PSD-Lingo/work/object-chain-native';
const ai=require(root+'/illustrator.cjs'),{hashFile}=require(root+'/photoshop-file-io.cjs'),{hash,jsxForPlan}=require(root+'/core.cjs');
const {validateCreation}=require(root+'/native-text-objects.cjs');
const approved='Editable replacement';const record={id:'approved',target:approved,digest:hash(approved)};
function newJob(){return {layerId:-1,nativeCreation:{color:'#114477',boardBox:[0,0,500,500],boardName:'Test'},name:'New editable',original:'',font:'ArialMT',size:24,minSize:18,box:[30,270,380,70],recordId:record.id,target:approved,alignment:'left',previewLayout:{font:'ArialMT',weight:'regular',size:24,tracking:0,leading:29,stretchX:100,stretchY:100,box:[30,270,250,30],text:approved,breaks:[]}};}
await (async()=>{
 await fs.mkdir(out,{recursive:true});await fs.rm(out+'/verified.json',{force:true});const input=out+'/source.ai',result=out+'/create/result.json';
 await ai.executeScript(out+'/create',ai.script(`d=app.documents.add(DocumentColorSpace.RGB,500,500);d.artboards[0].name='Test';var bg=d.pathItems.rectangle(500,0,500,500);bg.filled=true;bg.stroked=false;var white=new RGBColor();white.red=255;white.green=255;white.blue=255;bg.fillColor=white;var names=['Keep visible','Hide this','Clear this'];for(var i=0;i<names.length;i++){var t=d.textFrames.add();t.contents=names[i];t.textRange.characterAttributes.textFont=app.textFonts.getByName('ArialMT');t.textRange.characterAttributes.size=24;t.position=[30,450-i*70];}var o=new IllustratorSaveOptions();o.pdfCompatible=true;d.saveAs(new File(${JSON.stringify(input)}),o);write(${JSON.stringify(result)},{ok:true});`,result));
 const meta=await ai.readIllustrator(out+'/read',input),layers=meta.metadata.layers;
 const action=(text,mode)=>{const l=layers.find(l=>l.original===text);return {layerId:l.id,mode,original:l.original,font:l.font,size:l.size,box:l.box,reason:'Isolated software regression fixture'};};
 const file={name:'source.ai',path:input,format:'AI',fingerprint:await hashFile(input),width:500,height:500,jobs:[newJob()],textActions:[action('Hide this','hidden'),action('Clear this','clear')]};
 validateCreation(file.jobs[0],{...meta.metadata,layers});
 const background=await ai.createBackground(out+'/background',input,[-1],{fingerprint:file.fingerprint,textActions:file.textActions});await fs.writeFile(out+'/background.png',Buffer.from(background.split(',')[1],'base64'));
 const exported=await ai.runPlan(out+'/export',{version:1,records:[record],files:[file]},out+'/output');assert.ok(exported[0].output,JSON.stringify(exported));
 const verify=out+'/reopen/result.json';await ai.executeScript(out+'/reopen',ai.script(`d=app.open(new File(${JSON.stringify(exported[0].output)}));var a=[];for(var i=0;i<d.textFrames.length;i++)a.push({text:String(d.textFrames[i].contents),hidden:d.textFrames[i].hidden,color:encodeColor(d.textFrames[i].textRange.characterAttributes.fillColor)});capture(d,rect(d),${JSON.stringify(out+'/reopened.png')});write(${JSON.stringify(verify)},a);`,verify));
 await require(root+'/illustrator-preview.cjs').composeCapture(out+'/reopened.png');
 const actual=JSON.parse((await fs.readFile(verify,'utf8')).replace(/^\uFEFF/,''));assert.ok(actual.find(t=>t.text==='Keep visible'&&!t.hidden));assert.ok(actual.find(t=>t.text==='Hide this'&&t.hidden));assert.ok(!actual.some(t=>t.text==='Clear this'));assert.ok(actual.find(t=>t.text===approved&&!t.hidden));assert.equal(await hashFile(input),file.fingerprint);
 await fs.writeFile(out+'/ai-verified.json',JSON.stringify({passed:true,actual,sourceUnchanged:true,exported},null,2));console.log('AI native verified',actual);
 // Photoshop fixture and the actual production JSX exporter use only newly created documents.
 const ps=require(root+'/photoshop-preview.cjs'),psinput=out+'/source.psd';
 await ps.executeScript(out+'/ps-create',`#target photoshop\n(function(){var old=app.displayDialogs;app.displayDialogs=DialogModes.NO;var d=app.documents.add(500,500,72,'Object fixture',NewDocumentMode.RGB,DocumentFill.WHITE);try{for(var i=0;i<3;i++){var l=d.artLayers.add();l.kind=LayerKind.TEXT;l.name=['Keep visible','Hide this','Clear this'][i];l.textItem.contents=l.name;l.textItem.font='ArialMT';l.textItem.size=UnitValue(24,'pt');l.textItem.position=[30,70+i*70];}d.saveAs(new File(${JSON.stringify(psinput)}),new PhotoshopSaveOptions(),true,Extension.LOWERCASE);}finally{d.close(SaveOptions.DONOTSAVECHANGES);app.displayDialogs=old;}})();`);
 const psmeta=await require(root+'/photoshop-metadata.cjs').readPhotoshopMetadata(out+'/ps-read',psinput,{helperPath:root+'/services/bin/psd-lingo-service.exe'});
 await fs.writeFile(out+'/psmeta.json',JSON.stringify(psmeta,null,2));
 const pl=psmeta.layers;const psAction=(text,mode)=>{const l=pl.find(l=>l.original===text);return {layerId:l.id,mode,original:l.original,font:l.font,size:l.size,box:l.box,reason:'Isolated native fixture'};};
 const pf={name:'source.psd',path:psinput,format:'PSD',fingerprint:await hashFile(psinput),width:500,height:500,jobs:[newJob()],textActions:[psAction('Hide this','hidden'),psAction('Clear this','clear')]};
 const pbg=await ps.createBackground(out+'/ps-bg',psinput,[-1],{textActions:pf.textActions});await fs.writeFile(out+'/ps-background.png',Buffer.from(pbg.split(',')[1],'base64'));
 const psOutput=out+'/ps-output-'+Date.now();await fs.mkdir(psOutput,{recursive:true});await ps.executeScript(out+'/ps-export',jsxForPlan({version:1,records:[record],files:[pf]},{outputDirectory:psOutput,silent:true}));
 const output=psOutput+'/source_localized.psd',pvr=out+'/ps-result.txt';await ps.executeScript(out+'/ps-verify',`#target photoshop\n(function(){var d=app.open(new File(${JSON.stringify(output)}));try{var a=[];for(var i=0;i<d.layers.length;i++){var l=d.layers[i];if(l.kind===LayerKind.TEXT)a.push(l.textItem.contents+'|'+l.visible);}var f=new File(${JSON.stringify(pvr)});f.encoding='UTF8';f.open('w');f.write(a.join(String.fromCharCode(10)));f.close();d.saveAs(new File(${JSON.stringify(out+'/ps-reopened.png')}),new PNGSaveOptions(),true,Extension.LOWERCASE);}finally{d.close(SaveOptions.DONOTSAVECHANGES);}})();`);
 const pactual=await fs.readFile(pvr,'utf8');assert.ok(pactual.includes('Keep visible|true'));assert.ok(pactual.includes('Hide this|false'));assert.ok(!pactual.includes('Clear this'));assert.ok(pactual.includes(approved+'|true'));assert.equal(await hashFile(psinput),pf.fingerprint);
 await fs.writeFile(out+'/verified.json',JSON.stringify({passed:true,ai:actual,photoshop:pactual,sourceUnchanged:true},null,2));console.log('PS native verified',pactual);
})().catch(e=>{require('fs').writeFileSync(out+'/failure.txt',e.stack);console.error(e);process.exitCode=1;});

}).finally(()=>app.exit(process.exitCode||0));
