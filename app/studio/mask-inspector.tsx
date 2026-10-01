import {defaultLayerMask,type LayerMask} from '@/lib/design-schema';
import type {Layer} from '@/lib/studio-model';
import type {DesignTool} from './design-canvas';
import {Num} from './controls';
export default function MaskInspector({item,change,tool}:{item:Layer;change:(v:LayerMask|undefined)=>void;tool:(v:DesignTool)=>void}){
 const m=item.visual?.layerMask,patch=(v:Partial<LayerMask>)=>change({...m!,...v});
 return <details open className="design-mask-inspector"><summary>Layer mask {m?'· editable':'· none'}</summary><fieldset disabled={item.locked}>
  {!m?<><p className="helper">Hide or reveal parts of this layer without changing the source image.</p><button onClick={()=>change(defaultLayerMask())}>Add layer mask</button></>:<>
   <div className="design-mask-toggles"><label><input type="checkbox" aria-label="Enable layer mask" checked={m.enabled} onChange={e=>patch({enabled:e.target.checked})}/>Enabled</label><label><input type="checkbox" aria-label="Invert layer mask" checked={m.invert} onChange={e=>patch({invert:e.target.checked})}/>Invert</label></div>
   <label>Mask shape<select aria-label="Mask shape" value={m.shape} onChange={e=>patch({shape:e.target.value as LayerMask['shape']})}><option value="full">Full layer / brush</option><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option>{m.shape==='polygon'&&<option value="polygon">Polygon</option>}</select></label>
   <div className="property-grid"><label>Density (%)<Num label="Mask density" value={m.density*100} min={0} max={100} onChange={n=>patch({density:n/100})}/></label><label>Feather (px)<Num label="Mask feather" value={m.feather} min={0} max={100} onChange={feather=>patch({feather})}/></label>{m.shape!=='full'&&(['x','y','width','height'] as const).map(k=><label key={k}>{k} (%)<Num label={'Mask '+k} value={m[k]*100} min={k==='width'||k==='height'?.01:0} max={100} step={.1} onChange={v=>patch({[k]:v/100})}/></label>)}</div>
   <div className="design-mask-actions"><button onClick={()=>tool('mask-rectangle')}>Draw rectangle mask</button><button onClick={()=>tool('mask-ellipse')}>Draw ellipse mask</button><button onClick={()=>tool('mask-hide')}>Brush hide</button><button onClick={()=>tool('mask-reveal')}>Brush reveal</button></div><small>{m.strokes?.length||0} / 100 strokes · brush size is relative to the layer</small>
   <div className="design-mask-actions"><button disabled={!m.strokes?.length} onClick={()=>patch({strokes:m.strokes?.slice(0,-1)})}>Undo mask stroke</button><button disabled={!m.strokes?.length} onClick={()=>patch({strokes:[]})}>Clear mask strokes</button><button onClick={()=>change(undefined)}>Remove layer mask</button></div>
  </>}
 </fieldset></details>;
}
