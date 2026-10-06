import test from 'node:test';
import assert from 'node:assert/strict';
import {directCustomerAnswer} from '../backend/modules/ai-chat.mjs';
import {buildAdminAiContext,directAdminAnswer} from '../backend/modules/admin-ai.mjs';

test('customer price and MOQ questions are answered from catalog without an AI call',()=>{
  const state={publicOffers:[
    {id:'p1',status:'published',sku:'MG-825',unitPrice:28,currency:'SAR',moq:20,stock:50,leadTime:3,translation:{titleAr:'سماعة MG-825',titleEn:'MG-825 Earbuds'}},
    {id:'p2',status:'published',sku:'MG-834',unitPrice:30,currency:'SAR',moq:20,stock:10,leadTime:4,translation:{titleAr:'سماعة MG-834',titleEn:'MG-834 Earbuds'}}
  ],settings:{}};
  const reply=directCustomerAnswer(state,null,'كم سعر MG-825 وأقل كمية؟','ar');
  assert.match(reply,/28 SAR/);
  assert.match(reply,/20/);
});

test('customer order status is answered from own order only',()=>{
  const state={requests:[{id:'r1',displayNo:10025,trackingStatus:'shipped',paymentStatus:'confirmed',createdAt:'2026-10-01'}],interests:[],publicOffers:[],settings:{}};
  const reply=directCustomerAnswer(state,{id:'client-1',role:'client'},'أين طلبي 10025؟','ar');
  assert.match(reply,/10025/);
  assert.match(reply,/تم الشحن/);
});

test('ambiguous product question falls through instead of guessing',()=>{
  const state={publicOffers:[
    {id:'p1',status:'published',sku:'A1',unitPrice:10,currency:'SAR',translation:{titleAr:'كيبل شحن'}},
    {id:'p2',status:'published',sku:'A2',unitPrice:12,currency:'SAR',translation:{titleAr:'كيبل شحن'}}
  ],settings:{}};
  assert.equal(directCustomerAnswer(state,null,'كم سعر كيبل الشحن؟','ar'),null);
});

test('admin count questions are answered locally from aggregated context',()=>{
  const context=buildAdminAiContext({
    publicOffers:[{id:'p1',status:'published'},{id:'p2',status:'review'}],
    accounts:[{id:'c1',role:'client'}],requests:[],interests:[],settings:{storefront:{sections:[]}}
  });
  assert.equal(directAdminAnswer(context,'كم عدد المنتجات؟','ar'),'إجمالي المنتجات: 2');
  assert.equal(directAdminAnswer(context,'كم عدد العملاء؟','ar'),'عدد العملاء: 1');
});
