import {one,db,rpc,assert} from '../lib/supabase.mjs';
import {can} from './auth.mjs';
// Soft deletion keeps invoice/payment snapshots and audit history intact.
export async function deleteOrder(user,body={}){
 assert(user?.role==='admin'&&can(user,'trash')&&can(user,'requests.edit'),403,'لا تملك صلاحية حذف الطلبات');
 const table={request:'requests',interest:'interests'}[body.kind];assert(table&&/^[A-Za-z0-9-]{1,80}$/.test(body.id||''),400);
 assert(typeof body.reason==='string'&&body.reason.trim()&&body.reason.length<=1000,400,'سبب الحذف مطلوب');
 const row=await one(table,body.id);assert(row&&!row.data.deletedAt,404,'الطلب غير متاح');assert(row.version===body.version,409,'تغيّر الطلب؛ حدّث القائمة قبل الحذف');
 assert(table!=='interests'||!row.data.cartOrderId,409,'احذف طلب المتجر الرئيسي بدل حذف أحد منتجاته');
 const children=table==='requests'?await db('interests',`data->>cartOrderId=eq.${encodeURIComponent(row.id)}&data->>deletedAt=is.null&limit=20`):[];
 assert(children.length<20,409,'الطلب يتجاوز حجم العملية المسموح');
 const now=new Date().toISOString(),reason=body.reason.trim();
 const change=(r,t)=>({table:t,id:r.id,version:r.version,ownerId:r.owner_id,data:{...r.data,deletedAt:now,deletedBy:user.id,deletedWithOrder:row.id,moderationHistory:[...(r.data.moderationHistory||[]),{action:'delete',reason,at:now,actorId:user.id}].slice(-200)},action:'order_delete',reason});
 await rpc('commit_changes',{actor:user.id,changes:[change(row,table),...children.map(r=>change(r,'interests'))]});return {ok:true};
}
