import {db,one,rpc,assert} from '../lib/supabase.mjs';
import {can,permissions,profile} from './auth.mjs';
export async function team(user,body){
  assert(can(user,'team'));
  const p=body.id?await one('profiles',body.id):(await db('profiles',`data->>email=eq.${encodeURIComponent(String(body.email||'').trim().toLowerCase())}&limit=1`))[0];
  assert(p,404,'يجب أن يسجل المدير حسابًا ويؤكد بريده أولًا / Register and verify this account first');
  assert(!p.is_owner&&p.id!==user.id,403,'لا يمكن تعديل المدير الرئيسي أو صلاحياتك بنفسك / Protected account');
  assert(Array.isArray(body.permissions)&&body.permissions.every(p=>permissions.includes(p)),400);
  assert(user.is_owner||body.permissions.every(p=>user.permissions.includes(p)),403);
  assert(user.is_owner||!(p.permissions||[]).some(p=>!user.permissions.includes(p)),403);
  const allowed=['save','block','unblock'];assert(allowed.includes(body.action),400);
  assert(user.is_owner||!body.permissions.includes('team'),403,'إدارة الفريق متاحة بتفويض المدير الرئيسي فقط / Owner must delegate team management');
  await rpc('commit_changes',{actor:user.id,changes:[{table:'profiles',id:p.id,version:p.version,data:p.data,role:'admin',permissions:body.action==='save'?body.permissions:p.permissions,blockedAt:body.action==='block'?new Date().toISOString():body.action==='unblock'?null:p.blocked_at,deletedAt:p.deleted_at,action:`team_${body.action}`,reason:String(body.reason||'Team permissions updated').slice(0,1000)}]});
  return {ok:true};
}
