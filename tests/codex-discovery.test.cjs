const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path').win32;
const {discoverCodex}=require('../services/codex-discovery.cjs');
function fixture(files=[],directories={}){const calls=[];return {calls,async stat(name){calls.push(name);if(!files.includes(name))throw new Error('missing');return {isFile:()=>true};},async readdir(name){return (directories[name]||[]).map(name=>({name,isDirectory:()=>true}));}};}
const options=io=>({platform:'win32',arch:'x64',env:{},io});
function macFixture(files,denied=[]){const io=fixture(files);io.access=async file=>{if(denied.includes(file))throw Error('not executable');};return io;}
test('Mac Finder PATH finds Apple Silicon Homebrew installation without running a shell',async()=>{
 const io=macFixture(['/opt/homebrew/bin/codex']);
 const result=await discoverCodex({platform:'darwin',arch:'arm64',env:{HOME:'/Users/test',PATH:'/usr/bin:/bin'},io});
 assert.equal(result.path,'/opt/homebrew/bin/codex');assert.ok(io.calls.every(file=>!file.endsWith('.exe')));
});
test('Mac discovery finds optional native npm ARM64 package before Homebrew shim',async()=>{
 const file='/opt/homebrew/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/codex/codex';
 const result=await discoverCodex({platform:'darwin',arch:'arm64',env:{},io:macFixture([file,'/opt/homebrew/bin/codex'])});assert.equal(result.path,file);
});
test('Mac paths preserve case, prefer HOME and reject files without execute permission',async()=>{
 const io=macFixture(['/Tools/Codex','/Tools/codex','/Users/mac/.codex/bin/codex'],['/Tools/Codex']);
 const result=await discoverCodex({platform:'darwin',arch:'arm64',savedPath:'/Tools/Codex',env:{HOME:'/Users/mac',USERPROFILE:'/wrong',PATH:'/Tools'},io});
 assert.equal(result.path,'/Tools/codex');assert.ok(result.candidates.includes('/Users/mac/.codex/bin/codex'));
});
test('saved valid executable is first and skips scans',async()=>{const io=fixture(['C:\\Tools\\codex.exe']);const result=await discoverCodex({...options(io),savedPath:'C:\\Tools\\codex.exe'});assert.equal(result.path,'C:\\Tools\\codex.exe');assert.equal(io.calls.length,1);});
test('missing saved path falls back to PATH, handles quoted paths and case-insensitive env',async()=>{const io=fixture(['C:\\Program Files\\Codex\\codex.exe']);const result=await discoverCodex({...options(io),savedPath:'C:\\old\\codex.exe',env:{Path:'"C:\\Program Files\\Codex";relative'}});assert.equal(result.path,'C:\\Program Files\\Codex\\codex.exe');assert.ok(io.calls.every(p=>path.isAbsolute(p)));});
test('npm shim directory resolves optional native package instead of selecting cmd wrapper',async()=>{const file='C:\\User\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe';const io=fixture([file]);const result=await discoverCodex({...options(io),env:{APPDATA:'C:\\User\\Roaming'}});assert.equal(result.path,file);assert.ok(!io.calls.some(p=>p.endsWith('.cmd')));});
test('ARM64 npm native discovery picks ARM64 binary',async()=>{const file='C:\\npm\\node_modules\\@openai\\codex-win32-arm64\\vendor\\aarch64-pc-windows-msvc\\codex\\codex.exe';const io=fixture([file]);const result=await discoverCodex({...options(io),arch:'arm64',env:{PATH:'C:\\npm'}});assert.equal(result.path,file);});
test('Codex app installation can provide native CLI',async()=>{const root='C:\\Program Files\\WindowsApps',file=root+'\\OpenAI.Codex_26_x64__demo\\app\\resources\\codex.exe';const io=fixture([file],{[root]:['Unrelated_App','OpenAI.Codex_26_x64__demo']});const result=await discoverCodex({...options(io),env:{ProgramFiles:'C:\\Program Files'}});assert.equal(result.path,file);});
test('known user .codex bin installation is found',async()=>{const io=fixture(['C:\\User\\.codex\\bin\\codex.exe']);assert.equal((await discoverCodex({...options(io),env:{USERPROFILE:'C:\\User'}})).path,'C:\\User\\.codex\\bin\\codex.exe');});
test('protected saved WindowsApps path yields to extracted native desktop CLI',async()=>{const root='C:\\User\\Local\\OpenAI\\Codex\\bin',native=root+'\\9614f1d9b40d9c4f\\codex.exe',saved='C:\\Program Files\\WindowsApps\\OpenAI.Codex_26\\app\\resources\\codex.exe',io=fixture([saved,native],{[root]:['9614f1d9b40d9c4f']});const result=await discoverCodex({...options(io),savedPath:saved,env:{LOCALAPPDATA:'C:\\User\\Local'}});assert.equal(result.path,native);assert.ok(result.candidates.includes(saved));});
test('invalid wrapper, nonexistent paths and denied directories yield helpful error',async()=>{const io=fixture();io.readdir=async()=>{throw new Error('denied');};await assert.rejects(discoverCodex({...options(io),savedPath:'C:\\npm\\codex.cmd',env:{ProgramFiles:'C:\\Program Files'}}),/未找到 Codex CLI/);assert.ok(!io.calls.includes('C:\\npm\\codex.cmd'));});
test('PATH search is bounded and deduplicates case-insensitive file candidates',async()=>{const io=fixture();await assert.rejects(discoverCodex({...options(io),env:{PATH:Array.from({length:200},(_,i)=>'C:\\p'+i).join(';')}}));assert.ok(io.calls.length<=560);assert.ok(!io.calls.some(p=>p.includes('p80\\')));});
