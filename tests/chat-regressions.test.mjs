import test from 'node:test';
import assert from 'node:assert/strict';
import {customerProductSearch,wantsHumanSupport,resolveCustomerProductQuery} from '../backend/modules/ai-chat.mjs';
const audio=[
 ['ows','sub-ows-neckband','سماعة OWS مع ENC','ENC OWS Headset'],
 ['tws','sub-tws-earbuds','سماعات TWS','TWS Earbuds'],
 ['head','sub-headphones-gaming','سماعة رأس','Headphones'],
 ['wired','sub-wired-earphones','سماعات سلكية','Wired Earphones'],
 ['speaker','sub-bluetooth-speakers','مكبر صوت بلوتوث','Bluetooth Speaker']
];
const state={settings:{categories:[{id:'cat-audio',active:true,nameAr:'الصوت والسماعات',nameEn:'Audio & Headphones'}],subcategories:audio.map(([id,sub,ar,en])=>({id:sub,parentId:'cat-audio',active:true,nameAr:ar,nameEn:en}))},publicOffers:audio.map(([id,sub,ar,en])=>({id,status:'published',sku:id.toUpperCase()+'-100',unitPrice:10,currency:'SAR',categoryId:'cat-audio',subcategoryId:sub,translation:{titleAr:ar,titleEn:en,descriptionEn:'Speaker specifications: 12mm, 32 ohms. Headphone driver unit.'}}))};

test('broad Arabic discovery includes all personal audio types even when descriptions mention speaker components',()=>{
 for(const query of ['سماعات','هل توجد سماعات في المنتجات الحالية؟ اعرض أمثلة إن وجدت.']){
  assert.deepEqual(new Set(customerProductSearch(state,query).recommendations.map(p=>p.id)),new Set(['ows','tws','head','wired']));
 }
});
test('wireless and wired Arabic/English requests do not collide',()=>{
 for(const query of ['سماعات لاسلكية','wireless earphones']){
  const ids=customerProductSearch(state,query).recommendations.map(p=>p.id);
  assert.ok(ids.includes('ows'));assert.ok(ids.includes('tws'));assert.ok(!ids.includes('wired'));assert.ok(!ids.includes('speaker'));
 }
 for(const query of ['سماعات سلكية','wired earphones'])assert.deepEqual(customerProductSearch(state,query).recommendations.map(p=>p.id),['wired']);
});
test('explicit audio subtypes remain precise despite component descriptions',()=>{
 for(const [query,id] of [['سماعات OWS','ows'],['سماعات TWS','tws'],['سماعة رأس','head'],['مكبر صوت بلوتوث','speaker']]){
  assert.deepEqual(customerProductSearch(state,query).recommendations.map(p=>p.id),[id]);
 }
});
test('cheapest followup retains audio context',()=>{
 const q=resolveCustomerProductQuery(state,'أرخص خيار',[{role:'user',content:'سماعات'}]);
 assert.ok(customerProductSearch(state,q).recommendations.length);
});
test('handoff respects negation, informational questions, and explicit requests',()=>{
 for(const message of ['هذه محادثة اختبار تقني فقط، لا تنشئ طلبًا ولا تحولها لموظف. ما خدمات IMSG؟','دون إنشاء طلب أو تحويل لموظف','لا أريد موظف','ما ابغى موظف','لا تحوّلني لخدمة العملاء',"Don't transfer me to a human agent",'I do not need customer service','Continue without a human agent','ما ساعات عمل خدمة العملاء؟','أريد سماعات للموظفين','أريد معلومات عن خدمة العملاء','What are your customer service hours?'])assert.equal(wantsHumanSupport(message),false,message);
 for(const message of ['أريد التحدث مع موظف','حوّلني لموظف','أحتاج خدمة العملاء','موظف','خدمة العملاء','Connect me to a human agent','I want to speak to an agent','human agent','لا أريد الشات، لكن حولني لموظف'])assert.equal(wantsHumanSupport(message),true,message);
});

test('guest chat persists matching catalog cards and hands off only on an explicit request',async()=>{
 const {aiChat}=await import('../backend/modules/ai-chat.mjs');
 const originalFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN'],previous=keys.map(k=>process.env[k]);
 Object.assign(process.env,{SUPABASE_URL:'https://chat-test.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',APP_ORIGIN:'https://chat-test.invalid'});
 const tables={ai_conversations:[],ai_messages:[],chat_conversion_events:[],ai_usage:[],settings:[{id:'site',version:1,data:state.settings}],profiles:[],public_offers:state.publicOffers.map(p=>({id:p.id,version:1,data:{...p,storeOwned:true},created_at:'2026-10-08T00:00:00Z'}))};
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);assert.equal(u.hostname,'chat-test.invalid','No external service calls in this test');
  const table=u.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
  if(!tables[table])tables[table]=[];
  if(options.method==='POST'){
   const rows=(Array.isArray(body)?body:[body]).map(row=>({id:table==='ai_conversations'?'11111111-1111-4111-8111-111111111111':tables[table].length+1,...row}));tables[table].push(...rows);return Response.json(rows);
  }
  let rows=tables[table].filter(row=>[...u.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(row[key]??row.data?.[key.replace('data->>','')])===value.slice(3)));
  if(options.method==='PATCH')rows.forEach(row=>Object.assign(row,body));
  return Response.json(rows);
 };
 try{
  const guestKey='test-guest-session-12345678';
  const first=await aiChat(null,{message:'هل توجد سماعات في المنتجات الحالية؟ اعرض أمثلة إن وجدت.',guestKey,language:'ar'});
  assert.equal(first.source,'database');assert.ok(first.recommendations.some(p=>p.id==='ows'));
  assert.ok(!first.recommendations.some(p=>p.id==='speaker'));assert.equal(first.waitingHuman,false);
  assert.ok(tables.ai_messages.some(row=>row.sender==='ai'&&row.metadata.products?.some(p=>p.id==='ows')));
  const no=await aiChat(null,{message:'لا تحولني لموظف، أريد سماعات',guestKey,conversationId:first.conversationId,language:'ar'});
  assert.equal(no.waitingHuman,false);assert.equal(tables.ai_conversations[0].handoff_requested_at,undefined);
  const yes=await aiChat(null,{message:'حولني لموظف',guestKey,conversationId:first.conversationId,language:'ar'});
  assert.equal(yes.waitingHuman,true);assert.ok(tables.ai_conversations[0].handoff_requested_at);
 }finally{
  globalThis.fetch=originalFetch;keys.forEach((key,i)=>{if(previous[i]===undefined)delete process.env[key];else process.env[key]=previous[i];});
 }
});
