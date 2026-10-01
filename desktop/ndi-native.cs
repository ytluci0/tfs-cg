// Documented NDI C ABI. Interface declarations derived from the NDI headers;
// see assets/NDI-NOTICES.txt. The proprietary runtime is loaded from the user's installation.
using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Web.Script.Serialization;

public static class NdiApi {
 [DllImport("kernel32", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryEx(string path, IntPtr file, uint flags);
 [DllImport("kernel32", CharSet=CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module,string name);
 static IntPtr module;
 public static T Bind<T>(string name) { var p=GetProcAddress(module,"NDIlib_"+name); if(p==IntPtr.Zero)throw new Exception("Required NDI API missing: "+name); return (T)(object)Marshal.GetDelegateForFunctionPointer(p,typeof(T)); }
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] [return:MarshalAs(UnmanagedType.I1)] public delegate bool Initialize();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void Destroy();
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr Version();
 public static void Load(string path) { if(!Path.IsPathRooted(path)||Path.GetFileName(path)!="Processing.NDI.Lib.x64.dll")throw new Exception("Invalid NDI runtime path"); module=LoadLibraryEx(path,IntPtr.Zero,0x100|0x800);if(module==IntPtr.Zero)throw new Exception("NDI runtime could not load: "+Marshal.GetLastWin32Error());if(!Bind<Initialize>("initialize")())throw new Exception("NDI initialization failed");if(Marshal.SizeOf(typeof(Video))!=72)throw new Exception("Unexpected video ABI"); }
 public static IntPtr Utf8(string value) { var bytes=Encoding.UTF8.GetBytes(value+"\0");var p=Marshal.AllocHGlobal(bytes.Length);Marshal.Copy(bytes,0,p,bytes.Length);return p; }
 [StructLayout(LayoutKind.Sequential)] public struct Source {public IntPtr name,address;}
 [StructLayout(LayoutKind.Sequential)] public struct Video {public int width,height,fourCC,numerator,denominator;public float aspect;public int format;public long timecode;public IntPtr data;public int stride;public IntPtr metadata;public long timestamp;}
 [StructLayout(LayoutKind.Sequential)] public struct Sender {public IntPtr name,groups;[MarshalAs(UnmanagedType.I1)]public bool clockVideo;[MarshalAs(UnmanagedType.I1)]public bool clockAudio;}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr CreateSender(ref Sender settings);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void SendVideo(IntPtr sender,ref Video video);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate void Release(IntPtr instance);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate int Connections(IntPtr sender,uint timeout);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] public delegate IntPtr GetSource(IntPtr sender);
 public static void Print(object value) { Console.WriteLine(new JavaScriptSerializer().Serialize(value));Console.Out.Flush(); }
}

public static class NdiSender {
 static volatile bool running=true;
 static readonly object gate=new object();
 static readonly AutoResetEvent available=new AutoResetEvent(false);
 static byte[] next;
 static long nextId;
 public static int Main(string[] args) {
  IntPtr sender=IntPtr.Zero,name=IntPtr.Zero;bool loaded=false;
  try {
   if(args.Length!=5)throw new Exception("Expected runtime, source name, width, height, fps");
   int w=int.Parse(args[2]),h=int.Parse(args[3]),fps=int.Parse(args[4]);
   if(!((w==1280&&h==720)||(w==1920&&h==1080))||!(fps==25||fps==30||fps==50||fps==60)||args[1].Length<1||args[1].Length>80)throw new Exception("Unsupported NDI format");
   NdiApi.Load(args[0]);loaded=true;name=NdiApi.Utf8(args[1]);
   var settings=new NdiApi.Sender{name=name,clockVideo=true,clockAudio=false};
   sender=NdiApi.Bind<NdiApi.CreateSender>("send_create")(ref settings);if(sender==IntPtr.Zero)throw new Exception("NDI sender creation failed");
   var send=NdiApi.Bind<NdiApi.SendVideo>("send_send_video_v2");var connections=NdiApi.Bind<NdiApi.Connections>("send_get_no_connections");
   var source=(NdiApi.Source)Marshal.PtrToStructure(NdiApi.Bind<NdiApi.GetSource>("send_get_source_name")(sender),typeof(NdiApi.Source));
   NdiApi.Print(new{type="ready",source=Marshal.PtrToStringAnsi(source.name),runtime=Marshal.PtrToStringAnsi(NdiApi.Bind<NdiApi.Version>("version")())});
   var reader=new Thread(()=>{try{using(var stream=new BinaryReader(Console.OpenStandardInput())){while(running){long id=stream.ReadInt64();int length=stream.ReadInt32();if(id<1||length!=w*h*4)throw new Exception("Invalid frame");var bytes=stream.ReadBytes(length);if(bytes.Length!=length)break;lock(gate){next=bytes;nextId=id;available.Set();}}}}catch{}finally{running=false;available.Set();}});reader.IsBackground=true;reader.Start();
   var clock=Stopwatch.StartNew();long frames=0,repeated=0,lastReport=0,idNow=0;double maxSend=0;byte[] current=new byte[w*h*4];
   var video=new NdiApi.Video{width=w,height=h,fourCC=0x41524742,numerator=fps,denominator=1,aspect=(float)w/h,format=1,timecode=long.MaxValue,stride=w*4};
   while(running){
    // Give the producer time to deliver the next frame after the previous send's
    // acknowledgement. Without this, an immediate repeat occupies the next SDK
    // clock slot while a fresh bitmap is already travelling through the pipe.
    bool waiting;lock(gate){waiting=next==null;}if(waiting)available.WaitOne(Math.Max(1,1000/fps-4));if(!running)break;
    byte[] changed=null;lock(gate){if(next!=null){changed=next;idNow=nextId;next=null;available.Reset();}}
    if(changed!=null){current=changed;Unpremultiply(current);}else repeated++;
    var pin=GCHandle.Alloc(current,GCHandleType.Pinned);double start=clock.Elapsed.TotalMilliseconds;
    try{video.data=pin.AddrOfPinnedObject();send(sender,ref video);}finally{pin.Free();}
    frames++;maxSend=Math.Max(maxSend,clock.Elapsed.TotalMilliseconds-start);
    if(changed!=null)NdiApi.Print(new{type="sent",id=idNow});
    if(clock.ElapsedMilliseconds-lastReport>=1000){lastReport=clock.ElapsedMilliseconds;NdiApi.Print(new{type="health",frames=frames,repeated=repeated,elapsedMs=lastReport,connections=connections(sender,0),maxSendMs=Math.Round(maxSend,2)});}
   }
   return 0;
  } catch(Exception e){NdiApi.Print(new{type="error",error=e.Message});return 1;}
  finally{running=false;if(sender!=IntPtr.Zero)NdiApi.Bind<NdiApi.Release>("send_destroy")(sender);if(name!=IntPtr.Zero)Marshal.FreeHGlobal(name);if(loaded)NdiApi.Bind<NdiApi.Destroy>("destroy")();}
 }
 public static void Unpremultiply(byte[] bytes){for(int i=0;i<bytes.Length;i+=4){int a=bytes[i+3];if(a==255)continue;if(a==0){bytes[i]=bytes[i+1]=bytes[i+2]=0;continue;}for(int c=0;c<3;c++)bytes[i+c]=(byte)Math.Min(255,(bytes[i+c]*255+a/2)/a);}}
}
