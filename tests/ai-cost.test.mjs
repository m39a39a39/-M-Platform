import test from 'node:test';
import assert from 'node:assert/strict';
import {directCustomerAnswer,customerProductRecommendations} from '../backend/modules/ai-chat.mjs';
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


test('customer shipping-to-Saudi question is answered directly from store policy',()=>{
  const state={
    publicOffers:[],
    settings:{storefront:{pages:[{
      id:'policy-shipping',active:true,title:'سياسة الشحن والتوصيل',titleEn:'Shipping and delivery',
      content:'وجهات الخدمة\nنوفر التوصيل حاليًا داخل السعودية.\nالطريقة والتكلفة\nنرتب الشحن الجوي أو البحري وفق اختيار العميل والخيارات المناسبة للبضاعة.\nبعد تجهيز البضاعة ومعرفة وزنها وحجمها نرسل عرض الشحن بشكل منفصل عن قيمة المنتجات.',
      contentEn:'Destinations\nDelivery currently serves Saudi Arabia.\nMethod and charges\nWe arrange air or sea freight. Shipping is quoted separately after preparation.'
    }]}}
  };
  const reply=directCustomerAnswer(state,null,'هل لديكم شحن إلى السعودية؟','ar');
  assert.match(reply,/نعم/);
  assert.match(reply,/السعودية/);
  assert.match(reply,/الجوي أو البحري/);
});

test('shipping cost question returns the separate-quote rule without confusing لديكم with كم',()=>{
  const state={publicOffers:[],settings:{storefront:{pages:[{
    id:'policy-shipping',active:true,title:'سياسة الشحن والتوصيل',
    content:'نوفر التوصيل حاليًا داخل السعودية. بعد تجهيز البضاعة ومعرفة وزنها وحجمها نرسل عرض الشحن بشكل منفصل. يشمل عرض الشركة النقل والجمارك والضرائب والتخليص والتوصيل.'
  }]}}};
  const availability=directCustomerAnswer(state,null,'هل لديكم شحن إلى السعودية؟','ar');
  assert.doesNotMatch(availability,/الجمارك والضرائب/);
  const cost=directCustomerAnswer(state,null,'كم تكلفة الشحن إلى السعودية؟','ar');
  assert.match(cost,/تحدد تكلفة الشحن|تُحدد تكلفة الشحن/);
  assert.match(cost,/الجمارك والضرائب/);
});

test('generic unrelated question is not falsely answered as a shipping policy fact',()=>{
  const state={publicOffers:[],settings:{storefront:{pages:[{
    id:'policy-shipping',active:true,title:'سياسة الشحن والتوصيل',content:'نوفر التوصيل حاليًا داخل السعودية.'
  }]}}};
  assert.equal(directCustomerAnswer(state,null,'هل عندكم سماعات؟','ar'),null);
});


test('published product with stock zero is described as available to order',()=>{
  const state={publicOffers:[{
    id:'p1',status:'published',sku:'MG-20W',unitPrice:25,currency:'SAR',moq:10,stock:0,
    translation:{titleAr:'شاحن حائط MG 20W',titleEn:'MG 20W Wall Charger'}
  }],settings:{}};
  const reply=directCustomerAnswer(state,null,'هل شاحن MG-20W متوفر؟','ar');
  assert.match(reply,/متوفر للطلب/);
  assert.doesNotMatch(reply,/المخزون:\\s*0\\b/);
});

test('explicit tracked inventory reports its real quantity',()=>{
  const state={publicOffers:[{
    id:'p2',status:'published',sku:'TRACK-1',unitPrice:25,currency:'SAR',moq:10,stock:7,stockUnlimited:false,
    translation:{titleAr:'شاحن متتبع',titleEn:'Tracked Charger'}
  }],settings:{}};
  const reply=directCustomerAnswer(state,null,'هل TRACK-1 متوفر؟','ar');
  assert.match(reply,/المخزون: 7/);
});

test('shipping duration question stays concise and does not dump policy text',()=>{
  const state={publicOffers:[],settings:{storefront:{pages:[{
    id:'policy-shipping',active:true,title:'سياسة الشحن والتوصيل',
    content:'نوفر التوصيل حاليًا داخل السعودية. نرتب الشحن الجوي أو البحري. بعد تجهيز البضاعة نرسل عرض الشحن بشكل منفصل ويشمل النقل والجمارك والضرائب والتخليص والتوصيل.'
  }]}}};
  const reply=directCustomerAnswer(state,null,'كم مدة الشحن؟','ar');
  assert.equal(reply,'مدة الشحن غير محددة حاليًا في سياسة المتجر، ويتم تأكيد المدة المتوقعة لك قبل الشحن.');
});


