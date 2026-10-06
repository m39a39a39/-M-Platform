import {snapshot} from './records.mjs';
import {assert,HttpError} from '../lib/supabase.mjs';
import {createHash} from 'node:crypto';
import {ensureConversation,saveCustomerMessage,saveAiMessage} from './ai-conversations.mjs';

const OPENAI_URL='https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL='gpt-6-luna';
const usageWindows=new Map();
const RATE_WINDOW_MS=10*60*1000;
const IMAGE_MAX_CHARS=700000;
const responseCache=new Map();
const RESPONSE_CACHE_TTL_MS=6*60*60*1000;

function openAiApiKey(){
  return String(process.env.OPENAI_API_KEY||'').trim();
}
async function openAiRequest({apiKey,payload,timeoutMs=26000}){
  const response=await fetch(OPENAI_URL,{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(timeoutMs)
  });
  return {response};
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
const parseJsonObject=value=>{
  const raw=String(value||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{return JSON.parse(raw);}catch{}
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1));}catch{}}
  return null;
};
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
  const positive=ranked.filter(x=>x.score>0).slice(0,6);
  const selected=positive.length?positive:ranked.slice(0,4);
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
  const requests=[...(state?.requests||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0)).slice(0,6).map(item=>({
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
  const interests=[...(state?.interests||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0)).slice(0,6).map(item=>({
    number:item.displayNo||'',
    status:clamp(item.status,80),
    trackingStatus:clamp(item.trackingStatus,80),
    quantity:item.quantity??null,
    paymentStatus:clamp(item.paymentStatus,80),
    product:titlePair(item.offerSnapshot||{}),
    total:Number.isFinite(Number(item.total))?Number(item.total):null,
    currency:clamp(item.currency,12)
  }));
  const quotes=[...(state?.quotes||[])].slice(0,8).map(item=>({
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
  return value.slice(-6).map(row=>({
    role:row?.role==='assistant'?'assistant':'user',
    content:clamp(row?.content,900)
  })).filter(row=>row.content);
}
function extractReply(data){
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string')return clean(content);
  if(Array.isArray(content))return clean(content.map(x=>typeof x==='string'?x:x?.text||'').join('\n'));
  return '';
}

const TRACKING_LABELS={
  received:['تم استلام الطلب','Received'],reviewing:['قيد المراجعة','Under review'],sourcing:['جاري التوريد','Sourcing'],
  quotes_available:['العروض متاحة','Quotes available'],quote_selected:['تم اختيار العرض','Quote selected'],
  supplier_confirmation:['بانتظار تأكيد المورد','Supplier confirmation'],payment_confirmation:['بانتظار تأكيد الدفع','Payment confirmation'],
  production:['قيد التجهيز','Preparing'],quality_check:['الفحص والجودة','Quality check'],ready_to_ship:['جاهز للشحن','Ready to ship'],
  shipped:['تم الشحن','Shipped'],in_delivery:['قيد التوصيل','Out for delivery'],delivered:['تم التسليم','Delivered'],
  completed:['مكتمل','Completed'],customer_action:['بانتظار إجراء من العميل','Customer action required'],
  on_hold:['معلق مؤقتًا','On hold'],cancelled:['ملغي','Cancelled']
};
const qHas=(message,patterns)=>patterns.some(pattern=>message.includes(pattern));
const localized=(pair,language)=>Array.isArray(pair)?pair[language==='en'?1:0]:String(pair||'');
const latestByDate=rows=>[...(rows||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0));
const visibleOrderNumber=item=>String(item?.displayNo||item?.number||'').trim();
function matchingOwnOrder(state,message){
  const rows=latestByDate([...(state?.requests||[]),...(state?.interests||[])]);
  const digits=message.match(/\b\d{4,}\b/g)||[];
  if(digits.length){
    const exact=rows.find(row=>digits.includes(visibleOrderNumber(row)));
    if(exact)return exact;
  }
  return rows[0]||null;
}
function productMatchConfidence(product,message){
  const sku=String(product?.sku||'').toLowerCase();
  if(sku&&message.includes(sku))return 100;
  const title=clean((product?.title?.ar||'')+' '+(product?.title?.en||'')).toLowerCase();
  const useful=terms(message).filter(t=>!['سعر','السعر','price','cost','متوفر','stock','available','كم','اقل','أقل','minimum','moq'].includes(t));
  return useful.reduce((score,t)=>score+(title.includes(t)?1:0),0);
}
function directProductFact(state,message,language){
  const wantsPrice=qHas(message,['سعر','السعر','price','cost','بكم','كم سعر']);
  const wantsMoq=qHas(message,['اقل كمية','أقل كمية','حد ادنى','حد أدنى','moq','minimum']);
  const wantsStock=qHas(message,['متوفر','المخزون','مخزون','stock','available','availability']);
  const wantsLead=qHas(message,['مدة التجهيز','كم يوم','lead time','تجهيز']);
  if(!wantsPrice&&!wantsMoq&&!wantsStock&&!wantsLead)return null;
  const products=productContext(state,message);
  const first=products[0],second=products[1];
  if(!first)return null;
  const confidence=productMatchConfidence(first,message),secondConfidence=second?productMatchConfidence(second,message):0;
  if(confidence<1||confidence<100&&confidence<=secondConfidence)return null;
  const title=(language==='en'?first.title?.en:first.title?.ar)||first.sku||'Product';
  const facts=[];
  if(wantsPrice&&Number.isFinite(Number(first.price)))facts.push((language==='en'?'Price: ':'السعر: ')+Number(first.price)+' '+(first.currency||'SAR'));
  if(wantsMoq&&first.moq!==undefined&&first.moq!==null&&first.moq!=='')facts.push((language==='en'?'MOQ: ':'الحد الأدنى: ')+first.moq+(language==='en'?'':' قطعة'));
  if(wantsStock&&first.stock!==undefined&&first.stock!==null&&first.stock!=='')facts.push((language==='en'?'Stock: ':'المخزون: ')+first.stock);
  if(wantsLead&&first.leadTime!==undefined&&first.leadTime!==null&&first.leadTime!=='')facts.push((language==='en'?'Lead time: ':'مدة التجهيز: ')+first.leadTime+(language==='en'?' days':' يوم'));
  if(!facts.length)return null;
  return title+' — '+facts.join(' · ');
}
function directPolicyAnswer(state,message,language){
  const pages=state?.settings?.storefront?.pages||[];
  if(!pages.length)return null;
  const needles=terms(message).filter(x=>!['هل','ماذا','كيف','what','how','the','is','are'].includes(x));
  if(!needles.length)return null;
  const ranked=pages.map(page=>{
    const title=clean(language==='en'?(page.titleEn||page.title):(page.title||page.titleEn)).toLowerCase();
    const content=clean(language==='en'?(page.contentEn||page.content):(page.content||page.contentEn)).toLowerCase();
    const score=needles.reduce((n,t)=>n+(title.includes(t)?4:content.includes(t)?1:0),0);
    return {page,score,content};
  }).sort((a,b)=>b.score-a.score);
  const top=ranked[0];
  if(!top||top.score<4||!top.content)return null;
  const body=clamp(top.content,650);
  const title=clean(language==='en'?(top.page.titleEn||top.page.title):(top.page.title||top.page.titleEn));
  return title?title+': '+body:body;
}
export function directCustomerAnswer(state,user,message,language='ar'){
  const normalized=clean(message).toLowerCase();
  if(user&&qHas(normalized,['طلبي','الطلب','وين الطلب','اين الطلب','أين الطلب','حالة الطلب','تتبع','tracking','my order','order status'])){
    const order=matchingOwnOrder(state,normalized);
    if(order){
      const number=visibleOrderNumber(order),tracking=order.trackingStatus||order.status||'';
      const status=localized(TRACKING_LABELS[tracking]||tracking,language);
      const payment=String(order.paymentStatus||'');
      const parts=[];
      if(status)parts.push((language==='en'?'Status: ':'الحالة: ')+status);
      if(payment)parts.push((language==='en'?'Payment: ':'الدفع: ')+payment);
      if(order.trackingNumber)parts.push((language==='en'?'Tracking: ':'رقم التتبع: ')+order.trackingNumber);
      if(parts.length)return (language==='en'?'Order ':'الطلب ')+(number||'')+' — '+parts.join(' · ');
    }
  }
  return directProductFact(state,normalized,language)||directPolicyAnswer(state,normalized,language);
}
function cacheKeyFor(language,message,context){
  const compact={language,message:clean(message).toLowerCase(),products:context?.products||[],shoppingSignal:context?.shoppingSignal||null};
  return createHash('sha256').update(JSON.stringify(compact)).digest('hex');
}
function getCachedReply(key){
  const row=responseCache.get(key);
  if(!row)return '';
  if(Date.now()-row.at>RESPONSE_CACHE_TTL_MS){responseCache.delete(key);return '';}
  return row.reply;
}
function setCachedReply(key,reply){
  responseCache.set(key,{reply,at:Date.now()});
  if(responseCache.size>1000){
    const cutoff=Date.now()-RESPONSE_CACHE_TTL_MS;
    for(const [cacheKey,row] of responseCache)if(row.at<cutoff)responseCache.delete(cacheKey);
    while(responseCache.size>1000)responseCache.delete(responseCache.keys().next().value);
  }
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
    reasoning_effort:'none'
  };
  let response;
  try{
    ({response}=await openAiRequest({apiKey,payload,timeoutMs:22000}));
  }catch{
    throw new HttpError(502,'تعذر تحليل الصورة الآن. / Could not analyze the image.');
  }
  if(!response.ok)throw aiProviderError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة تحليل الصورة غير صالحة. / Invalid image analysis response.');}
  const raw=extractReply(data);
  const parsed=parseJsonObject(raw);
  if(!parsed)throw new HttpError(502,'تعذر فهم نتيجة تحليل الصورة. / Could not parse image analysis.');
  return {
    query:clamp(parsed?.query,500),
    productType:clamp(parsed?.productType,180),
    visibleText:clamp(parsed?.visibleText,300),
    confidence:['high','medium','low','none'].includes(parsed?.confidence)?parsed.confidence:'low'
  };
}

function aiProviderError(status){
  if(status===429)return new HttpError(429,'تم الوصول إلى حد الاستخدام مؤقتًا. حاول بعد قليل. / AI usage limit reached. Try again shortly.');
  if(status===402)return new HttpError(503,'خدمة المساعد الذكي متوقفة مؤقتًا بسبب حد الميزانية. / AI assistant budget limit reached.');
  if(status===401||status===403)return new HttpError(503,'إعداد خدمة الذكاء الاصطناعي يحتاج مراجعة. / AI service configuration needs review.');
  return new HttpError(502,'تعذر الحصول على رد من المساعد الذكي. / AI assistant unavailable.');
}

export async function aiChat(user,body={},req=null){
  assert(!user||user.role==='client',403,'المساعد الذكي متاح للعملاء والمتصفحين فقط / AI assistant is for customers and visitors only');
  const image='';
  const message=clamp(body.message,2000);
  assert(message,400,'اكتب رسالتك / Enter a message');
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
  const model=String(process.env.OPENAI_CHAT_MODEL||DEFAULT_MODEL).replace(/^openai\//,'');
  const state=await snapshot(user||null);
  if(!proactive&&!image){
    const direct=directCustomerAnswer(state,user,message,language);
    if(direct){
      if(conversation)await saveAiMessage(conversation,direct);
      return {reply:direct,source:'database',...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
    }
  }
  const apiKey=openAiApiKey();
  if(!apiKey)throw new HttpError(503,'لم يتم تفعيل مفتاح OpenAI بعد. / OpenAI API key is not configured yet.');
  const imageSearch=image?await analyzeProductImage({image,message,language,apiKey,model,gatewayUser}):null;
  if(imageSearch?.confidence==='none'||imageSearch&&!imageSearch.query){
    const reply=language==='ar'
      ?'لم أستطع تحديد المنتج بوضوح من هذه الصورة. جرّب صورة أوضح للمنتج من الأمام أو أضف اسمه أو مواصفته.'
      :'I could not identify the product clearly from this image. Try a clearer front view or add the product name or specification.';
    if(conversation)await saveAiMessage(conversation,reply);
    return {reply,source:'openai',usage:data?.usage||null,...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
  }
  const productQuery=[imageSearch?.query,imageSearch?.productType,imageSearch?.visibleText,marketingSignal?.query,marketingSignal?.productSku,marketingSignal?.productTitle,message].filter(Boolean).join(' ');
  const personalContextNeeded=!!user&&qHas(message.toLowerCase(),['طلبي','الطلب','الدفع','فاتورة','عرض','تتبع','order','payment','invoice','quote','tracking']);
  const context={
    viewer:user?{signedIn:true}:{signedIn:false},
    products:productContext(state,productQuery),
    ...(imageSearch?{imageSearch}:{}),
    ...(marketingSignal?{shoppingSignal:marketingSignal}:{}),
    ...(personalContextNeeded?clientContext(state):{})
  };
  const history=normalizeHistory(body.history);
  const cacheable=!user&&!proactive&&!imageSearch&&history.length===0;
  const cacheKey=cacheable?cacheKeyFor(language,message,context):'';
  if(cacheKey){
    const cached=getCachedReply(cacheKey);
    if(cached){
      if(conversation)await saveAiMessage(conversation,cached);
      return {reply:cached,source:'cache',...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
    }
  }
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
    max_tokens:320,
    temperature:0.2,
    reasoning_effort:'none'
  };
  let response;
  try{
    ({response}=await openAiRequest({apiKey,payload,timeoutMs:26000}));
  }catch{
    throw new HttpError(502,'تعذر الاتصال بالمساعد الذكي. / Could not reach AI assistant.');
  }
  if(!response.ok)throw aiProviderError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة المساعد غير صالحة. / Invalid AI response.');}
  const reply=extractReply(data);
  if(!reply)throw new HttpError(502,'لم يصل رد من المساعد الذكي. / Empty AI response.');
  if(cacheKey)setCachedReply(cacheKey,reply);
  if(conversation){
    const current=await ensureConversation(user,{conversationId:conversation.id,guestKey:body.guestKey,language},false);
    if(current?.status==='human')return {conversationId:current.id,humanMode:true};
    await saveAiMessage(current||conversation,reply);
  }
  return {reply,...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
}
