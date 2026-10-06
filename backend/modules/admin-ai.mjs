import {snapshot} from './records.mjs';
import {can} from './auth.mjs';
import {assert,HttpError} from '../lib/supabase.mjs';

const OPENAI_URL='https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL='gpt-5.6-luna';
const usage=new Map();
const WINDOW_MS=10*60*1000;

const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const clamp=(value,max)=>clean(value).slice(0,max);
const num=value=>Number.isFinite(Number(value))?Number(value):0;
const titleOf=item=>{
  const t=item?.translation||{};
  return clamp(t.titleAr||t.titleEn||item?.product||item?.title||'',180);
};
const statusCounts=rows=>rows.reduce((acc,row)=>{
  const key=clamp(row?.status||'unknown',60)||'unknown';
  acc[key]=(acc[key]||0)+1;
  return acc;
},{});
const stageCounts=rows=>rows.reduce((acc,row)=>{
  const key=String(Number.isInteger(Number(row?.orderStage))?Number(row.orderStage):'unknown');
  acc[key]=(acc[key]||0)+1;
  return acc;
},{});
const topEntries=(map,limit=12)=>[...map.values()].sort((a,b)=>b.quantity-a.quantity||b.orderCount-a.orderCount).slice(0,limit);

export function buildAdminAiContext(state={}){
  const offers=(state.publicOffers||[]).filter(x=>!x?.deletedAt);
  const published=offers.filter(x=>x.status==='published');
  const drafts=offers.filter(x=>x.status!=='published'&&x.status!=='source_review');
  const interests=state.interests||[];
  const requests=state.requests||[];
  const cartOrders=requests.filter(x=>x?.orderType==='cart'||x?.orderFlowVersion===2);
  const customers=(state.accounts||[]).filter(x=>x?.role==='client'&&!x?.deletedAt);
  const interestById=new Map(interests.map(x=>[x.id,x]));
  const productById=new Map(offers.map(x=>[x.id,x]));
  const performance=new Map();

  for(const order of cartOrders){
    const seen=new Set();
    for(const line of order?.cartItems||[]){
      const interest=interestById.get(line.interestId);
      const productId=interest?.offerId||line.offerId||'';
      if(!productId)continue;
      const product=productById.get(productId);
      const row=performance.get(productId)||{
        productId,
        sku:clamp(product?.sku,80),
        title:titleOf(product),
        orderCount:0,
        quantity:0
      };
      row.quantity+=num(line.quantity);
      if(!seen.has(productId)){row.orderCount+=1;seen.add(productId);}
      performance.set(productId,row);
    }
  }

  const lowStock=published
    .filter(x=>x.stock!==null&&x.stock!==undefined&&Number.isFinite(Number(x.stock))&&Number(x.stock)<=Math.max(10,num(x.moq)))
    .slice(0,20)
    .map(x=>({sku:clamp(x.sku,80),title:titleOf(x),stock:num(x.stock),moq:num(x.moq)}));

  const products=published.slice(0,120).map(item=>({
    id:clamp(item.id,100),
    sku:clamp(item.sku,80),
    title:titleOf(item),
    price:Number.isFinite(Number(item.unitPrice))?Number(item.unitPrice):null,
    currency:clamp(item.currency||'SAR',12),
    moq:item.moq??null,
    stock:item.stock??null,
    categoryId:clamp(item.categoryId,100),
    subcategoryId:clamp(item.subcategoryId,100),
    country:clamp(item.country,100),
    createdAt:clamp(item.createdAt,40)
  }));

  const sections=(state.settings?.storefront?.sections||[]).slice(0,40).map(section=>({
    id:clamp(section.id,80),
    type:clamp(section.type,60),
    title:clamp(section.title,180),
    titleEn:clamp(section.titleEn,180),
    visible:section.visible!==false,
    categoryId:clamp(section.categoryId,100),
    collectionId:clamp(section.collectionId,100),
    productIds:(Array.isArray(section.productIds)?section.productIds:Array.isArray(section.products)?section.products:[]).map(x=>typeof x==='string'?x:x?.id).filter(Boolean).slice(0,24)
  }));

  const customerCountries=new Map();
  for(const customer of customers){
    const country=clamp(customer.country||'غير محدد',80)||'غير محدد';
    customerCountries.set(country,(customerCountries.get(country)||0)+1);
  }

  return {
    generatedAt:new Date().toISOString(),
    privacy:'aggregated_no_customer_names_emails_phones',
    capabilities:{
      readOnly:true,
      canModifyStore:false,
      behavioralEventsAvailable:false
    },
    overview:{
      products:{total:offers.length,published:published.length,drafts:drafts.length,lowStock:lowStock.length},
      customers:{total:customers.length,byCountry:[...customerCountries.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([country,count])=>({country,count}))},
      orders:{total:cartOrders.length,byStatus:statusCounts(cartOrders),byStage:stageCounts(cartOrders)},
      sourcingRequests:{total:requests.filter(x=>x?.orderType!=='cart'&&x?.orderFlowVersion!==2).length},
      storefront:{sections:sections.length,visibleSections:sections.filter(x=>x.visible).length}
    },
    topPurchasedProducts:topEntries(performance),
    lowStock,
    products,
    storefront:{sections}
  };
}

function enforceRateLimit(user){
  const key=user?.id||'unknown',now=Date.now();
  let row=usage.get(key);
  if(!row||now-row.startedAt>=WINDOW_MS)row={startedAt:now,count:0};
  row.count+=1;usage.set(key,row);
  if(row.count>30)throw new HttpError(429,'تم الوصول إلى حد استخدام MG AI مؤقتًا. حاول بعد قليل. / MG AI usage limit reached.');
}

