using System;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
class IllustratorBridge {
 [STAThread] static void Main(string[] args) {
  Console.OutputEncoding=System.Text.Encoding.UTF8;object app=null;bool dispatched=false;string phase="连接";
  try {
   if(args.Length!=1||!File.Exists(args[0])||Path.GetExtension(args[0]).ToLowerInvariant()!=".jsx")throw new Exception("Invalid Illustrator script path");
   Type type;app=AdobeConnection.Connect("Illustrator",out type);
   phase="脚本接口预检";
   object probe=type.InvokeMember("DoJavaScript",BindingFlags.InvokeMethod|BindingFlags.OptionalParamBinding,null,app,new object[]{"'sparkit-native-ready'"});
   if(Convert.ToString(probe)!="sparkit-native-ready")throw new Exception("原生脚本接口未返回预期的就绪结果");
   phase="执行脚本";dispatched=true;
   type.InvokeMember("DoJavaScriptFile",BindingFlags.InvokeMethod|BindingFlags.OptionalParamBinding,null,app,new object[]{Path.GetFullPath(args[0])});
  } catch(Exception e) {Exception cause=e.InnerException??e;Console.Error.WriteLine("Illustrator "+phase+"失败 [0x"+cause.HResult.ToString("X8")+"]。"+(dispatched?"脚本已提交，执行结果不确定；请检查输出副本，不要重复保存。":"本次文件脚本尚未提交。请结束编辑、关闭模态弹窗；保存当前工作后可重启 Illustrator 再试。")+" 详细信息："+cause.Message);Environment.ExitCode=dispatched?21:20;}
  finally {if(app!=null&&Marshal.IsComObject(app))Marshal.ReleaseComObject(app);}
 }
}
