import {snapshot} from './records.mjs';
import {can} from './auth.mjs';
import {assert,HttpError} from '../lib/supabase.mjs';
import {recordAiUsage,aiUsageSummary} from './ai-usage.mjs';

const OPENAI_URL='https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL='gpt-6-luna';
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
    .slice(0,12)
    .map(x=>({sku:clamp(x.sku,80),title:titleOf(x),stock:num(x.stock),moq:num(x.moq)}));

  const products=published.map(item=>({
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

  const sections=(state.settings?.storefront?.sections||[]).slice(0,20).map(section=>({
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
      canCreateReviewedDrafts:true,
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


const adminTerms=text=>clean(text).toLowerCase().split(/[^\p{L}\p{N}._-]+/u).filter(x=>x.length>=2).slice(0,24);
function leanAdminContext(context,message){
  const needles=adminTerms(message);
  const ranked=(context.products||[]).map(product=>{
    const hay=clean([product.sku,product.title,product.categoryId,product.subcategoryId,product.country].filter(Boolean).join(' ')).toLowerCase();
    const score=needles.reduce((sum,term)=>sum+(hay.includes(term)?(String(product.sku||'').toLowerCase().includes(term)?5:1):0),0);
    return {product,score};
  }).sort((a,b)=>b.score-a.score);
  const productSignals=['منتج','المنتجات','sku','product','catalog','كتالوج','مخزون','stock','سعر','price','حملة','campaign'];
  const wantsProducts=productSignals.some(x=>clean(message).toLowerCase().includes(x));
  const relevant=ranked.filter(x=>x.score>0).slice(0,8).map(x=>x.product);
  return {
    ...context,
    products:wantsProducts?relevant:[],
    topPurchasedProducts:(context.topPurchasedProducts||[]).slice(0,10),
    lowStock:(context.lowStock||[]).slice(0,12),
    storefront:{sections:(context.storefront?.sections||[]).slice(0,20)}
  };
}
export function directAdminAnswer(context,message,language='ar'){
  const q=clean(message).toLowerCase(),o=context?.overview||{};
  const askCount=/كم|عدد|how many|count/.test(q);
  if(!askCount)return '';
  if(/المنتجات|منتج|products?/.test(q)){
    if(/مسود|draft/.test(q))return language==='en'?'Draft products: '+Number(o.products?.drafts||0):'عدد المنتجات المسودة: '+Number(o.products?.drafts||0);
    if(/منشور|published|active/.test(q))return language==='en'?'Published products: '+Number(o.products?.published||0):'عدد المنتجات المنشورة: '+Number(o.products?.published||0);
    return language==='en'?'Total products: '+Number(o.products?.total||0):'إجمالي المنتجات: '+Number(o.products?.total||0);
  }
  if(/العملاء|عميل|customers?/.test(q))return language==='en'?'Customers: '+Number(o.customers?.total||0):'عدد العملاء: '+Number(o.customers?.total||0);
  if(/الطلبات|طلب|orders?/.test(q))return language==='en'?'Store orders: '+Number(o.orders?.total||0):'عدد طلبات المتجر: '+Number(o.orders?.total||0);
  return '';
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
  return value.slice(-6).map(row=>({
    role:row?.role==='assistant'?'assistant':'user',
    content:clamp(row?.content,900)
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

const parseJsonObject=value=>{
  const raw=String(value||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{return JSON.parse(raw);}catch{}
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1));}catch{}}
  return null;
};
const safeAiImage=value=>{
  const image=String(value||'');
  assert(image.length>50&&image.length<=480000,413,'إحدى صور التحليل كبيرة جدًا / One analysis image is too large');
  assert(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(image),400,'صيغة صورة غير مدعومة / Unsupported image format');
  return image;
};

export function buildProductDraftReference(state={}){
  const categories=(state.settings?.categories||[]).filter(x=>x?.active!==false).slice(0,100).map(x=>({
    id:clamp(x.id,80),nameAr:clamp(x.nameAr,120),nameEn:clamp(x.nameEn,120)
  }));
  const categoryIds=new Set(categories.map(x=>x.id));
  const subcategories=(state.settings?.subcategories||[]).filter(x=>x?.active!==false&&categoryIds.has(String(x.parentId||''))).slice(0,160).map(x=>({
    id:clamp(x.id,80),parentId:clamp(x.parentId,80),nameAr:clamp(x.nameAr,120),nameEn:clamp(x.nameEn,120)
  }));
  const supplyCountries=(Array.isArray(state.settings?.supplyCountries)&&state.settings.supplyCountries.length?state.settings.supplyCountries:[
    {id:'China',nameAr:'الصين',nameEn:'China',active:true},
    {id:'United Arab Emirates',nameAr:'الإمارات',nameEn:'United Arab Emirates',active:true}
  ]).filter(x=>x?.active!==false).slice(0,80).map(x=>({
    id:clamp(x.id,80),nameAr:clamp(x.nameAr||x.id,120),nameEn:clamp(x.nameEn||x.id,120)
  }));
  return {categories,subcategories,supplyCountries};
}

async function generateProductDraft(user,body,{apiKey,model,state}){
  assert(can(user,'offers.edit'),403,'لا تملك صلاحية إضافة المنتجات / Product edit permission required');
  const images=Array.isArray(body.images)?body.images.slice(0,3).map(safeAiImage):[];
  assert(images.length>0,400,'أضف صورة واحدة على الأقل / Add at least one product image');
  const notes=clamp(body.notes,1800);
  const suppliedSku=clamp(body.sku,80);
  assert(!suppliedSku||/^[A-Za-z0-9._-]{1,80}$/.test(suppliedSku),400,'تحقق من SKU / Check SKU');
  const reference=buildProductDraftReference(state);
  const system=`You create wholesale product catalog drafts for M Platform from product images and optional admin notes. Return only facts visible in the images or explicitly supplied by the admin. Do not invent brand, model, material, wattage, ports, compatibility, certifications, colors, capacity, dimensions, warranty, or other specifications. Write persuasive but factual B2B copy in Arabic and English. Select categoryId and subcategoryId only from TAXONOMY_JSON, otherwise use empty strings. Do not decide price, MOQ, stock, lead time, currency, or supply country. SKU may be copied only when clearly visible in the image or explicitly supplied. Never include phone numbers, emails, URLs, social handles, supplier identity, or contact details. Set needsMoreImages=true only when the supplied image(s) are not enough to identify the product or important visible specifications with reasonable confidence; otherwise false.`;
  const adminText=[
    'ADMIN_NOTES: '+(notes||'(none)'),
    'SUPPLIED_SKU: '+(suppliedSku||'(none)'),
    'TAXONOMY_JSON: '+JSON.stringify({categories:reference.categories,subcategories:reference.subcategories})
  ].join('\n');
  const payload={
    model,
    messages:[
      {role:'system',content:system},
      {role:'user',content:[
        {type:'text',text:adminText},
        ...images.map(image=>({type:'image_url',image_url:{url:image,detail:'low'}}))
      ]}
    ],
    response_format:{
      type:'json_schema',
      json_schema:{
        name:'mg_product_draft',
        strict:true,
        schema:{
          type:'object',
          properties:{
            name:{type:'string'},
            nameEn:{type:'string'},
            sku:{type:'string'},
            shortDescription:{type:'string'},
            description:{type:'string'},
            descriptionEn:{type:'string'},
            technicalSpecs:{type:'string'},
            options:{type:'string'},
            categoryId:{type:'string'},
            subcategoryId:{type:'string'},
            reviewNotes:{type:'string'},
            needsMoreImages:{type:'boolean'}
          },
          required:['name','nameEn','sku','shortDescription','description','descriptionEn','technicalSpecs','options','categoryId','subcategoryId','reviewNotes','needsMoreImages'],
          additionalProperties:false
        }
      }
    },
    max_completion_tokens:950,
    temperature:0.15,
    reasoning_effort:'none'
  };
  let response;
  try{
    response=await fetch(OPENAI_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(28000)
    });
  }catch{
    throw new HttpError(502,'تعذر تحليل صور المنتج الآن. / Could not analyze product images.');
  }
  if(!response.ok)throw providerError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة تحليل المنتج غير صالحة. / Invalid product analysis response.');}
  const parsed=parseJsonObject(extractReply(data));
  assert(parsed,502,'تعذر فهم نتيجة تحليل المنتج. / Could not parse product analysis.');
  const categoryId=reference.categories.some(x=>x.id===parsed.categoryId)?parsed.categoryId:'';
  const subcategoryId=reference.subcategories.some(x=>x.id===parsed.subcategoryId&&x.parentId===categoryId)?parsed.subcategoryId:'';
  const visibleSku=clamp(parsed.sku,80);
  const generatedSku='MG-AI-'+Date.now().toString(36).toUpperCase();
  const sku=suppliedSku||(/^[A-Za-z0-9._-]{1,80}$/.test(visibleSku)?visibleSku:generatedSku);
  const draft={
    name:clamp(parsed.name,100),
    nameEn:clamp(parsed.nameEn,100),
    sku,
    shortDescription:clamp(parsed.shortDescription,500),
    description:clamp(parsed.description,5000),
    descriptionEn:clamp(parsed.descriptionEn,5000),
    technicalSpecs:clamp(parsed.technicalSpecs,5000),
    options:clamp(parsed.options,1000),
    categoryId,
    subcategoryId,
    reviewNotes:clamp(parsed.reviewNotes,1000)
  };
  const needsMoreImages=parsed.needsMoreImages===true;
  assert(draft.name,502,'لم يتمكن MG AI من تحديد المنتج بوضوح. أضف صورًا أوضح أو ملاحظة قصيرة. / MG AI could not identify the product clearly.');
  await recordAiUsage({surface:'product_draft',source:'openai',user,model,usage:data?.usage});
  return {draft,taxonomy:reference,mode:'draft-proposal',needsMoreImages,usage:data?.usage||null};
}

export async function adminAiOverview(user){
  assert(can(user,'settings'),403,'لا تملك صلاحية MG AI / MG AI permission required');
  const state=await snapshot(user);
  const context=buildAdminAiContext(state);
  let usage=null;try{usage=await aiUsageSummary();}catch(error){console.warn('AI usage summary failed',error?.message||'unknown');}
  return {
    mode:'proposal',
    overview:context.overview,
    usage,
    taxonomy:buildProductDraftReference(state),
    productDraftEnabled:can(user,'offers.edit'),
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
  enforceRateLimit(user);

  const apiKey=String(process.env.OPENAI_API_KEY||'').trim();
  if(!apiKey)throw new HttpError(503,'لم يتم تفعيل مفتاح OpenAI بعد. / OpenAI API key is not configured yet.');
  const model=String(process.env.OPENAI_ADMIN_MODEL||process.env.OPENAI_CHAT_MODEL||DEFAULT_MODEL).replace(/^openai\//,'');
  const state=await snapshot(user);
  if(body.action==='product-draft')return generateProductDraft(user,body,{apiKey,model,state});
  const message=clamp(body.message,2500);
  assert(message,400,'اكتب طلبك إلى MG AI / Enter a request for MG AI');
  const context=buildAdminAiContext(state);
  const history=normalizeHistory(body.history);
  const language=body.language==='en'?'en':'ar';
  const direct=directAdminAnswer(context,message,language);
  if(direct){
    await recordAiUsage({surface:'admin',source:'database',user,model});
    return {reply:direct,mode:'database',overview:context.overview,behaviorTrackingAvailable:false};
  }
  const llmContext=leanAdminContext(context,message);

  const system=language==='en'
    ?`You are MG AI, the read-only admin merchandising and business analyst inside M Platform. Use only ADMIN_CONTEXT_JSON. Never invent metrics, customer behavior, views, searches, cart events, margins, or profit. Behavioral event tracking is not enabled yet, so say that clearly whenever the request depends on it. Never reveal or request customer names, emails, phone numbers, addresses, or other personal data. Distinguish data-backed findings from recommendations. For homepage merchandising, prioritize wholesale relevance, product diversity, observed order history, stock and catalog quality. You cannot directly edit, publish, reorder or launch campaigns. Product creation is available only through the separate reviewed draft workflow in the admin UI. If the admin asks you to make a store change, provide a precise proposal and require admin approval. Keep answers practical and concise.`
    :`أنت MG AI، محلل المتجر والتسويق وترتيب المنتجات داخل لوحة إدارة M Platform بوضع قراءة فقط. اعتمد فقط على ADMIN_CONTEXT_JSON ولا تخترع أي أرقام أو سلوك للعملاء أو مشاهدات أو عمليات بحث أو إضافات للسلة أو هامش ربح. تتبع أحداث سلوك العملاء غير مفعل بعد، لذلك اذكر هذا بوضوح عندما يعتمد السؤال عليه. لا تعرض ولا تطلب أسماء العملاء أو البريد أو الهاتف أو العنوان أو أي بيانات شخصية. فرّق بوضوح بين النتائج المبنية على البيانات وبين الاقتراحات. عند اقتراح الصفحة الرئيسية راعِ طبيعة الجملة، تنويع فئات المنتجات، سجل الطلبات المتاح، المخزون وجودة الكتالوج. لا تستطيع تعديل أو نشر أو إعادة ترتيب أو تشغيل حملة مباشرة. إضافة المنتجات متاحة فقط عبر مسار مسودة منفصل داخل لوحة الإدارة وبعد مراجعة المسؤول. إذا طُلب منك تغيير المتجر فاعرض الاقتراح بدقة واطلب الاعتماد. اجعل الإجابة عملية ومختصرة.`;

  const payload={
    model,
    messages:[
      {role:'system',content:system},
      {role:'system',content:'ADMIN_CONTEXT_JSON\n'+JSON.stringify(llmContext)},
      ...history,
      {role:'user',content:message}
    ],
    max_completion_tokens:600,
    temperature:0.25,
    reasoning_effort:'none'
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
  await recordAiUsage({surface:'admin',source:'openai',user,model,usage:data?.usage});
  return {reply,mode:'readonly',usage:data?.usage||null,overview:context.overview,behaviorTrackingAvailable:false};
}