function normalizeHistory(value){
  if(!Array.isArray(value))return [];
  return value.slice(-8).map(row=>({
    role:row?.role==='assistant'?'assistant':'user',
    content:clamp(row?.content,1400)
  })).filter(row=>row.content);
}

function extractReply(data){
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string')return content.trim();
  if(Array.isArray(content))return content.map(x=>typeof x==='string'?x:x?.text||'').join('\n').trim();
  return '';
}

function providerError(status){
  if(status===429)return new HttpError(429,'تم الوصول إلى حد استخدام الذكاء الاصطناعي مؤقتًا. / AI usage limit reached.');
  if(status===402)return new HttpError(503,'خدمة MG AI متوقفة مؤقتًا بسبب حد الميزانية. / MG AI budget limit reached.');
  if(status===401||status===403)return new HttpError(503,'إعداد OpenAI يحتاج مراجعة. / OpenAI configuration needs review.');
  return new HttpError(502,'تعذر الحصول على رد من MG AI. / MG AI is temporarily unavailable.');
}

export async function adminAiOverview(user){
  assert(can(user,'settings'),403,'لا تملك صلاحية MG AI / MG AI permission required');
  const state=await snapshot(user);
  const context=buildAdminAiContext(state);
  return {
    mode:'readonly',
    overview:context.overview,
    quickPrompts:[
      'حلل أداء المتجر واقترح أهم 5 إجراءات الآن',
      'اقترح ترتيب الصفحة الرئيسية والمنتجات التي يجب أن تظهر أولًا',
      'ما المنتجات التي تستحق حملة تسويقية الآن ولماذا؟',
      'راجع الكتالوج واقترح تحسينات للمنتجات والمخزون'
    ],
    behaviorTrackingAvailable:false
  };
}

export async function adminAi(user,body={}){
  assert(can(user,'settings'),403,'لا تملك صلاحية MG AI / MG AI permission required');
  const message=clamp(body.message,2500);
  assert(message,400,'اكتب طلبك إلى MG AI / Enter a request for MG AI');
  enforceRateLimit(user);

  const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
  if(!apiKey)throw new HttpError(503,'لم يتم تفعيل مفتاح OpenAI بعد. / OpenAI API key is not configured yet.');
  const model=String(process.env.OPENAI_ADMIN_MODEL||process.env.OPENAI_CHAT_MODEL||DEFAULT_MODEL).replace(/^openai\//,'');
  const state=await snapshot(user);
  const context=buildAdminAiContext(state);
  const history=normalizeHistory(body.history);
  const language=body.language==='en'?'en':'ar';

  const system=language==='en'
    ?`You are MG AI, the read-only admin merchandising and business analyst inside M Platform. Use only ADMIN_CONTEXT_JSON. Never invent metrics, customer behavior, views, searches, cart events, margins, or profit. Behavioral event tracking is not enabled yet, so say that clearly whenever the request depends on it. Never reveal or request customer names, emails, phone numbers, addresses, or other personal data. Distinguish data-backed findings from recommendations. For homepage merchandising, prioritize wholesale relevance, product diversity, observed order history, stock and catalog quality. You cannot edit, publish, reorder or launch campaigns in this phase. If the admin asks you to make a change, provide a precise proposed change and state that it requires preview/approval when write actions are enabled. Keep answers practical and concise.`
    :`أنت MG AI، محلل المتجر والتسويق وترتيب المنتجات داخل لوحة إدارة M Platform بوضع قراءة فقط. اعتمد فقط على ADMIN_CONTEXT_JSON ولا تخترع أي أرقام أو سلوك للعملاء أو مشاهدات أو عمليات بحث أو إضافات للسلة أو هامش ربح. تتبع أحداث سلوك العملاء غير مفعل بعد، لذلك اذكر هذا بوضوح عندما يعتمد السؤال عليه. لا تعرض ولا تطلب أسماء العملاء أو البريد أو الهاتف أو العنوان أو أي بيانات شخصية. فرّق بوضوح بين النتائج المبنية على البيانات وبين الاقتراحات. عند اقتراح الصفحة الرئيسية راعِ طبيعة الجملة، تنويع فئات المنتجات، سجل الطلبات المتاح، المخزون وجودة الكتالوج. لا تستطيع في هذه المرحلة تعديل أو نشر أو إعادة ترتيب أو تشغيل حملة؛ إذا طُلب منك تنفيذ تغيير فاعرض التغيير المقترح بدقة واذكر أنه يحتاج معاينة واعتماد عند تفعيل صلاحيات الكتابة لاحقًا. اجعل الإجابة عملية ومختصرة.`;

  const payload={
    model,
    messages:[
      {role:'system',content:system},
      {role:'system',content:'ADMIN_CONTEXT_JSON\n'+JSON.stringify(context)},
      ...history,
      {role:'user',content:message}
    ],
    max_tokens:1000,
    temperature:0.25,
    reasoning:{effort:'none'}
  };

  let response;
  try{
    response=await fetch(OPENAI_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(26000)
    });
  }catch{
    throw new HttpError(502,'تعذر الاتصال بـ MG AI الآن. / Could not connect to MG AI.');
  }
  if(!response.ok)throw providerError(response.status);
  let data;
  try{data=await response.json();}catch{throw new HttpError(502,'استجابة MG AI غير صالحة. / Invalid MG AI response.');}
  const reply=extractReply(data);
  if(!reply)throw new HttpError(502,'لم يصل رد صالح من MG AI. / MG AI returned an empty response.');
  return {reply,mode:'readonly',overview:context.overview,behaviorTrackingAvailable:false};
}
