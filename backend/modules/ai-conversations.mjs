import {can} from './auth.mjs';
import {enforceChatLimit} from './chat-rate-limit.mjs';
import {db,assert} from '../lib/supabase.mjs';

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const validGuestKey=value=>/^[A-Za-z0-9_-]{20,120}$/.test(String(value||''));
const now=()=>new Date().toISOString();
const compactList=(value,max=4)=>Array.isArray(value)?value.slice(0,max):[];

function safeMessageMetadata(value={}){
  const products=compactList(value?.products,6).map(item=>({
    id:clean(item?.id,90),
    sku:clean(item?.sku,100),
    title:clean(item?.title,180),
    price:Number.isFinite(Number(item?.price))?Number(item.price):null,
    basePrice:Number.isFinite(Number(item?.basePrice))?Number(item.basePrice):null,
    priceQuantity:Number.isInteger(Number(item?.priceQuantity))&&Number(item.priceQuantity)>0?Number(item.priceQuantity):null,
    currency:clean(item?.currency,12),
    moq:item?.moq??null,
    image:clean(item?.image,1200),
    href:clean(item?.href,400)
  })).filter(item=>item.id&&item.title);
  const quickReplies=compactList(value?.quickReplies,4).map(x=>clean(x,80)).filter(Boolean);
  return {
    ...(products.length?{products}:{}),
    ...(quickReplies.length?{quickReplies}:{}),
    ...(value?.handoff==='waiting'?{handoff:'waiting'}:{}),
    ...(value?.leadPrompt===true?{leadPrompt:true}:{})
  };
}

