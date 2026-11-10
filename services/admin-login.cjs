const crypto=require('node:crypto'),{promisify}=require('node:util');
const derive=promisify(crypto.pbkdf2);
async function adminLoginBody(password,params){
 if(typeof password!=='string'||password.length>256)throw new Error('管理员密码格式无效');
 if(params?.scheme!=='client-pbkdf2-sha256')return {password};
 if(!Number.isInteger(params.iterations)||params.iterations<200000||params.iterations>2000000||typeof params.salt!=='string'||!/^[A-Za-z0-9+/]{20,88}={0,2}$/.test(params.salt))throw new Error('管理员密码派生参数无效');
 const salt=Buffer.from(params.salt,'base64');if(salt.length<16||salt.length>64)throw new Error('管理员密码盐无效');
 const key=await derive(password,salt,params.iterations,32,'sha256');try{return {passwordProof:key.toString('base64')};}finally{key.fill(0);}
}
module.exports={adminLoginBody};
