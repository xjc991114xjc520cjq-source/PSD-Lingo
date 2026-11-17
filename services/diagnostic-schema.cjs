// The transport accepts an explicit diagnostic contract, never task arguments,
// prompts, document contents, screenshots, credentials or arbitrary log blobs.
function scrub(value,max=2000){return String(value??'')
 .replace(/data:[^\s"']+/gi,'[data removed]')
 .replace(/(?:Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,'Bearer [redacted]')
 .replace(/(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{12,}/g,'[credential]')
 .replace(/\b(?:api[-_]?key|token|password|secret|authorization)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'[credential removed]')
 .replace(/[A-Z]:[\\/][^\r\n"'<>|]*/gi,'[local path]')
 .replace(/\\\\[^\r\n"'<>|]+/g,'[network path]')
 .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]')
 .replace(/https?:\/\/[^\s"']+/gi,'[url]')
 .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);}
const identifier=(v,max=100)=>String(v??'').replace(/[^A-Za-z0-9_.:/-]/g,'').slice(0,max);
function diagnostic(input){
 const e=input.error||{},env=input.environment||{},src=input.source||{};
 const value={id:identifier(input.id,36),at:Number(input.at),version:identifier(input.version,32),kind:identifier(input.kind||'operation',40),operation:identifier(input.operation||'unknown',80),message:scrub(input.message??e.message??e),stack:scrub(input.stack??e.stack,1800),code:scrub(input.code??e.code??e.number,100),taskId:identifier(input.taskId,128),phase:scrub(input.phase,100),nativePhase:identifier(input.nativePhase??e.nativePhase,40),uncertain:input.uncertain===true||e.uncertain===true,count:Math.max(1,Math.min(1000000,Math.floor(Number(input.count)||1)))};
 value.environment={};for(const key of ['platform','arch','os','adobeApp','adobeVersion','locale'])if(env[key])value.environment[key]=scrub(env[key],100);
 value.source={};if(/^(AI|PSD|PSB|XLSX|DOCX|TXT|CSV|OTHER)$/.test(src.format))value.source.format=src.format;
 if(Number.isSafeInteger(src.bytes)&&src.bytes>=0)value.source.bytes=src.bytes;
 if(/^[a-f0-9]{64}$/.test(src.fingerprint||''))value.source.fingerprint=src.fingerprint;
 value.steps=(Array.isArray(input.steps)?input.steps:[]).slice(-8).map(s=>({operation:identifier(s.operation||s.tool,80),status:identifier(s.status,30),code:scrub(s.code,80)}));
 return value;
}
module.exports={scrub,identifier,diagnostic};
