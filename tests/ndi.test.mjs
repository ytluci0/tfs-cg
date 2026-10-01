import test from 'node:test';
import assert from 'node:assert/strict';
import {ndiConfig} from '../desktop/ndi-config.cjs';
import {outputConfig} from '../desktop/output-config.mjs';
test('NDI source validation rejects invalid names and unsupported formats before creating a sender',()=>{
 for(const source of ['', 'a'.repeat(81),'abc\nxyz','<source>','name/other',' name\\other '])assert.throws(()=>ndiConfig({...outputConfig(),source}),/source name/);
 assert.throws(()=>ndiConfig({...outputConfig({width:3840,height:2160}),source:'Program'}),/720p and 1080p/);
 assert.equal(ndiConfig({...outputConfig(),source:' BroadcastCG - Program (1) '}).source,'BroadcastCG - Program (1)');
 for(const fps of [25,30,50,60])assert.equal(ndiConfig({...outputConfig({fps}),source:'Program'}).fps,fps);
});
