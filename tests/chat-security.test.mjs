import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {adminConversationList,adminConversationRead,adminConversationAction,captureGuestLead,customerConversation} from '../backend/modules/ai-conversations.mjs';
import {aiChat} from '../backend/modules/ai-chat.mjs';
import {recordChatConversion} from '../backend/modules/chat-conversions.mjs';
import {enforceChatLimit} from '../backend/modules/chat-rate-limit.mjs';

const directory=new URL('../supabase/migrations/',import.meta.url);
async function migration(){
 const file=(await readdir(directory)).find(x=>x.endsWith('_chat_security_hardening.sql'));
 assert.ok(file,'Security migration must be checked in');
 return readFile(new URL(file,directory),'utf8');
}
const guestKey='security-test-guest-key-0001';
const request={headers:{'x-forwarded-for':'192.0.2.17'}};
const admin={id:'admin',role:'admin',is_owner:false,permissions:[]};
async function fixture(run){
 const original=global.fetch,env={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://security.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',APP_ORIGIN:'https://security.invalid'});
 const state={calls:[],writes:0,allowed:true,row:{id:'conversation',guest_key:guestKey,customer_id:null,status:'ai',language:'ar',unread_admin:3}};
 global.fetch=async(url,options={})=>{
  assert.equal(new URL(url).origin,'https://security.invalid');
  const path=new URL(url).pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  state.calls.push({path,method,body});
  if(path.endsWith('/consume_chat_rate_limit'))return Response.json(state.rpc?await state.rpc(body):{allowed:state.allowed,retry_after:30});
  if(method!=='GET')state.writes++;
  if(path.endsWith('/ai_conversations')){
   if(method==='PATCH')state.row={...state.row,...body};
   return Response.json([state.row]);
  }
  if(path.endsWith('/ai_messages'))return Response.json(method==='GET'?[]:[{id:1,...body}]);
  if(path.endsWith('/ai_usage_events'))return Response.json(null);
  throw Error('Unexpected fixture path '+path);
 };
 try{return await run(state);}finally{global.fetch=original;for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN'])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
}

test('conversation permissions reject unauthorized reads and every action before touching customer data',async()=>fixture(async state=>{
 for(const user of [null,{id:'customer',role:'client',permissions:['conversations.manage']},admin]){
  await assert.rejects(adminConversationList(user),{status:403});
  await assert.rejects(adminConversationRead(user,'conversation'),{status:403});
  for(const action of ['reply','takeover','ai','close'])await assert.rejects(adminConversationAction(user,{conversationId:'conversation',action,message:'test'}),{status:403});
 }
 assert.equal(state.calls.length,0);
}));

test('read-only staff can inspect chats without clearing unread counts or replying',async()=>fixture(async state=>{
 const user={...admin,permissions:['conversations.read']};
 assert.equal((await adminConversationList(user)).conversations.length,1);
 assert.equal((await adminConversationRead(user,'conversation')).conversation.unreadAdmin,3);
 for(const action of ['reply','takeover','ai','close'])await assert.rejects(adminConversationAction(user,{conversationId:'conversation',action,message:'test'}),{status:403});
 assert.equal(state.writes,0);
}));

test('owner and delegated chat managers retain reading, reply, takeover, close and reopen',async()=>fixture(async state=>{
 for(const user of [{...admin,is_owner:true},{...admin,permissions:['conversations.manage']}]){
  assert.equal((await adminConversationList(user)).conversations.length,1);
  assert.equal((await adminConversationRead(user,'conversation')).conversation.unreadAdmin,0);
  for(const [action,status] of [['takeover','human'],['reply','human'],['close','closed'],['ai','ai']]){
   const result=await adminConversationAction(user,{conversationId:'conversation',action,message:'test'});
   assert.equal(result.conversation.status,status);
  }
 }
 assert.ok(state.writes>0);
}));

test('all public chat paths enforce shared limits before conversation reads or writes',async()=>fixture(async state=>{
 state.allowed=false;
 for(const run of [()=>aiChat(null,{guestKey,message:'اريد موظف خدمة العملاء'},request),()=>captureGuestLead(null,{guestKey,contact:'123456'},request),()=>recordChatConversion(null,{guestKey,eventName:'product_click'},request),()=>customerConversation(null,{guestKey},request)]){
  await assert.rejects(run(),error=>error.status===429&&error.retryAfter===30);
 }
 assert.equal(state.writes,0);
 assert.ok(state.calls.every(x=>x.path.endsWith('/consume_chat_rate_limit')));
 assert.equal(new Set(state.calls.map(x=>x.body.p_key.split(':')[0])).size,4);
}));

test('invalid limiter replies fail closed and identities do not expose raw IPs',async()=>fixture(async state=>{
 state.rpc=()=>null;
 await assert.rejects(aiChat(null,{guestKey,message:'hello'},request),{status:503});
 assert.equal(state.writes,0);
 assert.doesNotMatch(state.calls[0].body.p_key,/192\.0\.2/);
}));

test('database counters are atomic, expire, isolate identities and remain service-only',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
  await pg.exec(await migration());
  await pg.exec('set role service_role');
  const consume=(key='test',limit=12)=>pg.query('select public.consume_chat_rate_limit($1,$2,600) result',[key,limit]).then(r=>r.rows[0].result);
  const results=await Promise.all(Array.from({length:20},()=>consume()));
  assert.equal(results.filter(x=>x.allowed).length,12);
  assert.ok(results.filter(x=>!x.allowed).every(x=>x.retry_after>0&&x.retry_after<=600));
  assert.equal((await consume('other')).allowed,true);
  await pg.query("update public.chat_rate_limits set expires_at=now()-interval '1 second' where key='test'");
  assert.equal((await consume()).allowed,true);
  assert.equal((await pg.query("select requests from public.chat_rate_limits where key='test'")).rows[0].requests,1);
  await pg.exec('reset role');
  for(const role of ['anon','authenticated']){
   await pg.exec('set role '+role);
   await assert.rejects(consume(),/permission denied/);
   await assert.rejects(pg.query('select * from public.chat_rate_limits'),/permission denied/);
   await pg.exec('reset role');
  }
  await fixture(async state=>{
   state.rpc=async body=>(await pg.query('select public.consume_chat_rate_limit($1,$2,$3) result',[body.p_key,body.p_limit,body.p_window_seconds])).rows[0].result;
   for(let i=0;i<12;i++){
    state.row.guest_key=guestKey+i;
    const result=await aiChat(null,{guestKey:guestKey+i,message:'اريد موظف خدمة العملاء'},request);
    assert.equal(result.waitingHuman,true);
   }
   const writes=state.writes;
   for(let i=12;i<20;i++)await assert.rejects(aiChat(null,{guestKey:guestKey+i,message:'اريد موظف خدمة العملاء'},request),{status:429});
   assert.equal(state.writes,writes,'rotating guest keys must not bypass the shared IP limit');
   const client={id:'client',role:'client'};
   for(let i=0;i<40;i++)await enforceChatLimit(client,request,'message');
   await assert.rejects(enforceChatLimit(client,request,'message'),{status:429});
  });
 }finally{await pg.close();}
});

