// Measures renderer callback scheduling, not GPU presentation or hardware output.
export function frameMeter(fps,start=0){
 const period=1000/fps;let last=null,previousRender=start-period,callbacks=0,lateIntervals=0,maxIntervalMs=0,total=0,renderUpdates=0;
 return{
  tick(now){if(last!==null){const interval=Math.max(0,now-last);total+=interval;maxIntervalMs=Math.max(maxIntervalMs,interval);lateIntervals+=Math.max(0,Math.floor(interval/period+.15)-1);}last=now;callbacks++;const render=now-previousRender>=period-.5;if(render){previousRender=now-((now-previousRender)%period);renderUpdates++;}return render;},
  snapshot(now){return{callbacks,lateIntervals,maxIntervalMs,meanIntervalMs:callbacks>1?total/(callbacks-1):0,elapsedMs:Math.max(0,now-start),renderUpdates};},
 };
}

