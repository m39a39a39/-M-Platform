import {snapshot} from './records.mjs';
import {assert,HttpError} from '../lib/supabase.mjs';
import {createHash} from 'node:crypto';
import {ensureConversation,saveCustomerMessage,saveAiMessage} from './ai-conversations.mjs';

const GATEWAY_URL='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='openai/gpt-5.6-luna';
const usageWindows=new Map();
const RATE_WINDOW_MS=10*60*1000;
const IMAGE_MAX_CHARS=700000;

function gatewayAuthToken(){
  if(process.env.AI_GATEWAY_API_KEY)return process.env.AI_GATEWAY_API_KEY;
  try{
    const requestContext=globalThis[Symbol.for('@vercel/request-context')]?.get?.();
    const oidc=requestContext?.headers?.['x-vercel-oidc-token'];
    if(oidc)return oidc;
  }catch{}
  return process.env.VERCEL_OIDC_TOKEN||'';
}
export async function aiGatewaySmokeTest(){
  const apiKey=gatewayAuthToken();
  if(!apiKey)return {ok:false,stage:'auth'};
  try{
    const response=await fetch(GATEWAY_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:String(process.env.AI_CHAT_MODEL||DEFAULT_MODEL),
        messages:[{role:'user',content:'Reply with OK only.'}],
        max_tokens:8,
        temperature:0,
        reasoning:{effort:'none'}
      }),
      signal:AbortSignal.timeout(15000)
    });
    if(!response.ok){
      const failed=await response.json().catch(()=>null);
      const detail=String(failed?.error?.message||failed?.error||failed?.message||'').slice(0,300);
      return {ok:false,stage:'gateway',status:response.status,type:String(failed?.type||failed?.error?.type||'').slice(0,120),detail};
    }
    const data=await response.json().catch(()=>null);
    return {ok:!!extractReply(data),stage:'gateway',status:response.status};
  }catch{
    return {ok:false,stage:'network'};
  }
}
function safeImage(value){
  if(!value)return '';
  const text=String(value);
  assert(text.length<=IMAGE_MAX_CHARS,413,'الصورة كبيرة جدًا / Image is too large');
  assert(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(text),400,'صيغة الصورة غير مدعومة / Unsupported image format');
  return text;
}
function viewerKey(user,req){
  if(user?.id)return 'user:'+user.id;
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const ip=forwarded||String(req?.socket?.remoteAddress||'unknown');
  return 'guest:'+createHash('sha256').update(ip).digest('hex').slice(0,24);
}
function enforceRateLimit(user,req){
  const key=viewerKey(user,req),now=Date.now(),limit=user?40:12;
  let row=usageWindows.get(key);
  if(!row||now-row.startedAt>=RATE_WINDOW_MS)row={startedAt:now,count:0};
  row.count+=1;usageWindows.set(key,row);
  if(usageWindows.size>5000){
    for(const [k,v] of usageWindows)if(now-v.startedAt>=RATE_WINDOW_MS)usageWindows.delete(k);
  }
  if(row.count>limit)throw new HttpError(429,'تم الوصول إلى حد الاستخدام مؤقتًا. حاول بعد قليل. / Too many AI requests. Try again shortly.');
  return key;
}

