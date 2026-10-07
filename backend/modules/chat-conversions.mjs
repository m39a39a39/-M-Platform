import {db,assert} from '../lib/supabase.mjs';

const ALLOWED_EVENTS=new Set(['product_click','add_to_cart','checkout_started']);
const MAX_AGE_DAYS=30;
let signalCache={at:0,value:{}};

const clean=(value,max=300)=>String(value??'').trim().slice(0,max);
const validGuestKey=value=>/^[A-Za-z0-9_-]{20,120}$/.test(String(value||''));
const validConversationId=value=>/^[a-f0-9-]{36}$/i.test(String(value||''));
const nowIso=()=>new Date().toISOString();

async function conversationById(id){
  if(!validConversationId(id))return null;
  const rows=await db('ai_conversations',`id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows?.[0]||null;
}
function canAttribute(user,row,guestKey=''){
  if(!row)return false;
  if(user?.role==='client'&&row.customer_id===user.id)return true;
  return !row.customer_id&&validGuestKey(guestKey)&&row.guest_key===guestKey;
}
function safeMetadata(value={}){
  const result={};
  for(const key of ['source','currency'])if(value?.[key]!==undefined)result[key]=clean(value[key],80);
  for(const key of ['quantity','cartCount','cartTotal','price']){
    const n=Number(value?.[key]);if(Number.isFinite(n))result[key]=n;
  }
  return result;
}
function eventRow({conversationId,customerId=null,eventName,productId='',orderId='',metadata={}}){
  return {
    conversation_id:conversationId,
    customer_id:customerId||null,
    event_name:eventName,
    product_id:clean(productId,90)||null,
    order_id:clean(orderId,90)||null,
    metadata:safeMetadata(metadata)
  };
}
async function insertEvents(events=[]){
  const rows=events.filter(Boolean).map(eventRow);if(!rows.length)return;
  await db('chat_conversion_events','',{method:'POST',body:rows,headers:{Prefer:'return=minimal'}});
  signalCache.at=0;
}
async function insertEvent(event){return insertEvents([event]);}
export async function resolveChatAttribution(user,body={}){
  const conversation=await conversationById(clean(body?.conversationId,80));
  if(!canAttribute(user,conversation,clean(body?.guestKey,120)))return null;
  return {conversationId:conversation.id,customerId:user?.role==='client'?user.id:null};
}
export async function recordChatConversion(user,body={}){
  const eventName=clean(body.eventName,40);
  assert(ALLOWED_EVENTS.has(eventName),400,'حدث تتبع غير صالح / Invalid tracking event');
  const attribution=await resolveChatAttribution(user,body);
  assert(attribution,403,'تعذر ربط الحدث بالمحادثة / Could not attribute event to conversation');
  const conversation={id:attribution.conversationId};
  const productId=clean(body.productId,90);
  if(['product_click','add_to_cart'].includes(eventName))assert(productId,400,'المنتج مطلوب / Product is required');
  await insertEvent({
    conversationId:conversation.id,
    customerId:user?.role==='client'?user.id:null,
    eventName,
    productId,
    metadata:body.metadata
  });
  return {ok:true};
}
export async function recordRecommendationImpressions({conversation,user,products=[]}={}){
  if(!conversation?.id||!Array.isArray(products)||!products.length)return;
  const customerId=user?.role==='client'?user.id:null;
  await insertEvents(products.slice(0,6).map(product=>{
    const productId=clean(product?.id,90);if(!productId)return null;
    return {conversationId:conversation.id,customerId,eventName:'recommendation_impression',productId,metadata:{source:'chat'}};
  }));
}
export async function recordOrderConversion(user,{orderId,items=[],chatAttribution={}}={}){
  if(user?.role!=='client'||!orderId)return null;
  const attribution=await resolveChatAttribution(user,chatAttribution);
  if(!attribution)return null;
  const conversation={id:attribution.conversationId};
  const productIds=[...new Set((items||[]).map(x=>clean(x?.offerId,90)).filter(Boolean))];
  await insertEvents(productIds.length
    ?productIds.map(productId=>({conversationId:conversation.id,customerId:user.id,eventName:'order_created',orderId,productId,metadata:{source:'chat',cartCount:productIds.length}}))
    :[{conversationId:conversation.id,customerId:user.id,eventName:'order_created',orderId,metadata:{source:'chat',cartCount:0}}]);
  return conversation.id;
}
async function recentRows(){
  const since=new Date(Date.now()-MAX_AGE_DAYS*86400000).toISOString();
  const rows=[];
  for(let offset=0;offset<50000;offset+=1000){
    const batch=await db('chat_conversion_events',`created_at=gte.${encodeURIComponent(since)}&select=conversation_id,event_name,product_id,order_id,created_at&order=created_at.desc&limit=1000&offset=${offset}`);
    rows.push(...batch);
    if(batch.length<1000)break;
  }
  return rows;
}
function aggregateProductSignals(rows){
  const map={};
  for(const row of rows){
    const id=clean(row.product_id,90);if(!id)continue;
    const target=map[id]||(map[id]={impressions:0,clicks:0,carts:0,orders:0});
    if(row.event_name==='recommendation_impression')target.impressions++;
    else if(row.event_name==='product_click')target.clicks++;
    else if(row.event_name==='add_to_cart')target.carts++;
    else if(row.event_name==='order_created')target.orders++;
  }
  for(const target of Object.values(map)){
    const impressions=Math.max(1,target.impressions),clicks=Math.max(1,target.clicks);
    target.score=Math.min(8,
      (target.impressions>=3?Math.min(3,target.clicks/impressions*6):0)+
      Math.min(2.5,target.carts/clicks*3)+
      Math.min(2.5,target.orders/clicks*5)
    );
  }
  return map;
}
export async function chatProductSignals(){
  if(Date.now()-signalCache.at<5*60*1000)return signalCache.value;
  try{
    const rows=await recentRows();
    signalCache={at:Date.now(),value:aggregateProductSignals(rows)};
  }catch(error){
    console.warn('chat_product_signals_failed',error?.message||'unknown');
    signalCache={at:Date.now(),value:{}};
  }
  return signalCache.value;
}
export async function chatConversionSummary(){
  const rows=await recentRows();
  const counts={recommendation_impression:0,product_click:0,add_to_cart:0,checkout_started:0,order_created:0};
  const conversations=new Set(),orderIds=new Set(),products={};
  for(const row of rows){
    if(counts[row.event_name]!==undefined)counts[row.event_name]++;
    if(row.conversation_id)conversations.add(row.conversation_id);
    if(row.order_id)orderIds.add(row.order_id);
    const productId=clean(row.product_id,90);
    if(productId){
      const p=products[productId]||(products[productId]={productId,impressions:0,clicks:0,carts:0,orders:0});
      if(row.event_name==='recommendation_impression')p.impressions++;
      if(row.event_name==='product_click')p.clicks++;
      if(row.event_name==='add_to_cart')p.carts++;
      if(row.event_name==='order_created')p.orders++;
    }
  }
  const topProducts=Object.values(products).sort((a,b)=>b.orders-a.orders||b.carts-a.carts||b.clicks-a.clicks).slice(0,10);
  const conversionRate=conversations.size?Number((orderIds.size/conversations.size*100).toFixed(1)):0;
  return {
    periodDays:MAX_AGE_DAYS,
    conversations:conversations.size,
    recommendations:counts.recommendation_impression,
    productClicks:counts.product_click,
    addToCart:counts.add_to_cart,
    checkoutStarted:counts.checkout_started,
    orders:orderIds.size,
    conversionRate,
    topProducts,
    generatedAt:nowIso()
  };
}
