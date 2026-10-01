function restoreBounds(saved,displays){
  const primary=displays[0].workArea;
  if(!saved||![saved.x,saved.y,saved.width,saved.height].every(Number.isFinite))return{width:Math.min(1440,primary.width),height:Math.min(960,primary.height),x:primary.x,y:primary.y};
  const target=displays.find(d=>d.id===saved.displayId)||displays.find(d=>saved.x<d.workArea.x+d.workArea.width&&saved.x+saved.width>d.workArea.x&&saved.y<d.workArea.y+d.workArea.height&&saved.y+saved.height>d.workArea.y)||displays[0];
  const a=target.workArea,width=Math.min(Math.max(640,saved.width),a.width),height=Math.min(Math.max(480,saved.height),a.height);
  return{width,height,x:Math.max(a.x,Math.min(saved.x,a.x+a.width-width)),y:Math.max(a.y,Math.min(saved.y,a.y+a.height-height))};
}
module.exports={restoreBounds};