const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const clamp=(value,max)=>clean(value).slice(0,max);
const titlePair=item=>{
  const t=item?.translation||{};
  return {ar:clamp(t.titleAr||t.titleEn||item?.product||item?.title||'',240),en:clamp(t.titleEn||t.titleAr||item?.product||item?.title||'',240)};
};
const descriptionPair=item=>{
  const t=item?.translation||{};
  return {ar:clamp(t.descriptionAr||t.descriptionEn||item?.specs||item?.shortDescription||'',900),en:clamp(t.descriptionEn||t.descriptionAr||item?.specs||item?.shortDescription||'',900)};
};
const terms=text=>clean(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=2).slice(0,24);
function productScore(item,needles){
  if(!needles.length)return 0;
  const title=titlePair(item),description=descriptionPair(item);
  const hay=clean([item?.sku,title.ar,title.en,description.ar,description.en,item?.country,item?.categoryId,item?.subcategoryId].filter(Boolean).join(' ')).toLowerCase();
  return needles.reduce((score,term)=>score+(hay.includes(term)?(String(item?.sku||'').toLowerCase().includes(term)?5:2):0),0);
}
function productContext(state,query){
  const rows=(state?.publicOffers||[]).filter(x=>x?.status==='published');
  const needles=terms(query);
  const ranked=rows.map(item=>({item,score:productScore(item,needles)})).sort((a,b)=>b.score-a.score||String(b.item?.createdAt||'').localeCompare(String(a.item?.createdAt||'')));
  const positive=ranked.filter(x=>x.score>0).slice(0,20);
  const selected=positive.length?positive:ranked.slice(0,16);
  return selected.map(({item})=>{
    const title=titlePair(item),description=descriptionPair(item);
    return {
      number:item.displayNo||'',
      sku:clamp(item.sku,120),
      title,
      description,
      price:Number.isFinite(Number(item.unitPrice))?Number(item.unitPrice):null,
      currency:clamp(item.currency,12),
      moq:item.moq??null,
      stock:item.stock??null,
      leadTime:item.leadTime??null,
      country:clamp(item.country,120),
      categoryId:clamp(item.categoryId,120),
      subcategoryId:clamp(item.subcategoryId,120)
    };
  });
}
function requestTitle(item){
  const title=titlePair(item);
  return title.ar||title.en||clamp(item?.product,240)||'';
}
function clientContext(state){
  const requests=[...(state?.requests||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0)).slice(0,12).map(item=>({
    number:item.displayNo||'',
    type:clamp(item.orderType||'custom',40),
    title:requestTitle(item),
    status:clamp(item.status,80),
    trackingStatus:clamp(item.trackingStatus,80),
    quantity:item.quantity??null,
    country:clamp(item.country,120),
    neededDate:clamp(item.neededDate,80),
    paymentStatus:clamp(item.paymentStatus,80),
    selectedQuoteNumber:(state?.quotes||[]).find(q=>q.id===item.selectedQuoteId)?.displayNo||''
  }));
  const interests=[...(state?.interests||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0)).slice(0,12).map(item=>({
    number:item.displayNo||'',
    status:clamp(item.status,80),
    trackingStatus:clamp(item.trackingStatus,80),
    quantity:item.quantity??null,
    paymentStatus:clamp(item.paymentStatus,80),
    product:titlePair(item.offerSnapshot||{}),
    total:Number.isFinite(Number(item.total))?Number(item.total):null,
    currency:clamp(item.currency,12)
  }));
  const quotes=[...(state?.quotes||[])].slice(0,24).map(item=>({
    number:item.displayNo||'',
    requestNumber:(state?.requests||[]).find(r=>r.id===item.requestId)?.displayNo||'',
    status:clamp(item.status,80),
    unitPrice:Number.isFinite(Number(item.unitPrice))?Number(item.unitPrice):null,
    currency:clamp(item.currency,12),
    moq:item.moq??null,
    leadTime:item.leadTime??null
  }));
  return {orders:requests,readyProductOrders:interests,quotes};
}
function normalizeHistory(value){
  if(!Array.isArray(value))return[];
  return value.slice(-10).map(row=>({
    role:row?.role==='assistant'?'assistant':'user',
    content:clamp(row?.content,1600)
  })).filter(row=>row.content);
}
function extractReply(data){
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string')return clean(content);
  if(Array.isArray(content))return clean(content.map(x=>typeof x==='string'?x:x?.text||'').join('\n'));
  return '';
}
function safeMarketingSignal(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const type=clamp(value.type,60);
  const allowed=new Set(['product_interest','repeated_product','comparing_products','search_no_results','narrow_search','cart_interest','cart_hesitation']);
  if(!allowed.has(type))return null;
  const result={type};
  for(const key of ['query','productSku','productTitle','currency'])if(value[key]!==undefined)result[key]=clamp(value[key],key==='query'?300:180);
  for(const key of ['price','moq','quantity','results','cartCount','viewedTimes','distinctProducts','cartTotal']){
    const n=Number(value[key]);if(Number.isFinite(n))result[key]=n;
  }
  return result;
}
async function analyzeProductImage({image,message,language,apiKey,model,gatewayUser}){
  const prompt=language==='ar'
    ?'حلل صورة المنتج بهدف البحث عنه داخل كتالوج متجر إلكتروني. أعد JSON فقط. حدد نوع المنتج العام، وأهم الكلمات المرئية أو المواصفات مثل الماركة والموديل والواط والمنافذ واللون إذا كانت واضحة. لا تخمن معلومات غير ظاهرة. إذا لم يظهر منتج قابل للشراء بوضوح اجعل confidence = "none" و query فارغًا.'
    :'Analyze this product image for catalog search. Return JSON only. Identify the generic product type plus clearly visible brand, model, wattage, ports, color, or other useful visible specifications. Do not guess unseen details. If no purchasable product is clearly visible, set confidence to "none" and query to an empty string.';
  const payload={
    model,
    messages:[{
      role:'user',
      content:[
        {type:'text',text:prompt+(message?('\nCustomer note: '+clamp(message,500)):'')},
        {type:'image_url',image_url:{url:image,detail:'low'}}
      ]
    }],
    response_format:{
      type:'json_schema',
      json_schema:{
        name:'product_image_search',
        strict:true,
        schema:{
          type:'object',
          properties:{
            query:{type:'string'},
            productType:{type:'string'},
            visibleText:{type:'string'},
            confidence:{type:'string',enum:['high','medium','low','none']}
          },
          required:['query','productType','visibleText','confidence'],
          additionalProperties:false
        }
      }
    },
    max_tokens:220,
    temperature:0.1,
    reasoning:{effort:'none'},
    providerOptions:{gateway:{tags:['feature:m-platform-image-search'],user:gatewayUser}}
  };
  let response;
  try{
    response=await fetch(GATEWAY_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(22000)
    });
  }catch{
    throw new HttpError(502,'تعذر تحليل الصورة الآن. / Could not analyze the image.');
  }
  if(!response.ok)throw gatewayError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة تحليل الصورة غير صالحة. / Invalid image analysis response.');}
  const raw=extractReply(data);
  let parsed;try{parsed=JSON.parse(raw);}catch{throw new HttpError(502,'تعذر فهم نتيجة تحليل الصورة. / Could not parse image analysis.');}
  return {
    query:clamp(parsed?.query,500),
    productType:clamp(parsed?.productType,180),
    visibleText:clamp(parsed?.visibleText,300),
    confidence:['high','medium','low','none'].includes(parsed?.confidence)?parsed.confidence:'low'
  };
}