test('Bluetooth earphone intent excludes Bluetooth speakers',()=>{
  const state={publicOffers:[
    {id:'speaker',status:'published',sku:'MX-SK100',unitPrice:30,currency:'SAR',categoryId:'cat-audio',subcategoryId:'sub-bluetooth-speakers',translation:{titleAr:'مكبر صوت لاسلكي',titleEn:'Bluetooth Wireless Speaker'},images:['/api/media/00000000-0000-0000-0000-000000000001']},
    {id:'earbuds',status:'published',sku:'MX-TW80',unitPrice:35,currency:'SAR',categoryId:'cat-audio',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعات TWS لاسلكية',titleEn:'TWS Wireless Earbuds'},images:['/api/media/00000000-0000-0000-0000-000000000002']},
    {id:'headphones',status:'published',sku:'MX-WL109',unitPrice:40,currency:'SAR',categoryId:'cat-audio',subcategoryId:'sub-headphones-gaming',translation:{titleAr:'سماعة رأس لاسلكية',titleEn:'Wireless Headphones'},images:['/api/media/00000000-0000-0000-0000-000000000003']}
  ]};
  const rows=customerProductRecommendations(state,'اريد سماعه بلوتوث','ar');
  assert.equal(rows[0]?.id,'earbuds');
  assert.ok(rows.some(x=>x.id==='headphones'));
  assert.ok(!rows.some(x=>x.id==='speaker'));
});

test('explicit Bluetooth speaker intent prefers speakers over earbuds',()=>{
  const state={publicOffers:[
    {id:'speaker',status:'published',sku:'MX-SK100',unitPrice:30,currency:'SAR',categoryId:'cat-audio',subcategoryId:'sub-bluetooth-speakers',translation:{titleAr:'مكبر صوت لاسلكي',titleEn:'Bluetooth Wireless Speaker'}},
    {id:'earbuds',status:'published',sku:'MX-TW80',unitPrice:35,currency:'SAR',categoryId:'cat-audio',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعات TWS لاسلكية',titleEn:'TWS Wireless Earbuds'}}
  ]};
  const rows=customerProductRecommendations(state,'اريد مكبر صوت بلوتوث','ar');
  assert.equal(rows[0]?.id,'speaker');
  assert.ok(!rows.some(x=>x.id==='earbuds'));
});


test('wall charger watt intent outranks car chargers and cables',()=>{
  const state={publicOffers:[
    {id:'wall20',status:'published',sku:'W20',unitPrice:20,currency:'SAR',translation:{titleAr:'شاحن حائط PD 20W',titleEn:'20W PD Wall Charger'},specs:'USB-C PD 20W'},
    {id:'car20',status:'published',sku:'C20',unitPrice:18,currency:'SAR',translation:{titleAr:'شاحن سيارة 20W',titleEn:'20W Car Charger'},specs:'USB-C 20W'},
    {id:'cable60',status:'published',sku:'CB60',unitPrice:8,currency:'SAR',translation:{titleAr:'كيبل Type-C 60W',titleEn:'60W Type-C Cable'},specs:'Type-C to Type-C 60W'}
  ]};
  const rows=customerProductRecommendations(state,'أريد شاحن حائط 20W','ar');
  assert.equal(rows[0]?.id,'wall20');
  assert.ok(rows.findIndex(x=>x.id==='wall20')<rows.findIndex(x=>x.id==='car20'));
});

test('Type-C to Type-C 60W intent prefers the correct cable',()=>{
  const state={publicOffers:[
    {id:'cc60',status:'published',sku:'CC60',unitPrice:9,currency:'SAR',translation:{titleAr:'كيبل Type-C إلى Type-C 60W',titleEn:'Type-C to Type-C 60W Cable'},specs:'PD 60W C-C'},
    {id:'usbC',status:'published',sku:'UC3',unitPrice:7,currency:'SAR',translation:{titleAr:'كيبل USB إلى Type-C 3A',titleEn:'USB to Type-C 3A Cable'},specs:'USB to Type-C 3A'},
    {id:'wall60',status:'published',sku:'W60',unitPrice:28,currency:'SAR',translation:{titleAr:'شاحن حائط 60W',titleEn:'60W Wall Charger'},specs:'PD 60W'}
  ]};
  const rows=customerProductRecommendations(state,'أريد كيبل Type-C to Type-C 60W','ar');
  assert.equal(rows[0]?.id,'cc60');
});

test('conversion popularity cannot override a clear product-category mismatch',()=>{
  const state={publicOffers:[
    {id:'earbuds',status:'published',sku:'TWS1',unitPrice:30,currency:'SAR',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعة TWS بلوتوث',titleEn:'Bluetooth TWS Earbuds'}},
    {id:'speaker',status:'published',sku:'SP1',unitPrice:30,currency:'SAR',subcategoryId:'sub-bluetooth-speakers',translation:{titleAr:'مكبر صوت بلوتوث',titleEn:'Bluetooth Speaker'}}
  ]};
  const signals={speaker:{score:8},earbuds:{score:0}};
  const rows=customerProductRecommendations(state,'أريد سماعة بلوتوث','ar',signals);
  assert.equal(rows[0]?.id,'earbuds');
  assert.ok(!rows.some(x=>x.id==='speaker'));
});

test('matching products can use conversion signals as a small tie-breaker',()=>{
  const state={publicOffers:[
    {id:'a',status:'published',sku:'A',unitPrice:30,currency:'SAR',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعة TWS بلوتوث A',titleEn:'Bluetooth TWS Earbuds A'}},
    {id:'b',status:'published',sku:'B',unitPrice:30,currency:'SAR',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعة TWS بلوتوث B',titleEn:'Bluetooth TWS Earbuds B'}}
  ]};
  const rows=customerProductRecommendations(state,'سماعة TWS بلوتوث','ar',{b:{score:5},a:{score:0}});
  assert.equal(rows[0]?.id,'b');
});
