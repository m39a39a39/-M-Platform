import test from 'node:test';
import assert from 'node:assert/strict';
import {directCustomerAnswer,customerProductRecommendations,customerProductSearch,resolveCustomerProductQuery,isCustomerProductQuery} from '../backend/modules/ai-chat.mjs';
import {buildAdminAiContext,directAdminAnswer} from '../backend/modules/admin-ai.mjs';
import {publicAiProductSummary} from '../backend/modules/records.mjs';
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

test('company name and address are answered locally from active policy content',()=>{
  const state={settings:{storefront:{pages:[{
    id:'policy-terms',active:true,title:'الشروط والأحكام',titleEn:'Terms',
    content:'اسم الشركة: GUANGZHOU MIG TRADING CO., LTD.\nالعنوان: 广州彩尊企业管理咨询公司（金沙大都会二期2栋1730房)',
    contentEn:'Company name: GUANGZHOU MIG TRADING CO., LTD.\nCompany address: Guangzhou, China'
  }]}},publicOffers:[
    {id:'noise',status:'published',sku:'BT-1',unitPrice:6.25,currency:'SAR',translation:{titleAr:'مرسل Bluetooth',titleEn:'Bluetooth Transmitter'}}
  ]};
  const name=directCustomerAnswer(state,null,'اسم الشركة','ar');
  const address=directCustomerAnswer(state,null,'عنوان شركتكم','ar');
  assert.match(name,/GUANGZHOU MIG TRADING CO/i);
  assert.match(address,/广州彩尊企业管理咨询公司/);
});

test('short company followups keep policy context and return labeled fields locally',()=>{
  const state={settings:{storefront:{pages:[{
    id:'policy-terms',active:true,title:'الشروط والأحكام',titleEn:'Terms',
    content:'اسم الشركة القانوني: GUANGZHOU MIG TRADING CO., LTD. / 广州米各贸易有限公司، ويشار إليها باسم «الشركة»\nالعنوان: الصين، قوانزو — 广州彩尊企业管理咨询公司（金沙大都会二期2栋1730房)',
    contentEn:'Legal company name: GUANGZHOU MIG TRADING CO., LTD. / 广州米各贸易有限公司\nCompany address: Guangzhou, China'
  }]}},publicOffers:[]};
  const history=[
    {role:'user',content:'اسم شركتكم'},
    {role:'assistant',content:'GUANGZHOU MIG TRADING CO., LTD. / 广州米各贸易有限公司'}
  ];
  const address=directCustomerAnswer(state,null,'أين موقعها','ar',{},'أين موقعها',null,false,history);
  const shortAddress=directCustomerAnswer(state,null,'والعنوان','ar',{},'والعنوان',null,false,history);
  const naturalAddress=directCustomerAnswer(state,null,'شركتكم وين','ar',{},'شركتكم وين',null,false,history);
  const pronounName=directCustomerAnswer(state,null,'ما اسمها','ar',{},'ما اسمها',null,false,history);
  assert.match(address,/广州彩尊企业管理咨询公司/);
  assert.match(shortAddress,/广州彩尊企业管理咨询公司/);
  assert.match(naturalAddress,/广州彩尊企业管理咨询公司/);
  assert.doesNotMatch(address,/لا تتوفر لدي/);
  assert.match(pronounName,/GUANGZHOU MIG TRADING CO., LTD/);
  assert.match(pronounName,/广州米各贸易有限公司/);
  assert.doesNotMatch(pronounName,/IMSG منصة تابعة/);

  const name=directCustomerAnswer(state,null,'اسم الشركة','ar');
  assert.match(name,/GUANGZHOU MIG TRADING CO., LTD/);
  assert.match(name,/广州米各贸易有限公司/);
  assert.doesNotMatch(name,/ويشار إليها باسم/);
});

