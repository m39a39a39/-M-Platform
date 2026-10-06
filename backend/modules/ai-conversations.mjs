import {db,assert} from '../lib/supabase.mjs';

const clean=(value,max=4000)=>String(value??'').trim().slice(0,max);
const validGuestKey=value=>/^[A-Za-z0-9_-]{20,120}$/.test(String(value||''));
const now=()=>new Date().toISOString();

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
async function insertMessage(conversationId,sender,content){
  const text=clean(content,4000);assert(text,400,'الرسالة فارغة / Empty message');
  const rows=await db('ai_messages','',{method:'POST',body:{conversation_id:conversationId,sender,content:text},headers:{Prefer:'return=representation'}});
  return rows?.[0]||null;
}
export async function saveCustomerMessage(row,content){
  const message=await insertMessage(row.id,'customer',content);
  const updated=await updateConversation(row,{last_message_at:now(),unread_admin:Number(row.unread_admin||0)+1});
  return {message,conversation:updated};
}
export async function saveAiMessage(row,content){
  const message=await insertMessage(row.id,'ai',content);
  const updated=await updateConversation(row,{last_message_at:now()});
  return {message,conversation:updated};
}
export async function requestHumanHandoff(row){
  assert(row?.id,400,'المحادثة غير صالحة / Invalid conversation');
  return updateConversation(row,{status:'human',last_message_at:now()});
}
export async function listConversationMessages(conversationId,limit=200){
  return db('ai_messages',`conversation_id=eq.${encodeURIComponent(conversationId)}&order=id.asc&limit=${Math.max(1,Math.min(300,Number(limit)||200))}`);
}
export async function customerConversation(user,params={}){
  const row=await ensureConversation(user,params,false);
  if(!row)return {conversation:null,messages:[]};
  const guestKey=clean(params.guestKey,120);
  assert(ownsConversation(user,row,guestKey),403,'غير مصرح / Unauthorized');
  const messages=await listConversationMessages(row.id);
  const updated=Number(row.unread_customer||0)>0?await updateConversation(row,{unread_customer:0}):row;
  return {conversation:publicConversation(updated),messages:messages.map(publicMessage)};
}
function publicConversation(row){
  return {id:row.id,status:row.status,language:row.language,lastMessageAt:row.last_message_at,unreadCustomer:Number(row.unread_customer||0),createdAt:row.created_at};
}
function publicMessage(row){
  return {id:row.id,sender:row.sender,content:row.content,createdAt:row.created_at};
}
export async function adminConversationList(user){
  assert(user?.role==='admin',403,'غير مصرح / Unauthorized');
  const rows=await db('ai_conversations','order=last_message_at.desc&limit=150');
  return {conversations:rows.map(row=>({
    id:row.id,customerId:row.customer_id||'',visitor:!row.customer_id,status:row.status,language:row.language,
    unreadAdmin:Number(row.unread_admin||0),unreadCustomer:Number(row.unread_customer||0),
    lastMessageAt:row.last_message_at,createdAt:row.created_at
  }))};
}
export async function adminConversationRead(user,id){
  assert(user?.role==='admin',403,'غير مصرح / Unauthorized');
  const row=await getConversation(clean(id,80));assert(row,404,'المحادثة غير موجودة / Conversation not found');
  const messages=await listConversationMessages(row.id);
  const updated=Number(row.unread_admin||0)>0?await updateConversation(row,{unread_admin:0}):row;
  return {conversation:{id:updated.id,customerId:updated.customer_id||'',visitor:!updated.customer_id,status:updated.status,language:updated.language,unreadAdmin:Number(updated.unread_admin||0),lastMessageAt:updated.last_message_at,createdAt:updated.created_at},messages:messages.map(publicMessage)};
}
export async function adminConversationAction(user,body={}){
  assert(user?.role==='admin',403,'غير مصرح / Unauthorized');
  const row=await getConversation(clean(body.conversationId,80));assert(row,404,'المحادثة غير موجودة / Conversation not found');
  const action=clean(body.action,30);
  if(action==='takeover'){
    const updated=await updateConversation(row,{status:'human',unread_admin:0});
    return {conversation:publicConversation(updated)};
  }
  if(action==='ai'){
    const updated=await updateConversation(row,{status:'ai',unread_admin:0});
    return {conversation:publicConversation(updated)};
  }
  if(action==='close'){
    const updated=await updateConversation(row,{status:'closed',unread_admin:0});
    return {conversation:publicConversation(updated)};
  }
  if(action==='reply'){
    const text=clean(body.message,4000);assert(text,400,'اكتب الرد أولًا / Enter a reply');
    const current=row.status==='human'?row:await updateConversation(row,{status:'human'});
    const message=await insertMessage(current.id,'admin',text);
    const updated=await updateConversation(current,{last_message_at:now(),unread_admin:0,unread_customer:Number(current.unread_customer||0)+1});
    return {conversation:publicConversation(updated),message:publicMessage(message)};
  }
  throw Object.assign(new Error('إجراء غير صالح / Invalid action'),{status:400});
}
