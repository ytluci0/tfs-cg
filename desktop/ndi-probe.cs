// Independent receiving process used for qualification only; excluded from installer.
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class NdiProbe {
 [StructLayout(LayoutKind.Sequential)] struct Receiver {public NdiApi.Source source;public int color,bandwidth;[MarshalAs(UnmanagedType.I1)]public bool fields;public IntPtr name;}
 [StructLayout(LayoutKind.Sequential)] struct Performance {public long video,audio,metadata;}
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr Create(ref Receiver r);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int Capture(IntPtr r,ref NdiApi.Video v,IntPtr a,IntPtr m,uint timeout);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Free(IntPtr r,ref NdiApi.Video v);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Stats(IntPtr r,ref Performance total,ref Performance dropped);
 public static int Main(string[] args){IntPtr r=IntPtr.Zero,name=IntPtr.Zero;try{
  NdiApi.Load(args[0]);name=NdiApi.Utf8(args[1]);var settings=new Receiver{source=new NdiApi.Source{name=name},bandwidth=100,color=0,fields=false};
  r=NdiApi.Bind<Create>("recv_create_v3")(ref settings);if(r==IntPtr.Zero)throw new Exception("Receive creation failed");var capture=NdiApi.Bind<Capture>("recv_capture_v2");var free=NdiApi.Bind<Free>("recv_free_video_v2");var stats=NdiApi.Bind<Stats>("recv_get_performance");var watch=Stopwatch.StartNew();long count=0,firstMs=0,lastMs=0;int seconds=int.Parse(args[2]);var last=new NdiApi.Video();
  while(watch.Elapsed.TotalSeconds<seconds){var v=new NdiApi.Video();if(capture(r,ref v,IntPtr.Zero,IntPtr.Zero,500)!=1)continue;try{count++;if(count==1)firstMs=watch.ElapsedMilliseconds;lastMs=watch.ElapsedMilliseconds;last=v;if(count%25==1){byte[] corner=new byte[4],center=new byte[4];Marshal.Copy(v.data,corner,0,4);Marshal.Copy(IntPtr.Add(v.data,v.height/2*v.stride+v.width/2*4),center,0,4);uint sampleHash=2166136261;for(int y=0;y<v.height;y+=32)for(int x=0;x<v.width;x+=32)sampleHash=unchecked((sampleHash^Marshal.ReadByte(v.data,y*v.stride+x*4+2))*16777619);NdiApi.Print(new{type="frame",sampleHash=sampleHash,count=count,width=v.width,height=v.height,fourCC=v.fourCC,fpsN=v.numerator,fpsD=v.denominator,corner=Array.ConvertAll(corner,x=>(int)x),center=Array.ConvertAll(center,x=>(int)x),timecode=v.timecode});}}finally{free(r,ref v);}}
  var total=new Performance();var dropped=new Performance();stats(r,ref total,ref dropped);NdiApi.Print(new{type="result",ok=count>0,frames=count,received=total.video,dropped=dropped.video,elapsedMs=watch.ElapsedMilliseconds,firstFrameMs=firstMs,activeFps=lastMs>firstMs?(count-1)*1000.0/(lastMs-firstMs):0,width=last.width,height=last.height});return count>0?0:1;
 }catch(Exception e){NdiApi.Print(new{type="error",error=e.Message});return 1;}finally{if(r!=IntPtr.Zero)NdiApi.Bind<NdiApi.Release>("recv_destroy")(r);if(name!=IntPtr.Zero)Marshal.FreeHGlobal(name);}}
}
