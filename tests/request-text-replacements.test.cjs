const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path'),esbuild=require('esbuild'),crypto=require('node:crypto');
const {userMessages,validateRules,replaceLayer}=require('../services/request-text-replacements.cjs');
const evidence='把活动日期改为11月20日，中文和排版保持原样';
const rules=[{find:'11.18',replace:'11.20',kind:'date',evidence}];
test('only actual user requests, supplements and answers approve replacement values',()=>{
 const messages=userMessages({request:evidence,history:[{type:'assistant',text:'改成11月30日'},{type:'tool_result',result:{text:'改成11月29日'}},{type:'user_supplement',text:'活动名称改为返场'},{type:'user_answer',answers:{date:'改为11月21日'}}]});
 assert.deepEqual(validateRules(rules,messages),rules);assert.equal(messages.length,3);
 assert.throws(()=>validateRules([{...rules[0],replace:'11.30',evidence:'改成11月30日'}],messages));
 assert.throws(()=>validateRules([{...rules[0],replace:'11.31'}],messages));
 assert.throws(()=>validateRules([{...rules[0],replace:'2026.11.20'}],messages));
 assert.throws(()=>validateRules([{find:'中文',replace:'助手编的',evidence}],messages));
 assert.throws(()=>validateRules([{find:'11.18',replace:'11.20\n',evidence}],messages));
});
test('one pass preserves single/multiline copy, CRLF, mixed styles, unmodified characters and repeated dates',()=>{
 const original='返场活动\r\n11.18 至 11.18',layer={original,mixedStyleRuns:[{from:0,to:6,signature:'Chinese'},{from:6,to:original.length,signature:'Date'}]},edit=replaceLayer(layer,rules);
 assert.equal(edit.target,'返场活动\r\n11.20 至 11.20');assert.equal(edit.spans.map(s=>s.text).join(''),edit.target);assert.equal(edit.spans[1].sourceStart,6);assert.equal(layer.original,original);
 assert.equal(replaceLayer({original:'返场活动 11.18'},rules).target,'返场活动 11.20');
 assert.equal(replaceLayer({original:'型号111.180'},rules),null);
 const chain=[{find:'甲',replace:'乙'},{find:'乙',replace:'丙'}];assert.equal(replaceLayer({original:'甲乙'},chain).target,'乙丙');
 assert.throws(()=>replaceLayer({original:'11.18'},[{find:'11.18',replace:'11.20'},{find:'11',replace:'12'}]),/重叠/);
});
const compiled=esbuild.buildSync({entryPoints:[path.resolve(__dirname,'../renderer/agent-workspace.js')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
function fixture(){const mod={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require,structuredClone,console,crypto:crypto.webcrypto,TextEncoder});const state={files:[{name:'fixture.psb',path:'D:/fixture.psb',fingerprint:'source',format:'PSB',width:1000,height:600,nativeTextScanId:'scan',artboards:[{id:1,name:'单行',box:[0,0,500,600],nativePath:[0]},{id:2,name:'两行',box:[500,0,500,600],nativePath:[1]}],layers:['返场活动 11.18','返场活动\n11.18','无关文案','返场活动11.18'].map((original,i)=>({id:'native:'+i,original,name:'date-'+i,visible:i!==3,boardId:i===1?2:1,nativePath:[i===1?1:0,i],issues:[],mixedStyleRuns:[{from:0,to:original.indexOf('11.')<0?original.length:original.indexOf('11.'),signature:'chinese'},{from:original.indexOf('11.'),to:original.length,signature:'date'}]}))}],records:[{id:'old',target:'保留文档',digest:crypto.createHash('sha256').update('保留文档').digest('hex')}],docName:'原文档.xlsx'},transactions=[];return {state,transactions,run:mod.exports.createAgentWorkspace({state,call:async()=>assert.fail('No model, document picker or Adobe required'),history:{transaction:(fn,r)=>{transactions.push(r);fn();}},render:()=>{},selectFile:()=>{}})};}
const args={fileIndex:0,rules,userMessages:[evidence],provenanceId:'task-proof'};
test('request copy flows into real native plan for both layouts without a document or losing existing records',async()=>{
 const f=fixture(),r=await f.run('prepare_text_replacements',args);assert.equal(r.matchedLayers,2);assert.equal(f.state.docName,'原文档.xlsx');assert.equal(f.state.records[0].id,'old');
 for(const record of r.records)assert.equal(record.digest,crypto.createHash('sha256').update(record.target).digest('hex'));
 const again=await f.run('prepare_text_replacements',args);assert.equal(again.changed,false);assert.equal(f.state.records.length,3);
 await f.run('configure_native_text',{fileIndex:0,scanId:r.scanId,changes:r.changes});const plan=f.state.files[0].artboardPlan;assert.deepEqual(JSON.parse(JSON.stringify(plan.boards.map(b=>b.changes.map(c=>c.target)))),[['返场活动 11.20'],['返场活动\n11.20']]);
 assert.equal(plan.operation,'edit');assert.equal(plan.boards.length,2);assert.equal(f.state.files[0].layers[0].original,'返场活动 11.18');assert.equal(f.transactions.at(-1),'native-text-plan');
});
test('bad source, product mapping, nonexistent scope, no match and cancelled request do not clear prior work',async()=>{
 const f=fixture(),initial=JSON.stringify(f.state);await assert.rejects(f.run('prepare_text_replacements',{...args,userMessages:[]}),/用户/);assert.equal(JSON.stringify(f.state),initial);
 await assert.rejects(f.run('prepare_text_replacements',{...args,layerIds:['not-found']}),/ID/);assert.equal(JSON.stringify(f.state),initial);
 const no=await f.run('prepare_text_replacements',{...args,layerIds:['native:2']});assert.equal(no.changed,false);assert.equal(f.state.records.length,1);
 let calls=0;await assert.rejects(f.run('prepare_text_replacements',args,undefined,()=>++calls<2),/旧替换/);assert.equal(f.state.records.length,1);
 f.state.sourceDocument={productMappingId:'approved'};await assert.rejects(f.run('prepare_text_replacements',args),/产品/);
});
