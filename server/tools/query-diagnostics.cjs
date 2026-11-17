// Development/admin tool. Login proof lives outside the repository and is never
// shipped in the client. stdout contains diagnostic records, never login data.
const fs=require('node:fs/promises');
async function queryDiagnostics({server,login,filters={},fetch:send=fetch}){
 const root=new URL(server);if(root.protocol!=='https:'||root.username||root.password||root.pathname!=='/')throw Error('诊断服务地址必须是HTTPS根地址');
 const response=await send(root.origin+'/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(login),signal:AbortSignal.timeout(15000)}),session=await response.json();if(!response.ok)throw Error('管理员登录失败：'+session.code);
 const params=new URLSearchParams({limit:'30'});for(const key of ['id','device','version','task','code','before','cursor'])if(filters[key])params.set(key,String(filters[key]));
 const result=await send(root.origin+'/admin/diagnostics?'+params,{headers:{Authorization:'Bearer '+session.token},signal:AbortSignal.timeout(15000)}),body=await result.json();if(!result.ok)throw Error('读取诊断失败：'+body.code);return body;
}
module.exports={queryDiagnostics};
if(require.main===module)(async()=>{const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!/^--(login-file|id|device|version|task|code|before|cursor)$/.test(args[i])||!args[i+1])throw Error('参数格式：--login-file 本机管理员登录凭据文件 --id 错误编号（或 --version / --device / --task / --code）');options[args[i].slice(2)]=args[i+1];}const file=options['login-file']||process.env.SPARKIT_DIAGNOSTICS_LOGIN;if(!file)throw Error('请通过--login-file或SPARKIT_DIAGNOSTICS_LOGIN指定本机管理员登录凭据文件');const login=JSON.parse(await fs.readFile(file,'utf8')),server=require('../../services/product-config.cjs').serverUrl;console.log(JSON.stringify(await queryDiagnostics({server,login,filters:options}),null,2));})().catch(e=>{console.error(e.message);process.exitCode=1;});
