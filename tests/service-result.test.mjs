import test from 'node:test';
import assert from 'node:assert/strict';
import {unwrapServiceResult} from '../lib/service-result.ts';

test('structured auth failures retain their status after bridge serialization',()=>{
 for(const status of [401,403,503])assert.throws(()=>unwrapServiceResult(structuredClone({ok:false,status,error:'Service rejected request'})),e=>e.status===status&&e.message==='Service rejected request');
 assert.deepEqual(unwrapServiceResult(structuredClone({ok:true,value:{sessionId:'test'}})),{sessionId:'test'});
});
