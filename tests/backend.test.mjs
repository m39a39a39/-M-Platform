// Prepared for the next validation step. These tests have NOT been run for this delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {can} from '../backend/modules/auth.mjs';
import {anonymous,ownRecord} from '../backend/modules/records.mjs';
import {validateContent} from '../backend/modules/mutations.mjs';
import {decodeImage} from '../backend/modules/media.mjs';

test('client cannot grant itself admin permission',()=>{
 assert.equal(can({role:'client',is_owner:true,permissions:['team']},'team'),false);
 assert.equal(can({role:'admin',permissions:['translate']},'accounts.read'),false);
 assert.equal(can({role:'admin',permissions:['translate']},'translate'),true);
});
test('supplier projection hides customer identity, source content and other invites',()=>{
 const r={id:'M-1',owner_id:'private-customer',version:1,data:{product:'private-name',specs:'private-phone',supplierIds:['one','two'],moderationHistory:[{actorId:'admin'}],translation:{titleEn:'Approved'},status:'sent',images:[]}};
 const result=anonymous(r,'requests',{id:'one'});
 assert.deepEqual(result.supplierIds,['one']);
 for(const secret of ['private-customer','private-name','private-phone','two','actorId'])assert.ok(!JSON.stringify(result).includes(secret));
 assert.equal(result.translation.titleEn,'Approved');
});
test('customer request does not disclose supplier invitation ids',()=>{
 const r=ownRecord({id:'M-1',owner_id:'customer',data:{supplierIds:['secret-supplier'],moderationHistory:[{actorId:'secret-admin'}]}},'requests');
 assert.equal(r.supplierIds,undefined);assert.equal(r.moderationHistory,undefined);
});
test('published quote projection does not expose source text or supplier',()=>{
 const q=anonymous({id:'Q-1',owner_id:'secret-supplier',request_id:'M-1',data:{notes:'Contact me',supplierName:'Company',unitPrice:'12',currency:'USD',translation:{descriptionEn:'Approved'}}},'quotes',{});
 assert.equal(q.supplierId,undefined);assert.equal(q.notes,undefined);assert.equal(q.supplierName,undefined);assert.equal(q.unitPrice,'12');
});
test('invalid amounts, contacts and non-image upload rejected',()=>{
 assert.throws(()=>validateContent('quotes',{unitPrice:-1,moq:1,leadTime:1,currency:'USD'}));
 assert.throws(()=>validateContent('requests',{quantity:1,product:'Product',specs:'name@example.com'}));
 assert.throws(()=>decodeImage('data:image/svg+xml;base64,PHN2Zz4='));
 assert.throws(()=>decodeImage('data:image/png;base64,'+Buffer.from('not actually an image').toString('base64')));
});
