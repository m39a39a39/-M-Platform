// Backend validation regression tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {can} from '../backend/modules/auth.mjs';
import {anonymous,ownRecord} from '../backend/modules/records.mjs';
import {validateContent,normalizeCategories,normalizeSubcategories,normalizeSupplyCountries,TRACKING_STATUSES,READY_TRACKING_STATUSES,requiresRedaction,allowedAdminTrackingTransition,TRACKING_FLOW,READY_TRACKING_FLOW} from '../backend/modules/mutations.mjs';
import {decodeImage,decodePaymentReceipt} from '../backend/modules/media.mjs';
import {notificationPayload} from '../backend/modules/notifications.mjs';

test('client cannot grant itself admin permission',()=>{
 assert.equal(can({role:'client',is_owner:true,permissions:['team']},'team'),false);
 assert.equal(can({role:'admin',permissions:['translate']},'accounts.read'),false);
 assert.equal(can({role:'admin',permissions:['translate']},'translate'),true);
});
test('supplier projection hides customer identity, source content and other invites',()=>{
 const r={id:'M-1',owner_id:'private-customer',version:1,data:{product:'private-name',specs:'private-phone',supplierIds:['one','two'],moderationHistory:[{actorId:'admin'}],translation:{titleEn:'Approved'},status:'sent',images:[],paymentMessage:'secret payment instructions',paymentReceipt:{src:'/api/media/secret-receipt'}}};
 const result=anonymous(r,'requests',{id:'one'});
 assert.deepEqual(result.supplierIds,['one']);
 for(const secret of ['private-customer','private-name','private-phone','two','actorId','secret payment instructions','secret-receipt'])assert.ok(!JSON.stringify(result).includes(secret));
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
 for(const status of ['received','reviewing','sourcing','quotes_available','quote_selected','supplier_confirmation','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed','customer_action','on_hold','cancelled'])assert.ok(TRACKING_STATUSES.includes(status));
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
 const expected=['received','supplier_confirmation','payment_confirmation','production','quality_check','ready_to_ship','shipped','in_delivery','delivered','completed','customer_action','on_hold','cancelled'];
 assert.deepEqual(READY_TRACKING_STATUSES,expected);
 for(const legacy of ['pending','coordinating','accepted'])assert.equal(READY_TRACKING_STATUSES.includes(legacy),false);
});


test('payment receipt decoder accepts PDF and rejects invalid receipt content',()=>{
 const pdf=Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
 const decoded=decodePaymentReceipt('data:application/pdf;base64,'+pdf.toString('base64'));
 assert.equal(decoded.mime,'application/pdf');
 assert.equal(decoded.bytes.equals(pdf),true);
 assert.throws(()=>decodePaymentReceipt('data:application/pdf;base64,'+Buffer.from('not a pdf document').toString('base64')));
});

test('payment notifications preserve admin message and route to the right workflow',()=>{
 const required=notificationPayload(
  {id:1,event:'payment_required_request',entity_id:'r1',read_at:null,created_at:'2026-09-19'},
  undefined,
  {display_no:10002,data:{paymentMessage:'حوّل الدفعة الأولى ثم أرفق الإيصال.'}}
 );
 assert.equal(required.titleAr,'بانتظار تأكيد الدفع');
 assert.equal(required.bodyAr,'حوّل الدفعة الأولى ثم أرفق الإيصال.');
 assert.equal(required.action,'upload_receipt');
 assert.deepEqual(required.target,{screen:'customerPayment',entityType:'request',entityId:'r1'});
 const submitted=notificationPayload(
  {id:3,event:'payment_required_request',entity_id:'r1',read_at:null,created_at:'2026-09-19'},
  undefined,
  {display_no:10002,data:{paymentStatus:'receipt_submitted',paymentMessage:'old request message'}}
 );
 assert.equal(submitted.titleAr,'تم إرسال إيصال الدفع');
 assert.equal(submitted.action,undefined);
 assert.match(submitted.bodyAr,/بانتظار مراجعة الإدارة/);

 const admin=notificationPayload(
  {id:2,event:'payment_receipt_submitted_interest',entity_id:'i1',read_at:null,created_at:'2026-09-19'},
  undefined,
  {data:{paymentStatus:'receipt_submitted'}}
 );
 assert.equal(admin.titleAr,'إيصال دفع جديد');
 assert.deepEqual(admin.target,{screen:'adminPayment',entityType:'interest',entityId:'i1'});
});

test('payment message does not trigger privacy redaction requirement',()=>{
 assert.equal(requiresRedaction('requests','sent',['trackingStatus','trackingNote','paymentMessage']),false);
});

test('admin tracking follows the order lifecycle without skipping stages',()=>{
 const quality={trackingStatus:'quality_check',trackingHistory:[{status:'production'},{status:'quality_check'}]};
 assert.equal(allowedAdminTrackingTransition(quality,'ready_to_ship',TRACKING_FLOW),true);
 assert.equal(allowedAdminTrackingTransition(quality,'shipped',TRACKING_FLOW),false);
 assert.equal(allowedAdminTrackingTransition(quality,'on_hold',TRACKING_FLOW),true);
 const held={trackingStatus:'on_hold',trackingHistory:[{status:'quality_check'},{status:'on_hold'}]};
 assert.equal(allowedAdminTrackingTransition(held,'quality_check',TRACKING_FLOW),true);
 assert.equal(allowedAdminTrackingTransition(held,'ready_to_ship',TRACKING_FLOW),true);
 assert.equal(allowedAdminTrackingTransition({trackingStatus:'delivered'},'completed',READY_TRACKING_FLOW),true);
 assert.equal(allowedAdminTrackingTransition({trackingStatus:'completed'},'delivered',READY_TRACKING_FLOW),false);
});

test('catalog taxonomy supports managed supply countries and subcategories',()=>{
 const cats=normalizeCategories([{id:'mobile',nameAr:'جوال',nameEn:'Mobile',active:true}]);
 const subs=normalizeSubcategories([{id:'cables',parentId:'mobile',nameAr:'كيابل',nameEn:'Cables',active:true}],cats);
 const countries=normalizeSupplyCountries([{id:'cn-stock',nameAr:'الصين',nameEn:'China',active:true}]);
 assert.equal(subs[0].parentId,'mobile');
 assert.equal(countries[0].id,'cn-stock');
 assert.throws(()=>normalizeSubcategories([{id:'bad',parentId:'missing',nameAr:'خطأ',nameEn:'Bad'}],cats));
});
