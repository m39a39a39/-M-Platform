// Prepared for the next validation step. These tests have NOT been run for this delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import {can} from '../backend/modules/auth.mjs';
import {anonymous,ownRecord} from '../backend/modules/records.mjs';
import {validateContent,normalizeCategories,TRACKING_STATUSES,READY_TRACKING_STATUSES,requiresRedaction} from '../backend/modules/mutations.mjs';
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


test('categories normalize safely and tracking stages are complete',()=>{
 const rows=normalizeCategories([{id:'mobile',nameAr:'جوال',nameEn:'Mobile',active:true},{id:'home',nameAr:'منزل',nameEn:'Home',active:false}]);
 assert.equal(rows[0].order,0);
 assert.equal(rows[1].active,false);
 assert.throws(()=>normalizeCategories([{id:'x',nameAr:'مكرر',nameEn:'Same'},{id:'y',nameAr:'مكرر',nameEn:'Other'}]));
 for(const status of ['received','reviewing','sourcing','quotes_available','quote_selected','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed','customer_action','on_hold','cancelled'])assert.ok(TRACKING_STATUSES.includes(status));
});


test('compressed upload fallback accepts images up to 5 MB',()=>{
 const twoMb=Buffer.alloc(2*1024*1024,1);twoMb[0]=255;twoMb[1]=216;twoMb[2]=255;
 const decoded=decodeImage('data:image/jpeg;base64,'+twoMb.toString('base64'));
 assert.equal(decoded.bytes.length,twoMb.length);
 const sixMb=Buffer.alloc(6*1024*1024,1);sixMb[0]=255;sixMb[1]=216;sixMb[2]=255;
 assert.throws(()=>decodeImage('data:image/jpeg;base64,'+sixMb.toString('base64')));
});


test('tracking-only admin updates never require redaction',()=>{
 assert.equal(requiresRedaction('requests','sent',['trackingStatus','trackingNote']),false);
 assert.equal(requiresRedaction('requests','sent',['translation']),true);
 assert.equal(requiresRedaction('requests','sent',['images']),true);
 assert.equal(requiresRedaction('publicOffers','published',['unitPrice']),true);
});

test('ready-product requests use fulfillment tracking statuses',()=>{
 const expected=['received','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed','customer_action','on_hold','cancelled'];
 assert.deepEqual(READY_TRACKING_STATUSES,expected);
 for(const legacy of ['pending','coordinating','accepted'])assert.equal(READY_TRACKING_STATUSES.includes(legacy),false);
});
