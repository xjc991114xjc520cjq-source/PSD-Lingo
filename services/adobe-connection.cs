using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Reflection;
// Resolve installed versioned COM registrations; attach before activating a new process.
static class AdobeConnection {
 public static object Connect(string name,out Type selected) {return Connect(name,out selected,true);}
 public static object ConnectReady(string name,out Type selected) {
  Type acquired=null;
  object ready=null;BoundedPreflight(delegate{ready=AwaitReady(delegate {object app=Connect(name,out acquired);return app;},delegate(object app){object value=acquired.InvokeMember("DoJavaScript",BindingFlags.InvokeMethod|BindingFlags.OptionalParamBinding,null,app,new object[]{"'sparkit-native-ready'"});if(Convert.ToString(value)!="sparkit-native-ready")throw new Exception("原生脚本接口未返回预期的就绪结果");},delegate(object app){if(app!=null&&Marshal.IsComObject(app))Marshal.ReleaseComObject(app);},Thread.Sleep);},45000,name);
  selected=acquired;return ready;
 }
 // The helper exits only while no customer file script has been submitted.
 // The lock makes timeout vs dispatch a single decision; long file scripts have no watchdog.
 internal static void BoundedPreflight(Action ready,int timeoutMs,string name){
  object gate=new object();bool completed=false;
  using(var timer=new Timer(delegate(object unused){lock(gate){if(completed)return;Console.Error.WriteLine(name+" connection preflight timed out; file script was not submitted. 软件连接等待超时，未开始修改文件。软件可能尚未启动完成、被对话框阻塞或 COM 未注册；请先确认 Adobe 能正常打开，再点击继续，已完成步骤保留。");Environment.Exit(20);}},null,timeoutMs,Timeout.Infinite)){
   try{ready();}finally{lock(gate){completed=true;}}
  }
 }
 // Only the harmless readiness probe is retried. Never replay a submitted file script.
 internal static object AwaitReady(Func<object> acquire,Action<object> probe,Action<object> release,Action<int> wait){
  for(int attempt=0;;attempt++){object app=null;try{app=acquire();probe(app);return app;}catch(Exception error){if(app!=null)release(app);if(attempt>=3||!Transient(error))throw;wait(500*(attempt+1));}}
 }
 static bool Transient(Exception error){for(Exception e=error;e!=null;e=e.InnerException){uint code=unchecked((uint)e.HResult);if(code==0x80010001||code==0x8001010A||code==0x80010108||code==0x800706BA||code==0x800706BE||code==0x800401E3)return true;}return false;}

 static object Connect(string name,out Type selected,bool allowLaunch) {
  var ids=new List<string>();string prefix=name+".Application";ids.Add(prefix);
  try{object active=Marshal.GetActiveObject(prefix);selected=Type.GetTypeFromProgID(prefix);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}
  try {foreach(string id in Registry.ClassesRoot.GetSubKeyNames())if(id.StartsWith(prefix+".",StringComparison.OrdinalIgnoreCase)&&!ids.Contains(id))ids.Add(id);}catch{}
  ids.Sort(delegate(string a,string b){if(a==prefix)return -1;if(b==prefix)return 1;Version av,bv;Version.TryParse(a.Substring(Math.Min(a.Length,prefix.Length)).TrimStart('.'),out av);Version.TryParse(b.Substring(Math.Min(b.Length,prefix.Length)).TrimStart('.'),out bv);return (bv??new Version()).CompareTo(av??new Version());});
  foreach(string id in ids)try{object active=Marshal.GetActiveObject(id);selected=Type.GetTypeFromProgID(id);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}
  // Start a discovered installation before COM activation: Activator may block indefinitely during cold start.
  if(allowLaunch&&Process.GetProcessesByName(name).Length==0){string exe=FindExecutable(name);if(exe!=null){var info=new ProcessStartInfo(exe);info.UseShellExecute=false;info.WindowStyle=ProcessWindowStyle.Hidden;Process.Start(info);for(int i=0;i<30;i++){Thread.Sleep(1000);foreach(string id in ids)try{object active=Marshal.GetActiveObject(id);selected=Type.GetTypeFromProgID(id);if(selected!=null)return active;Marshal.ReleaseComObject(active);}catch{}if(Process.GetProcessesByName(name).Length==0)throw new Exception(name+" 启动后已退出，文件脚本尚未提交；请先确认 Adobe 能正常打开，再点击继续，已完成步骤保留。");}throw new Exception(name+" 已启动但未返回可用的 COM 接口，文件脚本尚未提交；请确认软件已打开且没有阻塞对话框，再点击继续，已完成步骤保留。");}}
  Exception last=null;foreach(string id in ids)try{Type t=Type.GetTypeFromProgID(id);if(t==null)continue;object instance=Activator.CreateInstance(t);selected=t;return instance;}catch(Exception e){last=e;}
  selected=null;throw new Exception(name+" 自动连接失败；未发现可用的通用或版本化 COM 接口，请检查安装注册及运行权限。"+(last==null?"":" [0x"+last.HResult.ToString("X8")+"] "+last.Message),last);
 }

 internal static string LocalServerExecutable(string command){
  if(String.IsNullOrWhiteSpace(command))return null;command=Environment.ExpandEnvironmentVariables(command.Trim());
  if(command.StartsWith("\"")){int end=command.IndexOf('"',1);return end>1?command.Substring(1,end-1):null;}
  int exe=command.IndexOf(".exe",StringComparison.OrdinalIgnoreCase);return exe>=0?command.Substring(0,exe+4):null;
 }
 static string FindExecutable(string name){
  // Custom Adobe installations may only be registered as a COM local server.
  var progIds=new List<string>();progIds.Add(name+".Application");try{foreach(string id in Registry.ClassesRoot.GetSubKeyNames())if(id.StartsWith(name+".Application.",StringComparison.OrdinalIgnoreCase))progIds.Add(id);}catch{}
  foreach(string id in progIds)try{Type type=Type.GetTypeFromProgID(id);if(type==null)continue;using(var key=Registry.ClassesRoot.OpenSubKey(@"CLSID\{"+type.GUID.ToString()+@"}\LocalServer32")){string file=LocalServerExecutable(key==null?null:Convert.ToString(key.GetValue(null)));if(file!=null&&String.Equals(Path.GetFileName(file),name+".exe",StringComparison.OrdinalIgnoreCase)&&File.Exists(file))return file;}}catch{}

  foreach(RegistryHive hive in new[]{RegistryHive.LocalMachine,RegistryHive.CurrentUser})foreach(RegistryView view in new[]{RegistryView.Registry64,RegistryView.Registry32})try{using(var root=RegistryKey.OpenBaseKey(hive,view))using(var key=root.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\"+name+".exe")){var value=key==null?null:Convert.ToString(key.GetValue(null));if(!String.IsNullOrEmpty(value)&&File.Exists(value.Trim('"')))return value.Trim('"');}}catch{}
  foreach(string programs in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86)}){string adobe=Path.Combine(programs,"Adobe");if(!Directory.Exists(adobe))continue;try{var dirs=Directory.GetDirectories(adobe,"Adobe "+name+"*");Array.Sort(dirs,StringComparer.OrdinalIgnoreCase);Array.Reverse(dirs);foreach(string dir in dirs)foreach(string relative in new[]{name+".exe",@"Support Files\Contents\Windows\"+name+".exe"}){string file=Path.Combine(dir,relative);if(File.Exists(file))return file;}}catch{}}
  return null;
 }
}