function gatewayError(status){
  if(status===429)return new HttpError(429,'تم الوصول إلى حد الاستخدام مؤقتًا. حاول بعد قليل. / AI usage limit reached. Try again shortly.');
  if(status===402)return new HttpError(503,'خدمة المساعد الذكي متوقفة مؤقتًا بسبب حد الميزانية. / AI assistant budget limit reached.');
  if(status===401||status===403)return new HttpError(503,'إعداد خدمة الذكاء الاصطناعي يحتاج مراجعة. / AI service configuration needs review.');
  return new HttpError(502,'تعذر الحصول على رد من المساعد الذكي. / AI assistant unavailable.');
}

export async function aiChat(user,body={},req=null){
  assert(!user||user.role==='client',403,'المساعد الذكي متاح للعملاء والمتصفحين فقط / AI assistant is for customers and visitors only');
  const image=safeImage(body.image);
  const message=clamp(body.message,2000);
  assert(message||image,400,'اكتب رسالتك أو أضف صورة / Enter a message or add an image');
  const language=body.language==='en'?'en':'ar';
  const marketingSignal=safeMarketingSignal(body.marketingSignal);
  const proactive=!!marketingSignal;
  let conversation=null;
  if(!proactive){
    conversation=await ensureConversation(user,body,true);
    const savedText=image?(message|| (language==='ar'?'📷 بحث بصورة':'📷 Image search')):message;
    const saved=await saveCustomerMessage(conversation,savedText);
    conversation=saved.conversation;
    if(conversation.status==='human')return {conversationId:conversation.id,humanMode:true};
  }
  const gatewayUser=enforceRateLimit(user,req);
  const apiKey=gatewayAuthToken();
  if(!apiKey)throw new HttpError(503,'لم يتم تفعيل خدمة الذكاء الاصطناعي بعد. / AI service is not configured yet.');
  const model=String(process.env.AI_CHAT_MODEL||DEFAULT_MODEL);
  const imageSearch=image?await analyzeProductImage({image,message,language,apiKey,model,gatewayUser}):null;
  if(imageSearch?.confidence==='none'||imageSearch&&!imageSearch.query){
    const reply=language==='ar'
      ?'لم أستطع تحديد المنتج بوضوح من هذه الصورة. جرّب صورة أوضح للمنتج من الأمام أو أضف اسمه أو مواصفته.'
      :'I could not identify the product clearly from this image. Try a clearer front view or add the product name or specification.';
    if(conversation)await saveAiMessage(conversation,reply);
    return {reply,...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
  }
  const state=await snapshot(user||null);
  const productQuery=[imageSearch?.query,imageSearch?.productType,imageSearch?.visibleText,marketingSignal?.query,marketingSignal?.productSku,marketingSignal?.productTitle,message].filter(Boolean).join(' ');
  const context={
    viewer:user?{signedIn:true}:{signedIn:false},
    products:productContext(state,productQuery),
    ...(imageSearch?{imageSearch}:{}),
    ...(marketingSignal?{shoppingSignal:marketingSignal}:{}),
    ...(user?clientContext(state):{})
  };
  const history=normalizeHistory(body.history);
  const system=language==='ar'
    ?`أنت مستشار مبيعات وتوريد محترف داخل M Platform. هدفك فهم ما يحتاجه العميل ومساعدته على اتخاذ قرار شراء مناسب، بدون ضغط أو مبالغة.
اعتمد على PLATFORM_CONTEXT_JSON في معلومات المنتجات والأسعار والمخزون والطلبات والعروض. لا تخترع أي سعر أو خصم أو مخزون أو حالة أو ميزة غير موجودة.
افهم احتياج العميل من كلامه وسلوكه الشرائي غير الحساس فقط، مثل البحث، المنتجات التي يقارنها، أو السلة. لا تستنتج أو تستخدم صفات حساسة شخصية.
إذا كان الاحتياج غير واضح، اسأل سؤالًا واحدًا أو سؤالين مفيدين مثل: الاستخدام، الكمية، الميزانية، السوق المستهدف، أو المواصفة الأهم.
عند وجود منتجات مناسبة، اقترح من 1 إلى 3 خيارات فقط واشرح باختصار لماذا يناسب كل خيار. اذكر SKU والسعر والحد الأدنى عندما تكون موجودة.
إذا كان PLATFORM_CONTEXT_JSON يحتوي imageSearch، فالصورة تم تحليلها مرة واحدة مسبقًا. استخدم وصف imageSearch والمنتجات المطابقة في السياق لتحديد أقرب الخيارات، وقل بوضوح "أقرب تطابق" عندما لا يكون التطابق مؤكدًا.
إذا لم يوجد منتج مطابق، اقترح إرسال طلب خاص بدل اختراع منتج.
لا تستخدم ندرة أو استعجالًا أو خصمًا غير حقيقي، ولا تقل إن منتجًا هو الأفضل إلا إذا شرحت معيار المقارنة من البيانات المتاحة.
ممنوع كشف هوية المورد أو اسمه أو رقم هاتفه أو بريده أو أي وسيلة تواصل مباشرة، وممنوع طلب التواصل خارج M Platform.
لا تعرض المعرفات الداخلية لقاعدة البيانات. استخدم فقط رقم الطلب/العرض الظاهر إن وجد.
لا تدّع أنك عدلت طلبًا أو دفعت أو وافقت على عرض. أنت تشرح وتقترح فقط.
إذا كان PLATFORM_CONTEXT_JSON يحتوي shoppingSignal، فأنت تكتب رسالة استباقية قصيرة جدًا: جملة أو جملتان، طبيعية وغير مزعجة، لا تذكر أنك تراقب العميل، وتقدّم مساعدة مرتبطة مباشرة بما يبدو أنه يبحث عنه. لا تبدأ بتحية طويلة.`
    :`You are a professional sales and sourcing advisor inside M Platform. Your goal is to understand what the customer needs and help them make a suitable purchase decision without pressure or exaggeration.
Use PLATFORM_CONTEXT_JSON for product, price, stock, order, and quote facts. Never invent a price, discount, stock level, status, feature, or promotion.
Understand needs only from the customer's words and non-sensitive shopping behavior such as searches, compared products, or cart activity. Never infer or use sensitive personal traits.
If the need is unclear, ask one or two useful questions about use case, quantity, budget, target market, or the most important specification.
When suitable products exist, recommend only 1 to 3 options and briefly explain why each fits. Include SKU, price, and MOQ when available.
If PLATFORM_CONTEXT_JSON contains imageSearch, the image was analyzed once before this response. Use the imageSearch description and matched catalog products to identify the closest options, and explicitly say "closest match" when the match is uncertain.
If there is no exact match, suggest a custom sourcing request rather than inventing a product.
Do not use fake scarcity, false urgency, or nonexistent discounts. Do not call something the best unless you explain the comparison criterion from available data.
Never reveal supplier identity, name, phone, email, or direct contact details, and never encourage off-platform contact.
Never expose internal database IDs; use only visible order/offer numbers when present.
Do not claim you changed an order, made a payment, or accepted an offer. You only explain and recommend.
If PLATFORM_CONTEXT_JSON contains shoppingSignal, write a very short proactive message: one or two natural, non-intrusive sentences. Never say you are monitoring the customer. Offer help directly related to what they appear to be looking for, with no long greeting.`;
  const payload={
    model,
    messages:[
      {role:'system',content:system},
      {role:'system',content:'PLATFORM_CONTEXT_JSON\n'+JSON.stringify(context)},
      ...history,
      {role:'user',content:message}
    ],
    max_tokens:700,
    temperature:0.2,
    reasoning:{effort:'none'},
    providerOptions:{gateway:{tags:['feature:m-platform-ai-chat'],user:gatewayUser}}
  };
  let response;
  try{
    response=await fetch(GATEWAY_URL,{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(26000)
    });
  }catch{
    throw new HttpError(502,'تعذر الاتصال بالمساعد الذكي. / Could not reach AI assistant.');
  }
  if(!response.ok)throw gatewayError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة المساعد غير صالحة. / Invalid AI response.');}
  const reply=extractReply(data);
  if(!reply)throw new HttpError(502,'لم يصل رد من المساعد الذكي. / Empty AI response.');
  if(conversation){
    const current=await ensureConversation(user,{conversationId:conversation.id,guestKey:body.guestKey,language},false);
    if(current?.status==='human')return {conversationId:current.id,humanMode:true};
    await saveAiMessage(current||conversation,reply);
  }
  return {reply,...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
}
