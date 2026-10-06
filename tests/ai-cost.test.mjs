import test from 'node:test';
import assert from 'node:assert/strict';
import {directCustomerAnswer} from '../backend/modules/ai-chat.mjs';
import {buildAdminAiContext,directAdminAnswer} from '../backend/modules/admin-ai.mjs';
import {normalizeAiUsage,estimateAiCostUsd} from '../backend/modules/ai-usage.mjs';

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


test('GPT-6 Luna usage cost separates cached and uncached input',()=>{
  const usage={prompt_tokens:1000000,completion_tokens:100000,prompt_tokens_details:{cached_tokens:400000}};
  assert.deepEqual(normalizeAiUsage(usage),{promptTokens:1000000,cachedTokens:400000,completionTokens:100000,totalTokens:1100000});
  assert.equal(estimateAiCostUsd('gpt-6-luna',usage),0.114);
});

test('database and cache paths can report zero token cost safely',()=>{
  assert.equal(estimateAiCostUsd('gpt-6-luna',{}),0);
  assert.equal(estimateAiCostUsd('unknown-model',{prompt_tokens:1000,completion_tokens:1000}),0);
});