test('legacy hardening keeps inventory triggers working and removes public import access',async()=>{
 const pg=new PGlite();
 try{
  await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create table public.admin_image_import_jobs(id integer); grant all on public.admin_image_import_jobs to anon,authenticated,service_role;
   create table public.inventory_fixture(data jsonb);
   create function public.default_unlimited_store_inventory() returns trigger language plpgsql as $$begin
    new.data:=coalesce(new.data,'{}'::jsonb);
    if not(new.data ? 'stockUnlimited') then new.data:=jsonb_set(jsonb_set(new.data,'{stockUnlimited}','true'::jsonb,true),'{stock}','""'::jsonb,true);end if;
    return new;end;$$;
   create function public.filter_cart_quote_notifications() returns trigger language plpgsql security definer as $$begin return new;end;$$;
   create function public.notify_cart_replacement_approval() returns trigger language plpgsql security definer as $$begin return new;end;$$;
   create trigger inventory_defaults before insert on public.inventory_fixture for each row execute function public.default_unlimited_store_inventory();
   create trigger notifications_fixture before insert on public.inventory_fixture for each row execute function public.filter_cart_quote_notifications();
   create trigger approvals_fixture before insert on public.inventory_fixture for each row execute function public.notify_cart_replacement_approval();
   grant usage on schema public to service_role; grant select,insert on public.inventory_fixture to service_role;`);
  await pg.exec(await migration());
  for(const role of ['anon','authenticated']){
   const result=await pg.query(`select has_function_privilege($1,'public.filter_cart_quote_notifications()','EXECUTE') f,
    has_function_privilege($1,'public.notify_cart_replacement_approval()','EXECUTE') n,
    has_table_privilege($1,'public.admin_image_import_jobs','SELECT') t`,[role]);
   assert.deepEqual(result.rows[0],{f:false,n:false,t:false});
  }
  await pg.exec('set role service_role');
  const result=await pg.query("insert into public.inventory_fixture values ('{}'),('{\"stockUnlimited\":false,\"stock\":7}') returning data");
  assert.deepEqual(result.rows.map(r=>r.data),[{stockUnlimited:true,stock:''},{stockUnlimited:false,stock:7}]);
 }finally{await pg.close();}
});
