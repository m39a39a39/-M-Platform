import {db,assert} from '../lib/supabase.mjs';

const COPY={
  invited:{titleAr:'طلب جديد',titleEn:'New request',bodyAr:'تمت دعوتك لتقديم عرض سعر على طلب جديد.',bodyEn:'You were invited to submit a quote for a new request.'},
  quote_published:{titleAr:'عرض جديد',titleEn:'New offer',bodyAr:'وصل عرض جديد لطلبك.',bodyEn:'A new offer is available for your request.'}
};
const inIds=ids=>ids.map(id=>`"${String(id).replaceAll('"','')}"`).join(',');

export function notificationPayload(row,quoteRequestId){
  const copy=COPY[row.event]||{titleAr:'إشعار جديد',titleEn:'New notification',bodyAr:'لديك تحديث جديد في المنصة.',bodyEn:'You have a new update on the platform.'};
  let target={screen:'notifications',entityId:row.entity_id},deepLink='mplatform://notifications';
  if(row.event==='invited'){
    target={screen:'supplierRequest',requestId:row.entity_id};
    deepLink=`mplatform://supplier/requests/${encodeURIComponent(row.entity_id)}`;
  }else if(row.event==='quote_published'&&quoteRequestId){
    target={screen:'customerRequest',requestId:quoteRequestId,quoteId:row.entity_id};
    deepLink=`mplatform://customer/requests/${encodeURIComponent(quoteRequestId)}?quote=${encodeURIComponent(row.entity_id)}`;
  }
  return {id:row.id,event:row.event,entityId:row.entity_id,readAt:row.read_at,createdAt:row.created_at,...copy,target,deepLink};
}

export async function listNotifications(user){
  const rows=await db('notifications',`user_id=eq.${user.id}&order=created_at.desc&limit=50`);
  const ids=[...new Set(rows.filter(r=>r.event==='quote_published').map(r=>r.entity_id).filter(Boolean))];
  const quotes=ids.length?await db('quotes',`id=in.(${inIds(ids)})&select=id,request_id`):[];
  const requestByQuote=new Map(quotes.map(q=>[q.id,q.request_id]));
  return rows.map(row=>notificationPayload(row,requestByQuote.get(row.entity_id)));
}

export async function markNotificationsRead(user,body={}){
  const all=body.all===true,id=body.id;
  assert(all||Number.isSafeInteger(Number(id))&&Number(id)>0,400,'إشعار غير صالح / Invalid notification');
  const now=new Date().toISOString();
  const query=all?`user_id=eq.${user.id}&read_at=is.null`:`user_id=eq.${user.id}&id=eq.${Number(id)}`;
  await db('notifications',query,{method:'PATCH',body:{read_at:now},headers:{Prefer:'return=minimal'}});
  return {ok:true,readAt:now};
}
