import test from 'node:test';
import assert from 'node:assert/strict';
import {rfqRoute} from '../backend/modules/rfq.mjs';
const base={
 source:'website',customer:{name:'Test Importer',whatsapp:'+966512345678',country:'Saudi Arabia',company:'Shop'},
 idempotencyKey:'3c75b7ab-1018-4dea-978c-a1a39b8c013f',
 items:[{offerId:'demo-product',quantity:100}],notes:'Check compatibility'
};
const request={method:'POST',headers:{'x-forwarded-for':'192.0.2.44'},socket:{remoteAddress:'192.0.2.44'}};
test('anonymous RFQ uses transactional RPC and never forwards unauthorised monetary fields',async()=>{
 const before={...process.env},old=global.fetch;let received=null;
 try{
  Object.assign(process.env,{SUPABASE_URL:'https://rfq-fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'testing-service-secret',APP_ORIGIN:'https://www.imsgsource.com'});
  global.fetch=async(url,options)=>{received={url:String(url),options,body:JSON.parse(options.body)};return Response.json({number:'RFQ-10001',id:'sample'});};
  const result=await rfqRoute(null,request,{...base,items:[{...base.items[0],unitPrice:1,currency:'SAR'}],unitPrice:999},new URL('https://www.imsgsource.com/api/v1/rfq'));
  assert.equal(result.number,'RFQ-10001');
  assert.match(received.url,/\/rpc\/imsg_rfq_save$/);
  assert.deepEqual(received.body.p_payload.items,[{offerId:'demo-product',quantity:100}]);
  assert.equal(received.body.p_payload.customer.whatsapp,'+966512345678');
  assert.equal(received.body.p_actor,null);
  assert.match(received.body.p_remote_hash,/^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(received.body),/unitPrice|currency|999/);
 }finally{global.fetch=old;for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
test('reject invalid guest quantities, duplicate products, invalid WhatsApp and edits',async()=>{
 for(const payload of [
 {...base,items:[]},
 {...base,items:[{offerId:'demo-product',quantity:0}]},
 {...base,items:[{offerId:'demo-product',quantity:1},{offerId:'demo-product',quantity:2}]},
 {...base,customer:{...base.customer,whatsapp:'512345678'}},
 {...base,requestId:'be69f6ce-c8cb-47e5-9692-9c4b7e51f111'},
 {...base,idempotencyKey:'invalid'}
 ])await assert.rejects(rfqRoute(null,request,payload,new URL('https://www.imsgsource.com/api/v1/rfq')),error=>[400,403].includes(error.status));
});
test('admin-only listing, editing and customer notes require permissions',async()=>{
 const get={method:'GET',headers:{}};
 await assert.rejects(rfqRoute(null,get,{},null),{status:403});
 await assert.rejects(rfqRoute(null,request,{action:'customer-note',customerId:'be69f6ce-c8cb-47e5-9692-9c4b7e51f111',notes:'private'},null),{status:403});
 await assert.rejects(rfqRoute({role:'client',id:'bad'},request,{...base,source:'admin'},null),{status:403});
});


test('anonymous custom sourcing RFQ sends validated specifications but no catalog items',async()=>{
 const before={...process.env},old=global.fetch;let payload=null;
 try{
  Object.assign(process.env,{SUPABASE_URL:'https://rfq-fixture.invalid',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'testing-service-secret',APP_ORIGIN:'https://www.imsgsource.com'});
  global.fetch=async(_url,options)=>{payload=JSON.parse(options.body).p_payload;return Response.json({number:'RFQ-10002',id:'custom'});};
  const result=await rfqRoute(null,request,{...base,requestType:'custom',items:[],customDetails:{productName:'Private-label charger',specifications:'USB-C 20 W charger with packaging',quantity:1000,image:''}},new URL('https://www.imsgsource.com/api/v1/rfq'));
  assert.equal(result.number,'RFQ-10002');
  assert.equal(payload.requestType,'custom');
  assert.deepEqual(payload.items,[]);
  assert.equal(payload.customDetails.quantity,1000);
  assert.equal(payload.customDetails.productName,'Private-label charger');
 }finally{global.fetch=old;for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
test('rejects malformed custom RFQs without creating a request',async()=>{
 const details={productName:'Charger',specifications:'20W with type C output',quantity:100};
 const cases=[
  {...base,requestType:'custom',items:[{offerId:'demo-product',quantity:1}],customDetails:details},
  {...base,requestType:'custom',items:[],customDetails:{...details,productName:''}},
  {...base,requestType:'custom',items:[],customDetails:{...details,quantity:0}},
  {...base,requestType:'custom',items:[],customDetails:{...details,image:'data:image/svg+xml;base64,PHN2Zz4='}},
  {...base,requestType:'custom',items:[],customDetails:{...details,image:'data:image/png;base64,'+'x'.repeat(480001)}},
  {...base,requestType:'anything',items:[]}
 ];
 for(const payload of cases)await assert.rejects(rfqRoute(null,request,payload,new URL('https://www.imsgsource.com/api/v1/rfq')),{status:400});
});
