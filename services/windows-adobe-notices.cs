using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
// No foreground activation, input injection or preference changes. Only the
// known informational notice raised by our in-progress composition save.
class AdobeSaveNotice : IDisposable {
 delegate bool Callback(IntPtr h,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumWindows(Callback cb,IntPtr p);
 [DllImport("user32.dll")]static extern bool EnumChildWindows(IntPtr h,Callback cb,IntPtr p);
 [DllImport("user32.dll")]static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")]static extern bool IsWindowEnabled(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr h,StringBuilder text,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr h,StringBuilder text,int n);
 [DllImport("user32.dll")]static extern IntPtr SendMessageTimeout(IntPtr h,uint message,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 readonly ManualResetEvent stop=new ManualResetEvent(false);readonly HashSet<IntPtr> previous=new HashSet<IntPtr>();Thread thread;uint pid;string folder;
 static string Text(IntPtr h){var s=new StringBuilder(2048);GetWindowText(h,s,s.Capacity);return s.ToString();}
 internal static bool Known(string text){return text=="此文档包含嵌套的图层组，如果在版本低于 Photoshop CS6 的应用程序中打开，外观可能会发生变化。"||text=="This document contains nested layer groups that may change in appearance if opened in applications older than Photoshop CS6.";}
 public AdobeSaveNotice(string script){
  if(!File.ReadAllText(script).Contains("// sparkit:composition-save-notice"))return;
  var processes=Process.GetProcessesByName("Photoshop");try{if(processes.Length!=1)return;pid=(uint)processes[0].Id;}finally{foreach(var p in processes)p.Dispose();}
  folder=Path.GetDirectoryName(script);EnumWindows(delegate(IntPtr h,IntPtr p){if(IsWindowVisible(h))previous.Add(h);return true;},IntPtr.Zero);
  thread=new Thread(Watch);thread.IsBackground=true;thread.Start();
 }
 void Watch(){while(!stop.WaitOne(250))try{
  string progress=Path.Combine(folder,"native-progress.json");if(!File.Exists(progress)||!File.ReadAllText(progress).Contains("\"stage\":\"保存可编辑副本\""))continue;
  EnumWindows(delegate(IntPtr h,IntPtr p){uint owner;GetWindowThreadProcessId(h,out owner);if(owner!=pid||previous.Contains(h)||!IsWindowVisible(h))return true;
   var cls=new StringBuilder(80);GetClassName(h,cls,80);if((cls.ToString()!="#32770"&&cls.ToString()!="PSDialogBox")||Text(h)!="Adobe Photoshop")return true;
   bool known=false;var buttons=new List<IntPtr>();EnumChildWindows(h,delegate(IntPtr child,IntPtr ignored){string text=Text(child);if(Known(text))known=true;var kind=new StringBuilder(80);GetClassName(child,kind,80);if(kind.ToString()=="Button"&&(text=="确定"||text=="OK"||text=="&OK")&&IsWindowEnabled(child))buttons.Add(child);return true;},IntPtr.Zero);
   if(known&&buttons.Count==1&&!stop.WaitOne(0)){IntPtr result;var sent=SendMessageTimeout(buttons[0],0x00F5,IntPtr.Zero,IntPtr.Zero,2,500,out result);if(sent!=IntPtr.Zero){previous.Add(h);File.AppendAllText(Path.Combine(folder,"native-notices.log"),DateTime.UtcNow.ToString("o")+" acknowledged nested-group compatibility information\n");}}return true;
  },IntPtr.Zero);
 }catch{/* Keep the original Adobe call authoritative; never retry it. */}}
 public void Dispose(){stop.Set();if(thread!=null)thread.Join();stop.Dispose();}
}
