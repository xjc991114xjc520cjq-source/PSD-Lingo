// Semantic roles are resolved from the current template, never from customer IDs or prices.
const prefix=(a,b)=>a.length<=b.length&&a.every((v,i)=>v===b[i]);
const contains=(a,b)=>a.steps.length===b.steps.length&&a.steps.slice(0,-1).every((s,i)=>JSON.stringify(s.path)===JSON.stringify(b.steps[i].path))&&prefix(a.steps.at(-1).path,b.steps.at(-1).path);
const union=boxes=>{const x=Math.min(...boxes.map(b=>b[0])),y=Math.min(...boxes.map(b=>b[1]));return [x,y,Math.max(...boxes.map(b=>b[0]+b[2]))-x,Math.max(...boxes.map(b=>b[1]+b[3]))-y];};
function priceStructure({objects,root,fields,approved,groups,removes=[],layout=[],exclusions=[]}){
 const missing=new Set(approved.fields.filter(f=>f.state!=='value').map(f=>f.key));
 for(const e of exclusions){const f=approved.fields.find(f=>e.recordId===f.recordId);if(f)missing.add(f.key);}
 if(!groups){if(missing.size)throw Error('价格结构减少：请根据当前模板声明priceGroups（字段完整阅读组、标签与运算符关系），软件将默认清理并回收空槽；不能只清金额');return {removeIds:removes,reflows:[],summary:[]};}
 if(!Array.isArray(groups)||!groups.length)throw Error('priceGroups必须声明当前模板真实容器与字段角色');
 const get=id=>{const o=objects.find(o=>o.id===id);if(!o)throw Error('价格语义对象不属于当前模板');return o;},seenFields=new Set(),owned=[],reflows=[],summary=[],removed=new Set(removes);
 const allItems=[];
 for(const group of groups){const container=get(group.containerId);if(!['group','smart'].includes(container.kind)||!Array.isArray(group.items)||!group.items.length||!['horizontal','vertical'].includes(group.axis||'horizontal'))throw Error('价格组需明确容器、阅读轴及完整条目');
  const items=group.items.map(item=>{const role=fields.find(f=>f.field===item.field);if(!role||seenFields.has(item.field)||!Array.isArray(item.objectIds)||!item.objectIds.length)throw Error('价格语义字段缺失、重复或没有阅读组');seenFields.add(item.field);
   const nodes=item.objectIds.map(get);for(const o of nodes){if(o.id===container.id||!contains(container,o)||owned.some(p=>contains(p,o)||contains(o,p)))throw Error('价格条目跨容器、嵌套文档或重复包含父子对象');owned.push(o);}
   if(!role.objectIds.every(id=>nodes.some(o=>contains(o,get(id)))))throw Error('价格阅读组必须包含该字段的全部金额与对应标签');
   if(fields.some(f=>f.field!==item.field&&f.objectIds.some(id=>nodes.some(o=>contains(o,get(id))))))throw Error('价格阅读组不能包含其他字段或主价容器');
   const box=union(nodes.map(o=>o.localBox||o.box));return {...item,nodes,box,missing:missing.has(item.field)};});
  allItems.push(...items);const separators=group.separators||[];if(!Array.isArray(separators))throw Error('运算符关系无效');
  const links=separators.map(s=>{const o=get(s.objectId);if(!contains(container,o)||owned.some(p=>contains(p,o)||contains(o,p))||!items.some(i=>i.field===s.leftField)||!items.some(i=>i.field===s.rightField)||s.leftField===s.rightField||o.kind!=='text'||!/^\s*[+\-−–—=×÷·|]\s*$/.test(o.original||''))throw Error('运算符需独立符号及本容器内两个明确字段，不能按型号连字符推断');owned.push(o);return {...s,node:o};});
  const reduced=items.some(i=>i.missing);if(!reduced)continue;
  const preserved=(group.preserveObjectIds||[]).map(get);
  if(preserved.some(o=>!contains(container,o)||/^\s*[+\-−–—=×÷·|]\s*$/.test(o.original||'')))throw Error('保留的非价格对象需属于当前容器，不能借此保留孤立运算符');
  const declared=groups.flatMap(g=>g.items.flatMap(i=>i.objectIds).concat((g.separators||[]).map(s=>s.objectId))).map(get);
  for(const o of objects)if(o.kind==='text'&&o.visible!==false&&contains(container,o)&&!declared.concat(preserved).some(p=>contains(p,o)))throw Error('价格减少容器内有未归属标签或文字，请补完整阅读组；无关型号等用preserveObjectIds明确保留');
  for(const item of items)if(item.missing)for(const o of item.nodes)removed.add(o.id);
  const alive=items.filter(i=>!i.missing),aliveLinks=links.filter(l=>!missing.has(l.leftField)&&!missing.has(l.rightField));
  for(const l of links)if(!aliveLinks.includes(l))removed.add(l.objectId);
  if(aliveLinks.some(l=>[...removed].some(id=>contains(get(id),l.node))))throw Error('不能移除仍有运算关系的有效分隔符');
  const envelope=union(items.map(i=>i.box));
  // Any standalone arithmetic symbol in this reading area must have a declared relationship.
  for(const o of objects){const b=o.localBox||o.box;if(o.kind==='text'&&contains(container,o)&&/^\s*[+\-−–—=×÷·|]\s*$/.test(o.original||'')&&b[0]>=envelope[0]&&b[1]>=envelope[1]&&b[0]+b[2]<=envelope[0]+envelope[2]&&b[1]+b[3]<=envelope[1]+envelope[3]&&!owned.some(p=>contains(p,o)))throw Error('减少价格项后发现未声明关系的孤立符号，请补语义映射');}
  const targets=alive.flatMap(i=>i.nodes).concat(aliveLinks.map(l=>l.node));
  const manual=layout.filter(l=>targets.some(o=>contains(get(l.objectId),o)||contains(o,get(l.objectId))));
  if(manual.length&&targets.some(o=>!manual.some(l=>contains(get(l.objectId),o))))throw Error('用户布局优先，但价格减少后的手动布局必须覆盖全部剩余阅读组与有效符号，不能留下原空槽');
  if(!manual.length&&alive.length)reflows.push({mode:'price-reflow',steps:container.steps,objectId:container.id,axis:group.axis||'horizontal',envelope,items:alive.map(i=>({field:i.field,paths:i.nodes.map(o=>o.nativePath)})),separators:aliveLinks.map(l=>({path:l.node.nativePath,leftField:l.leftField,rightField:l.rightField}))});
  summary.push({containerId:container.id,removedFields:items.filter(i=>i.missing).map(i=>i.field),retainedFields:alive.map(i=>i.field),layout:manual.length?'explicit':'automatic',removedSymbols:links.filter(l=>!aliveLinks.includes(l)).map(l=>l.objectId)});
 }
 if(fields.some(f=>!seenFields.has(f.field)))throw Error('priceGroups必须覆盖全部价格字段，主价可使用独立容器');
 for(const i of allItems)if(!i.missing&&i.nodes.some(o=>[...removed].some(id=>contains(get(id),o)||contains(o,get(id)))))throw Error('不能清除有效价格阅读组；有效0不是缺失');
 // Collapse redundant descendant deletions into the selected parent.
 const ids=[...removed].filter(id=>![...removed].some(other=>other!==id&&contains(get(other),get(id))));
 return {removeIds:ids,reflows,summary};
}
module.exports={priceStructure,contains,union};
