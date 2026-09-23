import {randomBytes} from 'node:crypto';
import {sb,one,db,rpc,assert} from '../lib/supabase.mjs';
import {can,profile} from './auth.mjs';
export async function createAccount(user,body={}){
  assert(can(user,'accounts.manage'),403);
  assert(['client','supplier'].includes(body.role),400,'اختر عميلًا أو موردًا');
  const data={};for(const key of ['name','company','phone','country','category']){assert(body[key]===undefined||typeof body[key]==='string'&&body[key].length<=200,400,'تحقق من بيانات الحساب');data[key]=String(body[key]||'').trim();}
  const email=String(body.email||'').trim().toLowerCase();assert(email.length<255&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email),400,'أدخل بريدًا صالحًا');
  assert(data.name&&data.phone&&data.country,400,'الاسم والهاتف والدولة مطلوبة');
  assert(!(await db('profiles',`data->>email=eq.${encodeURIComponent(email)}&limit=1`)).length,409,'البريد مسجل بالفعل؛ اختر الحساب القائم');
  // Server-only Auth Admin call. No sessions/passwords are returned and no email is sent.
  const created=await sb('/auth/v1/admin/users',{method:'POST',body:{email,password:randomBytes(32).toString('base64url'),email_confirm:false,user_metadata:{...data,role:body.role},app_metadata:{created_by_admin:user.id}}});
  const id=created.id||created.user?.id;assert(id,502,'تعذر إنشاء الحساب');
  const row=await one('profiles',id);assert(row&&row.role===body.role,502,'تم إنشاء هوية الحساب؛ حدّث قائمة الحسابات للتحقق من الملف');
  let auditPending=false;
  try{await rpc('commit_changes',{actor:user.id,changes:[{table:'profiles',id,version:row.version,role:row.role,permissions:row.permissions||[],blockedAt:null,deletedAt:null,data:{...row.data,accountHistory:[...(row.data.accountHistory||[]),{action:'create',at:new Date().toISOString(),actorId:user.id}]},action:'account_create'}]});}catch{auditPending=true;}
  return {ok:true,account:profile(row),setupRequired:true,auditPending};
}
