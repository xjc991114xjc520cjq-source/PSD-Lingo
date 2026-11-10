const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {hash,jsxForPlan}=require('../core.cjs');
const {outputName,createTemplate,planForDocument}=require('../batch.cjs');

function fixture(extension){
  const target='Translated title';
  const previewLayout={text:target,breaks:[],font:'ArialMT',weight:'regular',size:20,tracking:0,leading:24,stretchX:100,stretchY:100,box:[10,20,180,30]};
  return {version:1,records:[{id:'r',key:'title',target,digest:hash(target)}],files:[{name:'source.'+extension,path:'C:/source.'+extension,fingerprint:'hash',jobs:[{layerId:42,recordId:'r',target,original:'Original',font:'ArialMT',size:20,minSize:10,box:[10,20,180,30],previewLayout}]}]};
}

// Execute the full generated ExtendScript with a minimal Photoshop DOM. This
// catches extension/option mismatches and collision handling, not just strings.
function runExport(extension,{nameExtension=extension,format}={}){
  const plan=fixture(extension);plan.files[0].name='source.'+nameExtension;
  if(format)plan.files[0].format=format;
  const outputExtension=format?format.toLowerCase():(extension==='psb'||nameExtension==='psb'?'psb':'psd');
  const saved=[],closed=[],duplicates=[],reports=[];
  const unit=value=>({as:()=>value});
  const layer={id:42,name:'Title',typename:'ArtLayer',kind:'TEXT',bounds:[10,20,190,50].map(unit),allLocked:false,translate(){},textItem:{kind:'POINTTEXT',contents:'Original',font:'ArialMT',size:unit(20),leading:unit(24),tracking:0,horizontalScale:100,verticalScale:100,useAutoLeading:false,fauxBold:false}};
  const source={saved:true,fullName:{fsName:plan.files[0].path},layers:[layer],duplicate(name){duplicates.push(name);const copy={resolution:72,width:unit(1080),height:unit(4320),layers:[{...layer,textItem:{...layer.textItem}}],saveAs(file,options,asCopy,lowercase){saved.push({path:file.fsName,options,asCopy,lowercase});},close(option){closed.push(['copy',option]);}};return copy;},close(option){closed.push(['source',option]);}};
  function File(file){this.fsName=file;this.exists=file===source.fullName.fsName||file===`C:/out/source_localized.${outputExtension}`;this.open=()=>true;this.write=text=>reports.push(JSON.parse(text));this.close=()=>{};}
  function PhotoshopSaveOptions(){this.format='psd';}
  function ActionDescriptor(){this.values={};this.putBoolean=(key,value)=>{this.values[key]=value;};this.putPath=(key,value)=>{this.values[key]=value;};this.putObject=(key,type,value)=>{this.values[key]={type,descriptor:value};};}
  function executeAction(action,descriptor,dialogs){assert.equal(action,'save');const v=descriptor.values;assert.equal(dialogs,'none');assert.equal(v['As  '].type,'largeDocumentFormat');assert.equal(v['As  '].descriptor.values.maximizeCompatibility,true);saved.push({path:v['In  '].fsName,options:{format:'psb'},asCopy:v['Cpy '],lowercase:v.lowerCase,descriptor});}
  const app={preferences:{rulerUnits:'original'},displayDialogs:'original',documents:[],fonts:[{postScriptName:'ArialMT'}],bringToFront(){},open(){this.documents=[source];return source;}};
  vm.runInNewContext(jsxForPlan(plan,{outputDirectory:'C:/out',silent:true}).replace(/^#target photoshop\s*/,''),{app,File,Folder:function(folder){this.fsName=folder;},PhotoshopSaveOptions,ActionDescriptor,executeAction,charIDToTypeID:value=>value,stringIDToTypeID:value=>value,Units:{PIXELS:'pixels'},DialogModes:{NO:'none'},Extension:{LOWERCASE:'lower'},LayerKind:{TEXT:'TEXT'},TextType:{POINTTEXT:'POINTTEXT'},SaveOptions:{DONOTSAVECHANGES:'discard'},UnitValue:unit});
  return {saved,closed,duplicates,reports,source,app};
}

test('PSB export uses native large-document save action and skips existing PSB output',()=>{
  const r=runExport('psb');assert.equal(r.saved.length,1);assert.equal(r.saved[0].path,'C:/out/source_localized_1.psb');assert.equal(r.saved[0].options.format,'psb');assert.equal(r.saved[0].asCopy,true);assert.equal(r.saved[0].lowercase,true);assert.deepEqual(r.duplicates,['source_localized']);assert.deepEqual(r.closed,[['source','discard'],['copy','discard']]);assert.equal(r.source.layers[0].textItem.contents,'Original');assert.equal(r.reports[0][0].output,r.saved[0].path);assert.equal(r.app.preferences.rulerUnits,'original');assert.equal(r.app.displayDialogs,'original');
});
test('PSD export retains native PSD save options and filename',()=>{
  const r=runExport('psd');assert.equal(r.saved[0].path,'C:/out/source_localized_1.psd');assert.equal(r.saved[0].options.format,'psd');assert.equal(r.reports[0][0].layouts[0].renderedText,'Translated title');
});
test('PSB source path preserves format even when a legacy display name has PSD extension',()=>{
  const r=runExport('psb',{nameExtension:'psd'});assert.equal(r.saved[0].options.format,'psb');assert.equal(r.saved[0].path,'C:/out/source_localized_1.psb');
});
test('header-recognized format takes precedence over misleading file and display extensions',()=>{
  const psb=runExport('psd',{format:'PSB'});assert.equal(psb.saved[0].options.format,'psb');assert.equal(psb.saved[0].path,'C:/out/source_localized_1.psb');
  const psd=runExport('psb',{format:'PSD'});assert.equal(psd.saved[0].options.format,'psd');assert.equal(psd.saved[0].path,'C:/out/source_localized_1.psd');
});
test('batch plan keeps PSB format and maps a language document without altering the source path',()=>{
  assert.equal(outputName('product.PSB','German.csv'),'product_German.psb');assert.equal(outputName('product.psd','French.txt'),'product_French.psd');
  const p=fixture('psb'),template=createTemplate(p,{name:'PSB sample'}),target='Bonjour';
  const document={name:'French.csv',fingerprint:'doc',records:[{key:'title',target,digest:hash(target)}]};
  const layout={...p.files[0].jobs[0].previewLayout,text:target,fileIndex:0,layerId:42};
  const output=planForDocument(template,document,{mode:'order',fitMode:'fixed',layouts:[layout]});
  assert.equal(output.files[0].name,'source_French.psb');assert.equal(output.files[0].path,'C:/source.psb');
});
test('batch output names use header format before a renamed extension, with legacy callers preserved',()=>{
  assert.equal(outputName('source.psd','French.csv','PSB'),'source_French.psb');assert.equal(outputName('source.psb','French.csv','PSD'),'source_French.psd');assert.equal(outputName('source.psb','French.csv'),'source_French.psb');
  for(const [extension,format,expected] of [['psd','PSB','psb'],['psb','PSD','psd']]){
    const p=fixture(extension);p.files[0].format=format;const template=createTemplate(p,{name:'Header format'}),target='Bonjour';
    const document={name:'French.csv',fingerprint:'doc',records:[{key:'title',target,digest:hash(target)}]};
    const layout={...p.files[0].jobs[0].previewLayout,text:target,fileIndex:0,layerId:42};
    const output=planForDocument(template,document,{mode:'order',fitMode:'fixed',layouts:[layout]});
    assert.equal(output.files[0].name,'source_French.'+expected);assert.equal(output.files[0].format,format);
  }
});
