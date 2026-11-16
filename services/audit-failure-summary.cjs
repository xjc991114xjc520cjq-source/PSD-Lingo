// Preserve detailed evidence in audits/failures; summarize repeated symptoms for
// the task status without changing any acceptance decision.
function auditFailureSummary(audit){
 const boards=audit.boards||[];if(!boards.length)return undefined;
 const messages=[];for(const b of boards){const entries=[...(b.checks||[]),...(b.designChecks||[]),...(b.skillReviews||[])].filter(c=>['fail','revise','uncertain'].includes(c.verdict));if(!entries.length)continue;const evidence=[...new Set(entries.map(c=>c.evidence))];const label=entries.some(c=>c.verdict!=='uncertain')?'设计需修改':'审验待确认';messages.push(`${b.board}：${label}（${entries.length}项，${evidence.length}条不同依据）${evidence.map(e=>e.slice(0,300)).slice(0,3).join('；')}${evidence.length>3?'；其余见完整审验记录':''}`);}
 return messages.length?'文件已保存，最终审验未通过。'+messages.join('\n'):undefined;
}
module.exports={auditFailureSummary};
