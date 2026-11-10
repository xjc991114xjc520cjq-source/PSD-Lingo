const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../renderer/license-status.js'),'utf8').replaceAll('export function ','function ');
const {timestamp,formatRemaining,formatCalendarRemaining,authorizationView}=new Function(source+';return {timestamp,formatRemaining,formatCalendarRemaining,authorizationView};')();
const {Authorization}=require('../services/authorization.cjs');
test('authorization timestamps normalize ISO UTC, epoch seconds and milliseconds without guessing missing dates',()=>{
 const expected=Date.parse('2026-10-20T02:03:04Z');assert.equal(timestamp('2026-10-20T02:03:04Z'),expected);assert.equal(timestamp(expected/1000),expected);assert.equal(timestamp(String(expected/1000)),expected);assert.equal(timestamp(expected),expected);assert.equal(timestamp(null),null);assert.equal(timestamp(''),null);assert.equal(timestamp('nonsense'),null);
});
test('countdown uses appropriate units through day/hour/minute/second and expiry boundaries',()=>{
 assert.equal(formatRemaining(90061),'1 天 1 小时 1 分 1 秒');assert.equal(formatRemaining(3661),'1 小时 1 分 1 秒');assert.equal(formatRemaining(61),'1 分 1 秒');assert.equal(formatRemaining(1),'1 秒');assert.equal(formatRemaining(0),'已到期');assert.equal(formatRemaining(-1),'已到期');assert.equal(formatRemaining(NaN),'未提供');
});
test('long authorization uses complete calendar years and exact remaining interval across leap years',()=>{
 const f=(a,b)=>formatCalendarRemaining(Date.parse(a),Date.parse(b));
 assert.equal(f('2020-01-01T00:00:00Z','2030-01-01T00:00:00Z'),'10 年 0 天 0 小时 0 分 0 秒');
 assert.equal(f('2020-01-01T00:00:01Z','2030-01-01T00:00:00Z'),'9 年 364 天 23 小时 59 分 59 秒');
 assert.equal(f('2023-03-01T00:00:00Z','2024-03-01T00:00:00Z'),'1 年 0 天 0 小时 0 分 0 秒');
 assert.equal(f('2024-02-29T12:00:00Z','2025-02-28T12:00:00Z'),'1 年 0 天 0 小时 0 分 0 秒');
 assert.equal(f('2024-02-29T12:00:00Z','2025-02-28T11:59:59Z'),'364 天 23 小时 59 分 59 秒');
 assert.equal(f('2026-10-20T00:00:00Z','2036-10-22T03:04:05Z'),'10 年 2 天 3 小时 4 分 5 秒');
 assert.equal(f('2024-03-01T00:00:00Z','2024-03-01T00:00:00Z'),'已到期');
});
test('long authorization calendar countdown advances from the monotonic server reference',()=>{
 const a={enabled:true,active:true,remainingSeconds:900,serverNowUtc:'2020-01-01T00:00:00Z',licenseExpiresAtUtc:'2030-01-01T00:00:00Z'};
 assert.equal(authorizationView(a).remaining,'10 年 0 天 0 小时 0 分 0 秒');assert.equal(authorizationView(a,1000).remaining,'9 年 364 天 23 小时 59 分 59 秒');
});
test('license dates and remaining countdown use server reference and never confuse fifteen minute lease with license validity',()=>{
 const a={enabled:true,active:true,remainingMilliseconds:900000,licenseType:'standard',serverNowUtc:'2026-10-20T00:00:00Z',licenseStartsAtUtc:'2026-10-01T00:00:00Z',licenseExpiresAtUtc:'2026-10-21T00:00:00Z'};
 const v=authorizationView(a,1000);assert.equal(v.type,'标准许可');assert.equal(v.label,'授权有效');assert.equal(v.remaining,'23 小时 59 分 59 秒');assert.equal(v.lease,'14 分 59 秒');assert.equal(v.start,Date.parse(a.licenseStartsAtUtc));assert.equal(authorizationView(a,900001).label,'需要授权');assert.equal(authorizationView({...a,serverNowUtc:'2026-10-21T00:00:00Z'}).remaining,'已到期');
});
test('local tests, older lease payloads and permanent license have honest distinct displays',()=>{
 const local=authorizationView({enabled:false,active:true,licenseType:'standard'});assert.equal(local.label,'本地测试');assert.equal(local.start,null);assert.equal(local.remaining,'不适用');
 const old=authorizationView({enabled:true,active:true,remainingSeconds:60,expiresAtUtc:'2026-10-20T02:00:00Z'});assert.equal(old.end,null);assert.equal(old.remaining,'服务端未提供');assert.equal(old.type,'服务端未提供');
 assert.equal(authorizationView({enabled:true,active:true,remainingSeconds:60,licensePermanent:true,licenseType:'permanent'}).remaining,'永久有效');
});
test('authorization status exposes only verified lease metadata with elapsed server clock, not raw secret',()=>{
 let now=1000;const auth=new Authorization({config:{authorizationEnabled:true,channel:'fixture'},now:()=>now});auth.license='SECRET';auth.lease={duration:900000,received:1000,payload:{serverTimeUtc:'2026-10-20T00:00:00Z',expiresAtUtc:'2026-10-20T00:15:00Z',licenseType:'free',licenseStartsAtUtc:'2026-10-01T00:00:00Z',licenseExpiresAtUtc:'2026-11-01T00:00:00Z',features:['psd-export']}};now+=1234;const s=auth.status();assert.equal(s.serverNowUtc,'2026-10-20T00:00:01.234Z');assert.equal(s.remainingMilliseconds,898766);assert.equal(s.licenseType,'free');assert.equal(s.licenseExpiresAtUtc,'2026-11-01T00:00:00Z');assert.ok(!JSON.stringify(s).includes('SECRET'));auth.close();
});
test('real Worker signs license validity separately from renewable offline lease',async()=>{
 const crypto=require('node:crypto'),{fixture}=require('./support/worker-fixture.cjs'),{canonical,deviceId,checkLease}=require('../services/protocol.cjs');const f=await fixture();
 try{const created=(await f.create()).data,k=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}),spki=k.publicKey.export({format:'der',type:'spki'}).toString('base64'),common={appId:'PSDLingo',buildId:'0.2.0',deviceId:deviceId(spki),spki,license:created.license};const c=(await f.post('/v1/challenge',common)).data,payload={appId:common.appId,buildId:common.buildId,deviceId:common.deviceId,challengeId:c.challengeId,nonce:c.nonce},signature=crypto.sign('sha256',Buffer.from(canonical(payload)),{key:k.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64'),r=await f.post('/v1/session/open',{...common,payload,signature});assert.equal(r.status,200);const checked=checkLease(r.data,{'lease-1':f.key.publicKey},{appId:common.appId,device:common.deviceId,version:common.buildId}),p=checked.payload;assert.equal(p.licenseType,'standard');assert.ok(Date.parse(p.licenseStartsAtUtc)<=Date.parse(p.serverTimeUtc));assert.ok(Date.parse(p.licenseExpiresAtUtc)>Date.parse(p.expiresAtUtc));assert.equal(p.licensePermanent,false);}finally{f.db.close();}
});