async function getConversation(id){
  if(!id)return null;
  const rows=await db('ai_conversations',`id=eq.${encodeURIComponent(id)}&limit=1`);
  return rows[0]||null;
}
function ownsConversation(user,row,guestKey=''){
  if(!row)return false;
  if(user?.role==='client')return row.customer_id===user.id;
  return !row.customer_id&&validGuestKey(guestKey)&&row.guest_key===guestKey;
}
async function latestConversation(user,guestKey=''){
  const query=user?.role==='client'
    ?`customer_id=eq.${encodeURIComponent(user.id)}&status=neq.closed&order=last_message_at.desc&limit=1`
    :`guest_key=eq.${encodeURIComponent(guestKey)}&customer_id=is.null&status=neq.closed&order=last_message_at.desc&limit=1`;
  const rows=await db('ai_conversations',query);
  return rows[0]||null;
}
async function createConversation(user,guestKey,language='ar'){
  if(!user)assert(validGuestKey(guestKey),400,'جلسة المحادثة غير صالحة / Invalid chat session');
  const body={
    customer_id:user?.role==='client'?user.id:null,
    guest_key:user?.role==='client'?null:guestKey,
    language:language==='en'?'en':'ar',
    status:'ai',
    unread_admin:0,
    unread_customer:0,
    last_message_at:now(),
    updated_at:now()
  };
  const rows=await db('ai_conversations','',{method:'POST',body,headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function ensureConversation(user,body={},create=true){
  assert(!user||user.role==='client',403,'غير مصرح / Unauthorized');
  const guestKey=clean(body.guestKey,120),language=body.language==='en'?'en':'ar';
  if(!user&&!validGuestKey(guestKey)){if(create)assert(false,400,'جلسة المحادثة غير صالحة / Invalid chat session');return null;}
  let row=body.conversationId?await getConversation(clean(body.conversationId,80)):null;
  if(row&&!ownsConversation(user,row,guestKey))row=null;
  if(row?.status==='closed'&&create)row=null;
  if(!row)row=await latestConversation(user,guestKey);
  if(!row&&create)row=await createConversation(user,guestKey,language);
  return row;
}
async function updateConversation(row,patch){
  const body={...patch,updated_at:now()};
  const rows=await db('ai_conversations',`id=eq.${encodeURIComponent(row.id)}`,{method:'PATCH',body,headers:{Prefer:'return=representation'}});
  return rows?.[0]||{...row,...body};
}
async function insertMessage(conversationId,sender,content,metadata={}){
  const text=clean(content,4000);assert(text,400,'الرسالة فارغة / Empty message');
  const rows=await db('ai_messages','',{method:'POST',body:{conversation_id:conversationId,sender,content:text,metadata:safeMessageMetadata(metadata)},headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function saveCustomerMessage(row,content){
  const message=await insertMessage(row.id,'customer',content);
  const updated=await updateConversation(row,{last_message_at:now(),unread_admin:Number(row.unread_admin||0)+1});
  return {message,conversation:updated};
}
export async function saveAiMessage(row,content,metadata={}){
  const message=await insertMessage(row.id,'ai',content,metadata);
  const updated=await updateConversation(row,{last_message_at:now()});
  return {message,conversation:updated};
}
export async function requestHumanHandoff(row){
  assert(row?.id,400,'المحادثة غير صالحة / Invalid conversation');
  let productSku=row.lead_product_sku||'',quantity=row.lead_quantity||'',country=row.lead_country||'';
  try{
    const recent=await db('ai_messages',`conversation_id=eq.${encodeURIComponent(row.id)}&order=id.desc&limit=16`);
    for(const message of recent){
      if(!productSku&&message?.metadata?.products?.[0]?.sku)productSku=clean(message.metadata.products[0].sku,100);
      if(message?.sender==='customer'){
        const text=clean(message.content,500);
        if(!quantity){
          const match=text.match(/(?:كمية|عدد|احتاج|أحتاج|اريد|أريد|qty|quantity)\s*[:：-]?\s*(\d{1,7})/i);
          if(match)quantity=match[1];
        }
        if(!country){
          if(/السعودية|saudi|ksa/i.test(text))country='Saudi Arabia';
          else if(/الإمارات|الامارات|uae|dubai/i.test(text))country='United Arab Emirates';
        }
      }
    }
  }catch{}
  return updateConversation(row,{
    status:'ai',
    handoff_requested_at:row.handoff_requested_at||now(),
    lead_product_sku:productSku||null,
    lead_quantity:quantity||null,
    lead_country:country||null,
    lead_followup_needed:row.customer_id?false:true,
    last_message_at:now()
  });
}
export async function captureGuestLead(user,body={},req=null){
  await enforceChatLimit(user,req,'lead');
  const row=await ensureConversation(user,body,false);
  assert(row,404,'المحادثة غير موجودة / Conversation not found');
  const guestKey=clean(body.guestKey,120);
  assert(ownsConversation(user,row,guestKey),403,'غير مصرح / Unauthorized');
  assert(!row.customer_id,400,'بيانات التواصل الإضافية مطلوبة للزائر فقط / Extra contact details are only needed for visitors');
  const contact=clean(body.contact,160),name=clean(body.name,120),country=clean(body.country,100);
  assert(contact.length>=5,400,'أدخل رقم واتساب أو وسيلة تواصل صحيحة / Enter a valid WhatsApp number or contact method');
  const updated=await updateConversation(row,{
    lead_name:name||row.lead_name||null,
    lead_contact:contact,
    lead_country:country||row.lead_country||null,
    lead_product_sku:clean(body.productSku,100)||row.lead_product_sku||null,
    lead_quantity:clean(body.quantity,80)||row.lead_quantity||null,
    lead_followup_needed:true,
    last_message_at:now(),
    unread_admin:Number(row.unread_admin||0)+1
  });
  const reply=updated.language==='en'
    ?'Thanks. Your contact details were saved for the customer service team.'
    :'شكرًا، تم حفظ وسيلة التواصل لفريق خدمة العملاء.';
  await insertMessage(updated.id,'ai',reply);
  return {conversation:publicConversation(updated),leadCaptured:true,reply};
}
export async function listConversationMessages(conversationId,limit=200){
  return db('ai_messages',`conversation_id=eq.${encodeURIComponent(conversationId)}&order=id.asc&limit=${Math.max(1,Math.min(300,Number(limit)||200))}`);
}
export async function customerConversation(user,params={},req=null){
  await enforceChatLimit(user,req,'read');
  const row=await ensureConversation(user,params,false);
  if(!row)return {conversation:null,messages:[]};
  const guestKey=clean(params.guestKey,120);
  assert(ownsConversation(user,row,guestKey),403,'غير مصرح / Unauthorized');
  const messages=await listConversationMessages(row.id);
  const updated=Number(row.unread_customer||0)>0?await updateConversation(row,{unread_customer:0}):row;
  return {conversation:publicConversation(updated),messages:messages.map(publicMessage)};
}
function publicConversation(row){
  return {
    id:row.id,status:row.status,language:row.language,lastMessageAt:row.last_message_at,
    unreadCustomer:Number(row.unread_customer||0),createdAt:row.created_at,
    waitingHuman:row.status==='ai'&&!!row.handoff_requested_at,
    waitingSince:row.handoff_requested_at||'',
    leadCaptured:!!row.lead_contact
  };
}
function publicMessage(row){
  return {id:row.id,sender:row.sender,content:row.content,metadata:safeMessageMetadata(row.metadata||{}),createdAt:row.created_at};
}
function adminConversation(row){
  return {
    id:row.id,customerId:row.customer_id||'',visitor:!row.customer_id,status:row.status,language:row.language,
    unreadAdmin:Number(row.unread_admin||0),unreadCustomer:Number(row.unread_customer||0),
    lastMessageAt:row.last_message_at,createdAt:row.created_at,
    waitingHuman:row.status==='ai'&&!!row.handoff_requested_at,
    handoffRequestedAt:row.handoff_requested_at||'',
    claimedAt:row.claimed_at||'',claimedBy:row.claimed_by||'',
    leadFollowupNeeded:!!row.lead_followup_needed,
    leadName:clean(row.lead_name,120),leadContact:clean(row.lead_contact,160),
    leadCountry:clean(row.lead_country,100),leadProductSku:clean(row.lead_product_sku,100),leadQuantity:clean(row.lead_quantity,80)
  };
}
export async function adminConversationList(user){
  assert(can(user,'conversations.read')||can(user,'conversations.manage'),403,'غير مصرح / Unauthorized');
  const rows=await db('ai_conversations','order=last_message_at.desc&limit=150');
  return {conversations:rows.map(adminConversation)};
}
export async function adminConversationRead(user,id){
  assert(can(user,'conversations.read')||can(user,'conversations.manage'),403,'غير مصرح / Unauthorized');
  const row=await getConversation(clean(id,80));assert(row,404,'المحادثة غير موجودة / Conversation not found');
  const messages=await listConversationMessages(row.id);
  const updated=can(user,'conversations.manage')&&Number(row.unread_admin||0)>0?await updateConversation(row,{unread_admin:0}):row;
  return {conversation:adminConversation(updated),messages:messages.map(publicMessage)};
}
export async function adminConversationAction(user,body={}){
  assert(can(user,'conversations.manage'),403,'غير مصرح / Unauthorized');
  const row=await getConversation(clean(body.conversationId,80));assert(row,404,'المحادثة غير موجودة / Conversation not found');
  const action=clean(body.action,30);
  if(action==='takeover'){
    const updated=await updateConversation(row,{status:'human',claimed_by:user.id,claimed_at:now(),unread_admin:0});
    return {conversation:adminConversation(updated)};
  }
  if(action==='ai'){
    const updated=await updateConversation(row,{status:'ai',handoff_requested_at:null,claimed_by:null,claimed_at:null,unread_admin:0});
    return {conversation:adminConversation(updated)};
  }
  if(action==='close'){
    const updated=await updateConversation(row,{status:'closed',lead_followup_needed:false,unread_admin:0});
    return {conversation:adminConversation(updated)};
  }
  if(action==='reply'){
    const text=clean(body.message,4000);assert(text,400,'اكتب الرد أولًا / Enter a reply');
    const current=row.status==='human'?row:await updateConversation(row,{status:'human',claimed_by:user.id,claimed_at:now()});
    const message=await insertMessage(current.id,'admin',text);
    const updated=await updateConversation(current,{last_message_at:now(),lead_followup_needed:false,unread_admin:0,unread_customer:Number(current.unread_customer||0)+1});
    return {conversation:adminConversation(updated),message:publicMessage(message)};
  }
  throw Object.assign(new Error('إجراء غير صالح / Invalid action'),{status:400});
}
