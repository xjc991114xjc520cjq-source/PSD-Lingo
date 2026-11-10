const {test}=require('node:test'),assert=require('node:assert/strict');
const {reconcileTitleSpacing}=require('../design-layout-relations.cjs');
function fixture(){
 const working={layers:[{id:1,recordId:'a',size:40,box:[20,20,240,100],position:{x:20,y:20}},{id:2,recordId:'b',size:20,box:[20,190,240,30],position:{x:20,y:190}}]};
 const request={canvas:{width:500,height:500},layers:[{layerKey:'1',originalSize:40,parentId:'card',sourceBox:[20,20,200,40]},{layerKey:'2',originalSize:20,parentId:'card',sourceBox:[20,70,200,20]}]};
 return {working,request,accepted:working.layers.map(l=>({id:l.id,candidate:{...l}})),records:[{id:'a',target:'日文标题'},{id:'b',target:'批准的副标题'}],fitText:l=>({width:200,height:l.id===1?90:24})};
}
test('multiline title uses measured bottom and original subtitle gap, preserves copy and style',()=>{const c=fixture();reconcileTitleSpacing(c);assert.equal(c.working.layers[1].position.y,120);assert.equal(c.accepted[1].candidate.position.y,120);assert.equal(c.working.layers[1].size,20);assert.equal(c.records[1].target,'批准的副标题');});
test('single-text scope never moves an immutable subtitle',()=>{const c=fixture();c.accepted.pop();reconcileTitleSpacing(c);assert.equal(c.working.layers[1].position.y,190);});
test('different parent, unrelated distant text and new collisions retain existing positions',()=>{for(const mode of ['parent','distant','collision']){const c=fixture();if(mode==='parent')c.request.layers[1].parentId='other';if(mode==='distant')c.request.layers[1].sourceBox[1]=150;if(mode==='collision')c.working.layers.push({id:3,box:[20,120,200,24],visible:true});reconcileTitleSpacing(c);assert.equal(c.working.layers[1].position.y,190,mode);}});
