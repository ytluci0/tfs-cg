import test from 'node:test';
import assert from 'node:assert/strict';
import {variableActionValue} from '../lib/studio-model.ts';

test('set and increase preserve the numeric type used by the variable picker',()=>{
 const variables={score:3};
 variables.score=variableActionValue(variables,'score','10','set');
 assert.equal(variables.score,10);
 assert.equal(variableActionValue(variables,'score','2','increment'),12);
});
test('increase rejects missing and text variables instead of resetting them to zero',()=>{
 assert.throws(()=>variableActionValue({name:'Suhib'},'name','1','increment'),/numeric variable/);
 assert.throws(()=>variableActionValue({score:3},'missing','1','increment'),/existing variable/);
 assert.throws(()=>variableActionValue({score:3},'score','not a number','increment'),/valid number/);
});
test('setting text and booleans preserves their declared types',()=>{
 assert.equal(variableActionValue({name:''},'name','true','set'),'true');
 assert.equal(variableActionValue({enabled:false},'enabled','true','set'),true);
 assert.throws(()=>variableActionValue({enabled:false},'enabled','hello','set'),/true or false/);
});
