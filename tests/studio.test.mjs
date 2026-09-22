import test from 'node:test';
import assert from 'node:assert/strict';
import {changeOrder,checkoutDetails,manageOrder} from '../backend/modules/order-management.mjs';
import {normalizeStore,normalizeTiers,priceForQuantity,saveStudio} from '../backend/modules/studio.mjs';
import {createCartOrder} from '../backend/modules/cart-orders.mjs';
import {ownRecord,anonymous,snapshot} from '../backend/modules/records.mjs';
const order=()=>({orderFlowVersion:2,orderStage:0,currency:'SAR',cartTotal:50,cartItems:[{interestId:'line-1',moq:2,quantity:5,unitPrice:10,total:50}],orderHistory:[{at:'2026-09-22',stage:0}]});
test('nine stages enforce availability, payment and shipment details; closed orders are immutable',()=>{
 let o=order();assert.throws(()=>changeOrder(o,{action:'next'}));
 o=changeOrder(o,{action:'edit',lines:[{interestId:'line-1',quantity:6,unitPrice:9,availabilityConfirmed:true}]});assert.equal(o.cartTotal,54);
 o=changeOrder(o,{action:'next',paymentMessage:'Transfer the approved amount'});assert.equal(o.orderStage,1);assert.equal(o.paymentAmount,54);
 assert.throws(()=>changeOrder(o,{action:'next'}));assert.throws(()=>changeOrder(o,{action:'edit',lines:[]}));
 assert.throws(()=>changeOrder(o,{action:'confirm-payment',amount:55,currency:'SAR',reference:'bank-123'}));
 o=changeOrder(o,{action:'confirm-payment',amount:54,currency:'SAR',reference:'bank-123'});assert.equal(o.orderStage,2);
 o=changeOrder(o,{action:'next'});assert.throws(()=>changeOrder(o,{action:'next'}));
 o=changeOrder(o,{action:'edit',carrier:'Carrier',trackingNumber:'TRACK-123'});
 for(let i=4;i<=8;i++){o=changeOrder(o,{action:'next'});assert.equal(o.orderStage,i);}
 assert.equal(o.orderHistory.length,9);assert.equal(o.status,'completed');assert.throws(()=>changeOrder(o,{action:'cancel',reason:'closed'}));
});
test('private notes and audit never appear in customer records',()=>{
 const o=changeOrder(order(),{action:'note',note:'Private supplier discussion'});
 const publicOrder=ownRecord({id:'one',owner_id:'client',data:o},'requests');assert.equal(publicOrder.internalNotes,undefined);assert.equal(publicOrder.orderAudit,undefined);
 const projection=anonymous({id:'p',data:{status:'published',supplierId:'secret',options:'blue',technicalSpecs:'steel',tiers:[{min:10,price:5}]}},'publicOffers');assert.equal(projection.supplierId,undefined);assert.equal(projection.options,'blue');
});
test('checkout rejects missing delivery details; pricing tiers are ordered and bounded',()=>{
 assert.throws(()=>checkoutDetails({name:'N'}));assert.throws(()=>checkoutDetails({name:'N',phone:'1',country:'SA',address:' '.repeat(100)}));
 assert.deepEqual(normalizeTiers([{min:10,price:5}],2,8),[{min:10,price:5}]);assert.throws(()=>normalizeTiers([{min:10,price:9}],2,8));assert.throws(()=>normalizeTiers([{min:2,price:5}],2,8));
 assert.equal(priceForQuantity({unitPrice:8,tiers:[{min:10,price:5}]},10),5);
});
test('store config cannot accept executable asset URLs or arbitrary fields',()=>{
 const s={theme:{name:'M',tagline:'',announcement:'',color:'#123456',round:8,logo:''},sections:[],banners:[],pages:[],links:[],collections:[],secret:'never public'};
 assert.equal(normalizeStore(s).secret,undefined);assert.throws(()=>normalizeStore({...s,theme:{...s.theme,logo:'javascript:alert(1)'}}));
});
const admin={id:'admin-1',role:'admin',is_owner:true},client={id:'client-1',role:'client',data:{name:'Customer',preferredCurrency:'SAR'}};
const settings={id:'site',version:1,data:{categories:[{id:'cat-1',nameAr:'منتجات',nameEn:'Products',active:true}],subcategories:[],bankAccounts:[{id:'bank-1',currency:'SAR',active:true}],currencies:[{code:'SAR',nameAr:'ريال',nameEn:'Riyal',rate:1,active:true}]}};
async function withDB(fn){
 const state={settings:[structuredClone(settings)],profiles:[client,{id:'supplier-1',role:'supplier',data:{}}],public_offers:[{id:'offer-1',owner_id:'supplier-1',version:1,data:{status:'published',unitPrice:10,currency:'SAR',moq:2,stock:'50',product:'Product',translation:{titleAr:'منتج',titleEn:'Product'},tiers:[{min:10,price:8}]}}],requests:[],interests:[],quotes:[]};
 const fetchOriginal=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',APP_ORIGIN:'https://test.invalid'});
 let invoice=0,commits=[];
 global.fetch=async(url,options={})=>{const u=new URL(url),table=u.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  if(table==='allocate_invoice_number')return Response.json(`${body.invoice_kind==='proforma'?'PI':'INV'}-2026-${++invoice}`);
  if(table==='commit_changes'){
   const copy=structuredClone(state);for(const c of body.changes){const old=copy[c.table].find(r=>r.id===c.id);if((old?.version||0)!==c.version)return Response.json({message:'Conflict'},{status:409});if(old){old.data=c.data;old.version++;}else copy[c.table].push({id:c.id,owner_id:c.ownerId,offer_id:c.offerId,version:1,data:c.data,display_no:1001});}Object.assign(state,copy);commits.push(body.changes);return Response.json(null);
  }
  let rows=state[table]||[];for(const [k,v] of u.searchParams){if(v.startsWith('eq.'))rows=rows.filter(r=>String(k.startsWith('data->>')?r.data[k.slice(7)]:r[k])===v.slice(3));if(v==='is.null')rows=rows.filter(r=>(k.startsWith('data->>')?r.data[k.slice(7)]:r[k])==null);}
  return Response.json(rows);
 };
 try{await fn({state,commits,get invoices(){return invoice}});}finally{global.fetch=fetchOriginal;for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN'])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
}
test('cart → availability → payment → delivery uses atomic parent/line writes, frozen prices and version checks',()=>withDB(async db=>{
 const created=await createCartOrder(client,{items:[{offerId:'offer-1',quantity:10}],delivery:{name:'Customer',phone:'123',country:'SA',address:'Street 1'}});
 let row=db.state.requests[0];assert.equal(created.cartTotal,80);assert.equal(db.invoices,0);assert.equal(row.data.orderStage,0);assert.equal(row.data.proformaInvoice,undefined);assert.equal(db.commits[0].length,2);
 await assert.rejects(()=>manageOrder(client,{id:row.id,version:row.version,action:'next'}),e=>e.status===403);
 await manageOrder(admin,{id:row.id,version:row.version,action:'edit',lines:row.data.cartItems.map(l=>({...l,availabilityConfirmed:true}))});row=db.state.requests[0];
 await assert.rejects(()=>manageOrder(admin,{id:row.id,version:1,action:'next'}),e=>e.status===409);
 await manageOrder(admin,{id:row.id,version:row.version,action:'next',bankAccountId:'bank-1',paymentMessage:'Pay now'});row=db.state.requests[0];assert.equal(row.data.orderStage,1);assert.ok(row.data.proformaInvoice);
 await manageOrder(admin,{id:row.id,version:row.version,action:'confirm-payment',amount:80,currency:'SAR',reference:'BANK-1'});row=db.state.requests[0];assert.equal(row.data.orderStage,2);assert.equal(db.state.interests[0].data.paymentStatus,'confirmed');assert.equal(row.data.finalInvoice.status,'PAID');
 for(let stage=3;stage<=8;stage++){if(stage===4){await manageOrder(admin,{id:row.id,version:row.version,action:'edit',carrier:'Carrier',trackingNumber:'X123'});row=db.state.requests[0];}await manageOrder(admin,{id:row.id,version:row.version,action:'next'});row=db.state.requests[0];assert.equal(row.data.orderStage,stage);assert.equal(db.state.interests[0].data.orderStage,stage);}
}));
test('studio requires permission and settings version; draft is private and publish is atomic',()=>withDB(async db=>{
 const store={theme:{name:'M',tagline:'',announcement:'',color:'#123456',round:8,logo:''},sections:[],banners:[],pages:[],links:[],collections:[],categories:[{id:'cat-1',name:'منتجات',nameEn:'Products',active:true}]};
 await assert.rejects(()=>saveStudio(client,{action:'publish',version:1,store}),e=>e.status===403);
 await assert.rejects(()=>saveStudio(admin,{action:'publish',version:0,store}),e=>e.status===409);
 await saveStudio(admin,{action:'draft',version:1,store,products:[]});assert.ok(db.state.settings[0].data.studioDraft);assert.equal(db.state.settings[0].data.storefront,undefined);
 const publicState=await snapshot(null);assert.equal(publicState.settings.studioDraft,undefined);assert.equal(publicState.settings.bankAccounts,undefined);
 await saveStudio(admin,{action:'publish',version:2,store,products:[]});assert.equal(db.state.settings[0].data.studioDraft,undefined);assert.equal(db.state.settings[0].data.storefront.theme.name,'M');
}));
