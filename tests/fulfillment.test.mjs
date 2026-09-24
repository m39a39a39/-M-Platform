import test from 'node:test';
import assert from 'node:assert/strict';
import {assignSupplier} from '../backend/modules/fulfillment.mjs';
import {mutate} from '../backend/modules/mutations.mjs';
import {changeOrder} from '../backend/modules/order-management.mjs';
import {snapshot} from '../backend/modules/records.mjs';
const admin={id:'admin',role:'admin',is_owner:true};
async function fixture(run){
 const oldFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',APP_ORIGIN:'https://test.invalid'});
 const state={supply_sources:[],profiles:[{id:'client',role:'client',data:{}},{id:'old',role:'supplier',data:{}},{id:'new',role:'supplier',data:{}}],settings:[{id:'site',version:1,data:{}}],requests:[],interests:[],quotes:[],public_offers:[],media:[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',owner_id:'admin'}]};let last;
 global.fetch=async(url,options={})=>{const u=new URL(url),table=u.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  if(table==='commit_changes'){last=body;for(const c of body.changes){const prior=state[c.table].find(r=>r.id===c.id);assert.equal(prior?.version||0,c.version);const row={id:c.id,owner_id:c.ownerId,offer_id:c.offerId,request_id:c.requestId,data:c.data,version:c.version+1};if(prior)Object.assign(prior,row);else state[c.table].push(row);}return Response.json(null);}
  let rows=state[table]||[];for(const [k,v] of u.searchParams){const value=r=>k.startsWith('data->>')?r.data?.[k.slice(7)]:k.startsWith('data->')?r.data?.[k.slice(6)]:r[k];if(v.startsWith('eq.'))rows=rows.filter(r=>String(value(r))===v.slice(3));if(v==='is.null')rows=rows.filter(r=>value(r)==null);if(v.startsWith('cs.'))rows=rows.filter(r=>JSON.parse(v.slice(3)).every(x=>value(r)?.includes(x)));if(v.startsWith('in.')){const ids=v.slice(4,-1).replaceAll('"','').split(',');rows=rows.filter(r=>ids.includes(String(value(r))));}}
  return Response.json(rows);
 };
 try{await run(state,()=>last);}finally{global.fetch=oldFetch;for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN'])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
}
test('admin sourcing creation belongs to active customer and validates content and permissions',()=>fixture(async(s,last)=>{
 const body={collection:'requests',id:'rfq',version:0,customerId:'client',patch:{product:'Steel',specs:'Sheets',quantity:4,country:'China',neededDate:'',images:['/api/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa']}};
 await assert.rejects(()=>mutate({id:'no',role:'admin',permissions:[]},body));
 await assert.rejects(()=>mutate(admin,{...body,customerId:'old'}));
 await mutate(admin,body);assert.equal(last().actor,'admin');assert.equal(s.requests[0].owner_id,'client');assert.equal(s.requests[0].data.status,'review');assert.equal(s.requests[0].data.createdByAdmin,'admin');
}));
test('assignment moves all cart lines atomically without changing customer ownership, price or stage',()=>fixture(async(s,last)=>{
 s.requests.push({id:'cart',owner_id:'client',version:1,data:{orderFlowVersion:2,orderType:'cart',orderStage:3,status:'sent',cartItems:[{interestId:'line'}],cartTotal:20}});s.interests.push({id:'line',owner_id:'client',offer_id:'offer',version:1,data:{cartOrderId:'cart',unitPrice:10,quantity:2,trackingStatus:'quality_check'}});s.public_offers.push({id:'offer',owner_id:'old',data:{}});
 s.supply_sources.push({id:'source',owner_id:'new',version:1,data:{productId:'offer',status:'approved',terms:{unitPrice:7,currency:'SAR',moq:1,stock:10,leadTime:2,country:'China'}}});
 const body={collection:'requests',id:'cart',version:1,supplierId:'new'};
 await assert.rejects(()=>assignSupplier({id:'client',role:'client'},body));await assert.rejects(()=>assignSupplier(admin,{...body,version:0}));await assert.rejects(()=>assignSupplier(admin,{...body,supplierId:'client'}));
 await assignSupplier(admin,body);assert.equal(last().changes.length,2);assert.equal(s.interests[0].data.assignedSupplierId,'new');assert.equal(s.interests[0].data.unitPrice,10);assert.equal(s.interests[0].owner_id,'client');assert.equal(s.requests[0].data.orderStage,3);assert.equal(s.requests[0].data.cartTotal,20);
 const old=await snapshot({id:'old',role:'supplier',data:{}}),next=await snapshot({id:'new',role:'supplier',data:{}});assert.equal(old.interests.length,0);assert.equal(next.interests.length,1);
 s.requests[0].data.status='completed';await assert.rejects(()=>assignSupplier(admin,{...body,version:2}));
}));
test('selected sourcing quote changes fulfillment access while retaining quote ownership and terms',()=>fixture(async(s)=>{
 s.requests.push({id:'rfq',owner_id:'client',version:1,data:{status:'sent',selectedQuoteId:'quote',supplierIds:['old'],trackingStatus:'supplier_confirmation'}});s.quotes.push({id:'quote',owner_id:'old',request_id:'rfq',version:1,data:{status:'published',unitPrice:25,currency:'SAR'}});
 await assert.rejects(()=>assignSupplier(admin,{collection:'requests',id:'rfq',version:1,assignments:[]}),error=>error.status===400);
 await assert.rejects(()=>assignSupplier(admin,{collection:'requests',id:'rfq',version:1,supplierId:'new'}));
 s.quotes.push({id:'new-quote',owner_id:'new',request_id:'rfq',version:1,data:{status:'published',unitPrice:25,currency:'SAR'}});
 await assignSupplier(admin,{collection:'requests',id:'rfq',version:1,supplierId:'new'});
 assert.equal(s.quotes[0].owner_id,'old');assert.equal(s.quotes[0].data.unitPrice,25);
 const old=await snapshot({id:'old',role:'supplier',data:{}}),next=await snapshot({id:'new',role:'supplier',data:{}});assert.equal(old.requests.length,0);assert.equal(old.quotes.length,1);assert.equal(next.requests[0].selectedForSupplier,true);assert.equal(next.quotes[0].supplierOrderStatus,'pending_confirmation');assert.equal(next.quotes[0].supplierId,'new');
 const body={collection:'quotes',id:'new-quote',version:2,patch:{supplierOrderStatus:'confirmed'}};
 await assert.rejects(()=>mutate({id:'old',role:'supplier'},body));await mutate({id:'new',role:'supplier'},body);assert.equal(s.quotes[1].data.supplierOrderStatus,'confirmed');
}));
test('shipment details and new stage save together; whitespace and missing tracking rejected',()=>{
 const o={orderFlowVersion:2,orderStage:3,status:'sent',cartItems:[]};assert.throws(()=>changeOrder(o,{action:'next',carrier:' ',trackingNumber:'X'}));assert.throws(()=>changeOrder(o,{action:'next',carrier:'Carrier'}));const next=changeOrder(o,{action:'next',carrier:'Carrier',trackingNumber:'TR-1'});assert.equal(next.orderStage,4);assert.equal(next.trackingStatus,'shipped');assert.equal(next.trackingNumber,'TR-1');assert.equal(o.orderStage,3);
});
test('legacy sourcing and ready-product orders can move from ready_to_ship to shipped',()=>fixture(async(s)=>{
 for(const collection of ['requests','interests']){s[collection].push({id:collection,owner_id:'client',version:1,data:{status:collection==='requests'?'sent':'active',trackingStatus:'ready_to_ship',images:[]}});await mutate(admin,{collection,id:collection,version:1,patch:{trackingStatus:'shipped',trackingNote:''}});assert.equal(s[collection][0].data.trackingStatus,'shipped');}
}));
