const {test}=require('node:test'),assert=require('node:assert/strict');
const {validateAnswer,shape}=require('../services/analysis-contract.cjs');
const {AnalysisExchange}=require('../services/agent-analysis-exchange.cjs');
const {runStructuredTask}=require('../services/ai-match.cjs');
const {planningSchemaFor}=require('../services/ai-layout.cjs');
const composition=require('../services/design-composition.cjs');
const schema=planningSchemaFor({visualPlanningVersion:2,designReviewVersion:1});
const proposal={layerKey:'title',box:[10,10,200,50],font:'FixtureFont',weight:'original',stretchX:100,stretchY:100,size:24,tracking:0,leading:28,alignment:'left',reason:'Keep title hierarchy',containerEdit:null,relationGroup:'heading',paragraphs:null};
const plan={groupId:'heading',alternatives:[{approach:'Single line title',consequence:'Wider shape'},{approach:'Two balanced lines',consequence:'Taller shape'}],chosen:1,reason:'Preserve the intended hierarchy'};

test('one correction identifies every independent omission from the failed response shapes',()=>{
 for(const compositionPlan of [[{relationGroup:'heading',alternatives:['Wide','Tall'],chosen:1,reason:'Compare'}],{groups:[{groupId:'heading',options:[]}]}]){
  const p={...proposal};delete p.relationGroup;delete p.paragraphs;
  assert.throws(()=>validateAnswer(JSON.stringify({proposals:[p],compositionPlan}),schema),error=>{
   const paths=error.contractIssues.map(i=>i.path);for(const path of ['$.proposals[0].relationGroup','$.proposals[0].paragraphs'])assert.ok(paths.includes(path));
   assert.ok(paths.some(p=>p.startsWith('$.compositionPlan')));return true;
  });
 }
 assert.match(shape(schema),/compositionPlan:Array<\{groupId:string, alternatives:Array<\{approach:string, consequence:string\}>/);
 assert.match(shape(schema),/paragraphs:null \| Array<Array<string>>/);
});

test('same operation repairs the complete format once, without rerender or another model',async()=>{
 let renders=0,parses=0,applied=0;
 const e=new AnalysisExchange(async()=>{renders++;await runStructuredTask({}, {mode:'local'}, {taskName:'design_layout',outputSchema:schema,buildPrompt:()=> 'Use current evidence',localAnalysis:r=>e.ask(r),parseOutput:raw=>{parses++;const value=JSON.parse(raw);composition.validatePlan(value.compositionPlan,value.proposals);return value;},fetch:()=>assert.fail('API forbidden'),loadSdk:()=>assert.fail('nested model forbidden')});applied++;return {saved:true};});
 const r=await e.next(),p={...proposal};delete p.relationGroup;delete p.paragraphs;
 const correction=await e.submit(r.analysisRequired.id,JSON.stringify({proposals:[p],compositionPlan:[{relationGroup:'heading',alternatives:['Wide','Tall'],chosen:1,reason:'Compare'}]}));
 assert.equal(parses,0);assert.equal(applied,0);assert.equal(renders,1);assert.equal(correction.analysisCorrection.id,r.analysisRequired.id);assert.equal(correction.completedStagesRetained,true);assert.ok(correction.analysisCorrection.issues.length>=5);assert.equal(correction.images,undefined);
 const result=await e.submit(r.analysisRequired.id,JSON.stringify({proposals:[proposal],compositionPlan:[plan]}));assert.equal(result.operationResult.saved,true);assert.equal(renders,1);assert.equal(applied,1);
});

test('exact format cannot bypass semantic group coverage or invent repeated comparison options',()=>{
 const valid={proposals:[proposal],compositionPlan:[plan]};validateAnswer(JSON.stringify(valid),schema);composition.validatePlan(valid.compositionPlan,valid.proposals);
 for(const bad of [{...plan,groupId:'different'},{...plan,chosen:2},{...plan,alternatives:[plan.alternatives[0],plan.alternatives[0]]}])assert.throws(()=>composition.validatePlan([bad],[proposal]),e=>e.contractIssues.some(i=>i.path.startsWith('$.compositionPlan')));
});

test('review and repair fields receive the same bounded preflight without lowering verdicts',()=>{
 const request={designReviewVersion:1,repairGuidanceVersion:1,designReviewSources:[{id:'graphic',required:true}]};
 for(const s of [require('../services/design-visual-review.cjs').schemaFor(request),require('../services/design-page-audit.cjs').schemaFor(request)]){
  assert.throws(()=>validateAnswer('{}',s),e=>e.contractIssues.some(i=>i.path==='$.repairPlan')&&e.contractIssues.some(i=>i.path==='$.skillReviews'));
 }
 assert.throws(()=>validateAnswer('```json\n{}\n```',schema),/有效JSON/);
 assert.throws(()=>validateAnswer(JSON.stringify({proposals:Array.from({length:500},()=>({})),compositionPlan:[]}),schema),e=>e.contractIssues.length<=80);
 const broken={proposals:[{...proposal,paragraphs:[['kept',5]]}],compositionPlan:[plan]};
 assert.throws(()=>validateAnswer(JSON.stringify(broken),schema),e=>e.contractIssues.some(i=>i.path==='$.proposals[0].paragraphs[0][1]'&&i.expected==='string'));
});
