import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandQueue} from '../lib/command-queue.ts';
test('rapid mixed control presses stay ordered and execute exactly once',async()=>{
 const q=createCommandQueue(),seen=[];let active=0;
 await Promise.all(Array.from({length:40},(_,i)=>q.enqueue(async()=>{assert.equal(++active,1);await Promise.resolve();seen.push(i);active--;return i;})));
 assert.deepEqual(seen,Array.from({length:40},(_,i)=>i));
});
test('failure drops waiting actions without retry and a later explicit press works',async()=>{
 const q=createCommandQueue();let release,runs=0;const first=q.enqueue(()=>new Promise((_,reject)=>{release=()=>reject(Error('Rejected by service'));}));
 const pending=q.enqueue(async()=>{runs++;});const results=Promise.allSettled([first,pending]);release();assert.ok((await results).every(r=>r.status==='rejected'));assert.equal(runs,0);await q.enqueue(async()=>{runs++;});assert.equal(runs,1);
});
test('cancel leaves active effect to service cancellation, drops waiting actions and bounds queue',async()=>{
 const q=createCommandQueue(1);let finish,runs=0;const active=q.enqueue(()=>new Promise(resolve=>{finish=resolve;}));const waiting=q.enqueue(async()=>{runs++;});const result=Promise.allSettled([active,waiting]);await assert.rejects(q.enqueue(async()=>{}),/Too many/);q.cancel();finish();assert.deepEqual((await result).map(r=>r.status),['fulfilled','rejected']);assert.equal(runs,0);
});
