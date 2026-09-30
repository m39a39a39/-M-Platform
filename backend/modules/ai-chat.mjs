import {snapshot} from './records.mjs';
import {assert,HttpError} from '../lib/supabase.mjs';
import {createHash} from 'node:crypto';

const GATEWAY_URL='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='openai/gpt-5.6-luna';
const usageWindows=new Map();
const RATE_WINDOW_MS=10*60*1000;
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
function gatewayError(status){
  if(status===429)return new HttpError(429,'تم الوصول إلى حد الاستخدام مؤقتًا. حاول بعد قليل. / AI usage limit reached. Try again shortly.');
  if(status===402)return new HttpError(503,'خدمة المساعد الذكي متوقفة مؤقتًا بسبب حد الميزانية. / AI assistant budget limit reached.');
  if(status===401||status===403)return new HttpError(503,'إعداد خدمة الذكاء الاصطناعي يحتاج مراجعة. / AI service configuration needs review.');
  return new HttpError(502,'تعذر الحصول على رد من المساعد الذكي. / AI assistant unavailable.');
}

export async function aiChat(user,body={},req=null){
  assert(!user||user.role==='client',403,'المساعد الذكي متاح للعملاء والمتصفحين فقط / AI assistant is for customers and visitors only');
  const message=clamp(body.message,2000);
  assert(message,400,'اكتب رسالتك أولًا / Enter a message first');
  const gatewayUser=enforceRateLimit(user,req);
  const language=body.language==='en'?'en':'ar';
  const state=await snapshot(user||null);
  const context={
    viewer:user?{signedIn:true}:{signedIn:false},
    products:productContext(state,message),
    ...(user?clientContext(state):{})
  };
  const history=normalizeHistory(body.history);
  const apiKey=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
  if(!apiKey)throw new HttpError(503,'لم يتم تفعيل خدمة الذكاء الاصطناعي بعد. / AI service is not configured yet.');
  const model=String(process.env.AI_CHAT_MODEL||DEFAULT_MODEL);
  const system=language==='ar'
    ?`أنت مساعد M Platform للتوريد والتجارة. أجب بالعربية الواضحة باختصار مفيد.
اعتمد على PLATFORM_CONTEXT_JSON في معلومات المنتجات والأسعار والمخزون والطلبات والعروض. لا تخترع أي سعر أو حالة أو مخزون غير موجود.
إذا لم تتوفر المعلومة، قل ذلك بوضوح واقترح على العميل إرسال طلب خاص أو التواصل مع الإدارة من داخل المنصة.
ممنوع كشف هوية المورد أو اسمه أو رقم هاتفه أو بريده أو أي وسيلة تواصل مباشرة، وممنوع طلب التواصل خارج M Platform.
لا تعرض المعرفات الداخلية لقاعدة البيانات. استخدم فقط رقم الطلب/العرض الظاهر إن وجد.
لا تدّع أنك عدلت طلبًا أو دفعت أو وافقت على عرض. أنت تشرح وتساعد فقط.
عند اقتراح منتجات، اذكر SKU والسعر والحد الأدنى عندما تكون هذه البيانات موجودة.`
    :`You are the M Platform sourcing assistant. Answer in clear, concise English.
Use PLATFORM_CONTEXT_JSON for product, price, stock, order, and quote facts. Never invent unavailable values.
If information is missing, say so and suggest submitting a custom request or contacting platform administration inside M Platform.
Never reveal supplier identity, name, phone, email, or direct contact details, and never encourage off-platform contact.
Never expose internal database IDs; use only visible order/offer numbers when present.
Do not claim you changed an order, made a payment, or accepted an offer. You only explain and assist.
When recommending products, include SKU, price, and MOQ when available.`;
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
  return {reply};
}
