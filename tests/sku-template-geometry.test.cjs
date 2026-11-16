const {test}=require('node:test'),assert=require('node:assert/strict');
const {priceAnchor,footerPlacement,scaleMismatches,scaleKey}=require('../sku-template-geometry.cjs');
const {AgentTask}=require('../services/agent-task.cjs');
test('variable-width discounts keep the centered template label relationship while asymmetric main price retains its anchor',()=>{
 const money={id:'price',kind:'text',box:[985,1344,120,68]},label={id:'label',kind:'text',box:[974,1311,141,20]},groups=[{items:[{objectIds:['price','label']}]}];
 assert.equal(priceAnchor(money,groups,[money,label],'left'),'center');
 label.box=[26,1243,146,28];assert.equal(priceAnchor(money,groups,[money,label],'left'),'left');
 assert.equal(priceAnchor(money,undefined,[money,label],'right'),'right');
});
test('tiny bottom panel seam is closed by translation without resizing graphic or treating background bleed as panel edge',()=>{
 const object=box=>({kind:'pixel',visible:true,steps:[{path:[0]}],box});
 const p=footerPlacement([0,0,1440,1440],[0,2503,1440,1440],[object([361,1283,1141,155]),object([143,1064,1460,576])]);
 assert.deepEqual(p.frame,[0,-2,1440,1440]);assert.equal(p.bottomSeam,2);
 const scaled=footerPlacement([0,0,1500,1500],[0,0,1440,1440],[]);assert.deepEqual(scaled.frame,[0,0,1500,1500]);
 assert.equal(scaled.placement[2]/scaled.frame[2],.96);
});
test('scale consent identity changes with the actual template and target dimensions',()=>{
 const plan={productTemplate:{scanId:'a',template:{path:'original.psb'},requests:[{boardId:1,frame:[0,0,1500,1500],placement:[0,0,1440,1440]}]}};
 assert.equal(scaleMismatches(plan)[0].scale,.96);const key=scaleKey(plan);plan.productTemplate.scanId='b';assert.notEqual(scaleKey(plan),key);
 plan.productTemplate.requests[0].placement=[0,0,1500,1500];assert.deepEqual(scaleMismatches(plan),[]);
});
test('template verification checks group identity and real content geometry while ignoring automatic child names',()=>{
 const vm=require('node:vm'),context={};vm.runInNewContext(require('../sku-template-native.cjs').templateNative,context);
 context.bounds=o=>o.box;context.tplLocate=(c,p)=>p.reduce((o,i)=>o.layers[i],c);
 const pixel={name:'Layer 26',box:[1,2,30,40]},group={name:'Footer',layers:[pixel]},container={layers:[group]};
 const checks=[{path:[0],name:'Footer',group:[{path:[0],name:'Layer 24',box:[1,2,30,40]}]}];
 assert.doesNotThrow(()=>context.tplVerify({},checks,container));assert.equal(pixel.name,'Layer 26');
 group.name='Wrong footer';assert.throws(()=>context.tplVerify({},checks,container),/整组名称/);group.name='Footer';
 pixel.box[2]=31;assert.throws(()=>context.tplVerify({},checks,container),/位置不一致/);
});
test('software asks the user about scaling and never treats manual adjustment as assistant permission',async()=>{
 for(const accept of [true,false]){const a=new AgentTask({think:async()=>{},execute:async()=>{}});a.current={id:'test',status:'running',history:[],revision:0};
 const waiting=a.confirmTemplateScale([{templateSize:[1500,1500],targetSize:[1440,1440],scale:.96}]);
 const q=a.current.question;assert.match(q.items[0].title,/锯齿或模糊/);assert.match(q.items[0].title,/96.00%/);
 assert.equal(a.current.status,'waiting');a.answer({questionId:q.id,answers:{template_scale:q.items[0].options[accept?0:1]}});
 assert.equal(await waiting,accept);assert.equal(a.current.question,null);
 }
});