test('company followups are not treated as product queries when recent history is about the company',()=>{
  const state={settings:{
    categories:[{id:'cat-cables-adapters',active:true,nameAr:'الكيابل والمحولات',nameEn:'Cables & Adapters'}],
    subcategories:[{id:'sub-charging-data-cables',parentId:'cat-cables-adapters',active:true,nameAr:'كيابل الشحن والبيانات',nameEn:'Charging & Data Cables'}]
  },publicOffers:[
    {id:'cable',status:'published',sku:'C1',unitPrice:2,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل شحن',titleEn:'Charging Cable'}}
  ]};
  const history=[{role:'user',content:'اسم الشركة'},{role:'assistant',content:'GUANGZHOU MIG TRADING CO., LTD.'}];
  assert.equal(isCustomerProductQuery(state,'العنوان',history),false);
  assert.equal(isCustomerProductQuery(state,'أين موقعها',history),false);
  assert.equal(isCustomerProductQuery(state,'شركتكم وين',history),false);
  assert.equal(isCustomerProductQuery(state,'ما اسمها',history),false);
});

test('shipping policy questions use the stored policy text locally',()=>{
  const state={settings:{storefront:{pages:[{
    id:'policy-shipping',active:true,title:'سياسة الشحن',titleEn:'Shipping Policy',
    content:'الشحن إلى السعودية: يتم تحديد تكلفة الشحن بعد تجهيز البضاعة حسب الوزن والحجم وطريقة الشحن.',
    contentEn:'Shipping to Saudi Arabia: shipping cost is confirmed after preparation based on weight, volume and shipping method.'
  }]}},publicOffers:[]};
  const reply=directCustomerAnswer(state,null,'كم تكلفة الشحن للسعودية؟','ar');
  assert.match(reply,/تحديد تكلفة الشحن بعد تجهيز البضاعة/);
});

test('company and policy questions are never classified as product-card queries',()=>{
  const state={settings:{
    categories:[{id:'cat-cables-adapters',active:true,nameAr:'الكيابل والمحولات',nameEn:'Cables & Adapters'}],
    subcategories:[{id:'sub-charging-data-cables',parentId:'cat-cables-adapters',active:true,nameAr:'كيابل الشحن والبيانات',nameEn:'Charging & Data Cables'}]
  },publicOffers:[
    {id:'cable',status:'published',sku:'C1',unitPrice:2,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل شحن',titleEn:'Charging Cable'}}
  ]};
  assert.equal(isCustomerProductQuery(state,'عنوان شركتكم',[]),false);
  assert.equal(isCustomerProductQuery(state,'أين مقركم',[]),false);
  assert.equal(isCustomerProductQuery(state,'عنوانك',[]),false);
  assert.equal(isCustomerProductQuery(state,'شركتكم وين',[]),false);
  assert.equal(isCustomerProductQuery(state,'سياسة الشحن',[]),false);
  assert.equal(isCustomerProductQuery(state,'أريد كابل رخيص',[]),true);
});

test('local-first product discovery answers from catalog without needing prose generation',()=>{
  const state={settings:{
    categories:[{id:'cat-cables-adapters',active:true,nameAr:'الكيابل والمحولات',nameEn:'Cables & Adapters'}],
    subcategories:[{id:'sub-charging-data-cables',parentId:'cat-cables-adapters',active:true,nameAr:'كيابل الشحن والبيانات',nameEn:'Charging & Data Cables'}]
  },publicOffers:[
    {id:'cheap',status:'published',sku:'C1',unitPrice:2.5,currency:'SAR',moq:100,subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل شحن اقتصادي',titleEn:'Budget Charging Cable'}},
    {id:'expensive',status:'published',sku:'C2',unitPrice:4,currency:'SAR',moq:100,subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل شحن سريع',titleEn:'Fast Charging Cable'}}
  ]};
  const query=resolveCustomerProductQuery(state,'أريد كابل رخيص',[]);
  const search=customerProductSearch(state,query,'ar');
  const reply=directCustomerAnswer(state,null,'أريد كابل رخيص','ar',{},query,search,true);
  assert.equal(search.recommendations[0]?.id,'cheap');
  assert.match(reply,/أرخص خيار مطابق/);
  assert.match(reply,/2.5 SAR/);
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
  const carIndex=rows.findIndex(x=>x.id==='car20');
  assert.ok(carIndex===-1||rows.findIndex(x=>x.id==='wall20')<carIndex);
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


test('guest product summary includes safe customer-facing specifications but not internal notes',()=>{
  const row={
    id:'p-safe',display_no:10101,created_at:'2026-10-01T00:00:00Z',
    data:{
      status:'published',sku:'SAFE-20',product:'Wall Charger',unitPrice:12,currency:'SAR',moq:10,
      categoryId:'cat-charging-power',subcategoryId:'sub-wall-chargers',
      shortDescription:'Fast charging',technicalSpecs:'PD 20W USB-C',options:'UK plug',
      leadTime:4,productNotes:'INTERNAL SUPPLIER NOTE',
      translation:{titleAr:'شاحن حائط سريع',titleEn:'Fast Wall Charger',descriptionAr:'شاحن PD بقدرة 20W',descriptionEn:'20W PD charger'}
    }
  };
  const item=publicAiProductSummary(row);
  assert.equal(item.technicalSpecs,'PD 20W USB-C');
  assert.equal(item.options,'UK plug');
  assert.equal(item.translation.descriptionAr,'شاحن PD بقدرة 20W');
  assert.equal(item.productNotes,undefined);
});

test('cheapest intent sorts by price after compatibility, not by relevance or popularity score',()=>{
  const state={publicOffers:[
    {id:'cheap',status:'published',sku:'CHEAP',unitPrice:8,currency:'SAR',subcategoryId:'sub-wall-chargers',technicalSpecs:'PD 20W USB-C',translation:{titleAr:'شاحن اقتصادي',titleEn:'Budget Charger'}},
    {id:'expensive',status:'published',sku:'BEST20',unitPrice:16,currency:'SAR',subcategoryId:'sub-wall-chargers',technicalSpecs:'PD 20W USB-C',translation:{titleAr:'شاحن حائط PD 20W سريع',titleEn:'Fast 20W PD Wall Charger'}},
    {id:'car',status:'published',sku:'CAR20',unitPrice:5,currency:'SAR',subcategoryId:'sub-car-chargers-fm',technicalSpecs:'20W',translation:{titleAr:'شاحن سيارة 20W',titleEn:'20W Car Charger'}}
  ]};
  const rows=customerProductRecommendations(state,'أريد أرخص شاحن حائط 20W','ar',{expensive:{score:8}});
  assert.equal(rows[0]?.id,'cheap');
  assert.ok(!rows.some(x=>x.id==='car'));
});

test('cheapest price at a requested quantity uses wholesale tiers',()=>{
  const state={publicOffers:[
    {id:'tiered',status:'published',sku:'TIER20',unitPrice:10,currency:'SAR',subcategoryId:'sub-wall-chargers',technicalSpecs:'PD 20W',tiers:[{min:100,price:5}],translation:{titleAr:'شاحن حائط 20W بالجملة',titleEn:'20W Wholesale Wall Charger'}},
    {id:'flat',status:'published',sku:'FLAT20',unitPrice:6,currency:'SAR',subcategoryId:'sub-wall-chargers',technicalSpecs:'PD 20W',translation:{titleAr:'شاحن حائط 20W',titleEn:'20W Wall Charger'}}
  ]};
  const withoutQty=customerProductRecommendations(state,'أريد أرخص شاحن حائط 20W','ar');
  assert.equal(withoutQty[0]?.id,'flat');

  const withQty=customerProductRecommendations(state,'أريد أرخص شاحن حائط 20W عدد 100','ar');
  assert.equal(withQty[0]?.id,'tiered');
  assert.equal(withQty[0]?.price,5);
  assert.equal(withQty[0]?.priceQuantity,100);
});

test('technical specs can make a generically titled product match an exact watt request',()=>{
  const state={publicOffers:[
    {id:'specOnly',status:'published',sku:'MX-X',unitPrice:7,currency:'SAR',subcategoryId:'sub-wall-chargers',technicalSpecs:'USB-C PD output 20W',translation:{titleAr:'شاحن سريع MX-X',titleEn:'Fast Charger MX-X'}},
    {id:'wrongWatt',status:'published',sku:'MX-Y',unitPrice:6,currency:'SAR',subcategoryId:'sub-wall-chargers',technicalSpecs:'USB-C PD output 30W',translation:{titleAr:'شاحن سريع MX-Y',titleEn:'Fast Charger MX-Y'}}
  ]};
  const rows=customerProductRecommendations(state,'أريد أرخص شاحن حائط 20W','ar');
  assert.equal(rows[0]?.id,'specOnly');
  assert.ok(!rows.some(x=>x.id==='wrongWatt'));
});


test('cheapest Bluetooth headset request excludes cheaper transmitters and receivers',()=>{
  const state={publicOffers:[
    {id:'tx',status:'published',sku:'BT-TX',unitPrice:6.25,currency:'SAR',translation:{titleAr:'مرسل Bluetooth',titleEn:'Bluetooth Transmitter'},technicalSpecs:'Bluetooth transmitter USB'},
    {id:'rx',status:'published',sku:'BT-RX',unitPrice:9.41,currency:'SAR',translation:{titleAr:'مستقبل لاسلكي للسيارة',titleEn:'Wireless Car Receiver'},technicalSpecs:'Bluetooth receiver for car'},
    {id:'tws1',status:'published',sku:'TWS-A',unitPrice:9.5,currency:'SAR',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعات TWS رياضية لاسلكية',titleEn:'Wireless TWS Sports Earbuds'}},
    {id:'tws2',status:'published',sku:'TWS-B',unitPrice:11,currency:'SAR',subcategoryId:'sub-tws-earbuds',translation:{titleAr:'سماعات TWS لاسلكية',titleEn:'Wireless TWS Earbuds'}}
  ]};
  const rows=customerProductRecommendations(state,'اريد ارخص سماعة بلوتوث','ar');
  assert.equal(rows[0]?.id,'tws1');
  assert.equal(rows[0]?.price,9.5);
  assert.ok(rows.every(x=>['tws1','tws2'].includes(x.id)));
});


const chatTaxonomy={
  categories:[
    {id:'cat-audio',active:true,nameAr:'الصوت والسماعات',nameEn:'Audio & Headphones'},
    {id:'cat-cables-adapters',active:true,nameAr:'الكيابل والمحولات',nameEn:'Cables & Adapters'},
    {id:'cat-charging-power',active:true,nameAr:'الشحن والطاقة',nameEn:'Charging & Power'},
    {id:'cat-computer-tablet',active:true,nameAr:'الكمبيوتر والأجهزة اللوحية',nameEn:'Computer & Tablet'}
  ],
  subcategories:[
    {id:'sub-tws-earbuds',parentId:'cat-audio',active:true,nameAr:'سماعات TWS',nameEn:'TWS Earbuds'},
    {id:'sub-charging-data-cables',parentId:'cat-cables-adapters',active:true,nameAr:'كيابل الشحن والبيانات',nameEn:'Charging & Data Cables'},
    {id:'sub-audio-cables-adapters',parentId:'cat-cables-adapters',active:true,nameAr:'كيابل ومحولات الصوت',nameEn:'Audio Cables & Adapters'},
    {id:'sub-power-banks',parentId:'cat-charging-power',active:true,nameAr:'الشواحن المتنقلة',nameEn:'Power Banks'},
    {id:'sub-wall-chargers',parentId:'cat-charging-power',active:true,nameAr:'شواحن الحائط',nameEn:'Wall Chargers'},
    {id:'sub-microphones',parentId:'cat-audio',active:true,nameAr:'الميكروفونات',nameEn:'Microphones'},
    {id:'sub-stylus-pens',parentId:'cat-computer-tablet',active:true,nameAr:'أقلام اللمس',nameEn:'Stylus Pens'}
  ]
};

test('a new explicit product type resets stale TWS context',()=>{
  const state={settings:chatTaxonomy};
  const history=[{role:'user',content:'TWS'}];
  assert.equal(resolveCustomerProductQuery(state,'اريد كابل رخيص',history),'اريد كابل رخيص');
  assert.equal(resolveCustomerProductQuery(state,'اريد باور بانك رخيص',history),'اريد باور بانك رخيص');
});

test('modifier-only followup inherits the latest explicit product type',()=>{
  const state={settings:chatTaxonomy};
  const history=[
    {role:'user',content:'TWS'},
    {role:'assistant',content:'هذه الخيارات'},
    {role:'user',content:'اريد باور بانك'}
  ];
  assert.equal(resolveCustomerProductQuery(state,'أرخص خيار',history),'اريد باور بانك أرخص خيار');
  assert.equal(resolveCustomerProductQuery(state,'عدد 100',history),'اريد باور بانك عدد 100');
});

test('TWS history cannot contaminate cable recommendation cards',()=>{
  const state={
    settings:chatTaxonomy,
    publicOffers:[
      {id:'tws',status:'published',sku:'T1',unitPrice:9.5,currency:'SAR',subcategoryId:'sub-tws-earbuds',categoryId:'cat-audio',translation:{titleAr:'سماعات TWS',titleEn:'TWS Earbuds'}},
      {id:'cableCheap',status:'published',sku:'C1',unitPrice:2.5,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل USB رخيص',titleEn:'USB Cable'}},
      {id:'cable2',status:'published',sku:'C2',unitPrice:3,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كيبل Type-C',titleEn:'Type-C Cable'}}
    ]
  };
  const query=resolveCustomerProductQuery(state,'اريد كابل رخيص',[{role:'user',content:'TWS'}]);
  const rows=customerProductRecommendations(state,query,'ar');
  assert.equal(rows[0]?.id,'cableCheap');
  assert.ok(rows.every(x=>x.id!=='tws'));
});

test('power bank followup stays inside power banks and sorts cheapest first',()=>{
  const state={
    settings:chatTaxonomy,
    publicOffers:[
      {id:'pbCheap',status:'published',sku:'PB1',unitPrice:12,currency:'SAR',subcategoryId:'sub-power-banks',categoryId:'cat-charging-power',translation:{titleAr:'باور بانك 10000mAh',titleEn:'10000mAh Power Bank'}},
      {id:'pbExpensive',status:'published',sku:'PB2',unitPrice:18,currency:'SAR',subcategoryId:'sub-power-banks',categoryId:'cat-charging-power',translation:{titleAr:'باور بانك سريع',titleEn:'Fast Power Bank'}},
      {id:'tws',status:'published',sku:'T1',unitPrice:9,currency:'SAR',subcategoryId:'sub-tws-earbuds',categoryId:'cat-audio',translation:{titleAr:'سماعات TWS',titleEn:'TWS Earbuds'}}
    ]
  };
  const query=resolveCustomerProductQuery(state,'أرخص خيار',[{role:'user',content:'اريد باور بانك'}]);
  const rows=customerProductRecommendations(state,query,'ar');
  assert.equal(rows[0]?.id,'pbCheap');
  assert.ok(rows.every(x=>x.id.startsWith('pb')));
});

test('store taxonomy enables product types not hardcoded in the old intent list',()=>{
  const state={
    settings:chatTaxonomy,
    publicOffers:[
      {id:'mic',status:'published',sku:'M1',unitPrice:20,currency:'SAR',subcategoryId:'sub-microphones',categoryId:'cat-audio',translation:{titleAr:'ميكروفون لاسلكي',titleEn:'Wireless Microphone'}},
      {id:'stylus',status:'published',sku:'S1',unitPrice:15,currency:'SAR',subcategoryId:'sub-stylus-pens',categoryId:'cat-computer-tablet',translation:{titleAr:'قلم لمس',titleEn:'Stylus Pen'}},
      {id:'tws',status:'published',sku:'T1',unitPrice:8,currency:'SAR',subcategoryId:'sub-tws-earbuds',categoryId:'cat-audio',translation:{titleAr:'سماعات TWS',titleEn:'TWS Earbuds'}}
    ]
  };
  assert.deepEqual(customerProductRecommendations(state,'مايكروفون رخيص','ar').map(x=>x.id),['mic']);
  assert.deepEqual(customerProductRecommendations(state,'قلم لمس رخيص','ar').map(x=>x.id),['stylus']);
});


test('cheapest followup after a cable request stays inside cables',()=>{
  const state={
    settings:chatTaxonomy,
    publicOffers:[
      {id:'cableCheap',status:'published',sku:'C1',unitPrice:2.5,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل USB اقتصادي',titleEn:'Budget USB Cable'}},
      {id:'cableExpensive',status:'published',sku:'C2',unitPrice:4,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',translation:{titleAr:'كابل Type-C سريع',titleEn:'Fast Type-C Cable'}},
      {id:'tws',status:'published',sku:'T1',unitPrice:1,currency:'SAR',subcategoryId:'sub-tws-earbuds',categoryId:'cat-audio',translation:{titleAr:'سماعات TWS',titleEn:'TWS Earbuds'}}
    ]
  };
  const query=resolveCustomerProductQuery(state,'أرخص',[{role:'user',content:'أريد كابل'}]);
  const rows=customerProductRecommendations(state,query,'ar');
  assert.equal(rows[0]?.id,'cableCheap');
  assert.ok(rows.every(x=>x.id.startsWith('cable')));
});

test('quantity followup after a charger request uses the matching wholesale tier',()=>{
  const state={
    settings:chatTaxonomy,
    publicOffers:[
      {id:'tiered',status:'published',sku:'W20-TIER',unitPrice:10,currency:'SAR',subcategoryId:'sub-wall-chargers',categoryId:'cat-charging-power',technicalSpecs:'PD 20W USB-C',tiers:[{min:100,price:5}],translation:{titleAr:'شاحن حائط 20W بالجملة',titleEn:'20W Wholesale Wall Charger'}},
      {id:'flat',status:'published',sku:'W20-FLAT',unitPrice:6,currency:'SAR',subcategoryId:'sub-wall-chargers',categoryId:'cat-charging-power',technicalSpecs:'PD 20W USB-C',translation:{titleAr:'شاحن حائط 20W',titleEn:'20W Wall Charger'}},
      {id:'cable',status:'published',sku:'C20',unitPrice:2,currency:'SAR',subcategoryId:'sub-charging-data-cables',categoryId:'cat-cables-adapters',technicalSpecs:'20W cable',translation:{titleAr:'كابل شحن',titleEn:'Charging Cable'}}
    ]
  };
  const query=resolveCustomerProductQuery(state,'100 حبة',[{role:'user',content:'أريد أرخص شاحن حائط 20W'}]);
  const rows=customerProductRecommendations(state,query,'ar');
  assert.equal(rows[0]?.id,'tiered');
  assert.equal(rows[0]?.price,5);
  assert.equal(rows[0]?.priceQuantity,100);
  assert.ok(rows.every(x=>x.id!=='cable'));
});

test('live storefront taxonomy matches a new future subcategory without hardcoded product rules',()=>{
  const taxonomy={
    categories:[{id:'cat-protection',active:true,nameAr:'حماية الجوال',nameEn:'Phone Protection'}],
    subcategories:[{id:'sub-screen-protectors',parentId:'cat-protection',active:true,nameAr:'واقيات الشاشة',nameEn:'Screen Protectors'}]
  };
  const state={
    settings:taxonomy,
    publicOffers:[
      {id:'glass',status:'published',sku:'GL1',unitPrice:3,currency:'SAR',subcategoryId:'sub-screen-protectors',categoryId:'cat-protection',translation:{titleAr:'زجاج مقوى شفاف',titleEn:'Clear Tempered Glass'}},
      {id:'other',status:'published',sku:'OT1',unitPrice:1,currency:'SAR',subcategoryId:'sub-other',categoryId:'cat-other',translation:{titleAr:'منتج آخر',titleEn:'Other Product'}}
    ]
  };
  assert.deepEqual(customerProductRecommendations(state,'أريد واقيات الشاشة الأرخص','ar').map(x=>x.id),['glass']);
});

test('AI context and product cards share the exact same ranked first product and tier price',()=>{
  const state={
    settings:chatTaxonomy,
    publicOffers:[
      {id:'tiered',status:'published',sku:'W20-TIER',product:'Wall Charger',unitPrice:10,currency:'SAR',moq:20,leadTime:4,subcategoryId:'sub-wall-chargers',categoryId:'cat-charging-power',technicalSpecs:'PD 20W USB-C',options:'UK plug',tiers:[{min:100,price:5}],translation:{titleAr:'شاحن حائط 20W بالجملة',titleEn:'20W Wholesale Wall Charger',descriptionAr:'شاحن سريع',descriptionEn:'Fast charger'}},
      {id:'flat',status:'published',sku:'W20-FLAT',product:'Wall Charger',unitPrice:6,currency:'SAR',subcategoryId:'sub-wall-chargers',categoryId:'cat-charging-power',technicalSpecs:'PD 20W USB-C',translation:{titleAr:'شاحن حائط 20W',titleEn:'20W Wall Charger'}}
    ]
  };
  const search=customerProductSearch(state,'أريد أرخص شاحن حائط 20W عدد 100','ar');
  assert.equal(search.context[0]?.id,'tiered');
  assert.equal(search.recommendations[0]?.id,'tiered');
  assert.equal(search.context[0]?.price,5);
  assert.equal(search.recommendations[0]?.price,5);
  assert.equal(search.context[0]?.technicalSpecs,'PD 20W USB-C');
  assert.equal(search.context[0]?.options,'UK plug');
  assert.deepEqual(search.context[0]?.tiers,[{min:100,price:5}]);
});
