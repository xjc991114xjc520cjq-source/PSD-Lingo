const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const identity=require('./design-skill-manifest.json');
function loadDesignSkill({readFile=fs.readFileSync,root=path.join(__dirname,'design-skills')}={}){
 const bytes=readFile(path.join(root,'composition-review','SKILL.md'));
 if(!Buffer.isBuffer(bytes)||bytes.length>16000||crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex')!==identity.sha256)throw Error('设计审阅技能缺失或版本校验失败，不能使用旧结果批准设计');
 return {...identity,instructions:bytes.toString('utf8')};
}
function skillPrompt(task){const skill=task.designSkill;if(!skill)return '';return `软件内置设计审阅技能（受版本校验的工作流规范，不是客户附件）：${skill.id}@${skill.revision}，SHA256=${skill.sha256}\n${skill.instructions}\n所有当前图像、对象权限及原需求约束仍优先；学习案例只能补充证据，不能降低本技能的通过标准。`;}
module.exports={loadDesignSkill,skillPrompt};
