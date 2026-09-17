import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../src/session-core.js';

const reply = (data, status=200) => new Response(JSON.stringify(data), {status});
const tokens = id => ({accessToken:id,refreshToken:`refresh-${id}`,expiresAt:10000});
const user = id => ({id,role:id==='admin'?'admin':'client'});
function fixture(handler) {
  let saved=null;
  const storage={get:async()=>saved,set:async value=>{saved=structuredClone(value);},remove:async()=>{saved=null;}};
  const fetchImpl=async(url,options)=>handler(new URL(url).pathname,options);
  const session=createSession({storage,fetchImpl,now:()=>100000});
  return {session,storage,fetchImpl,get saved(){return saved;}};
}
const loginReply=id=>reply({user:user(id),tokens:tokens(id)});
test('restores saved credentials, verifies identity, and persists rotated refresh token',async()=>{
  const f=fixture((path,o)=>path.endsWith('/login')?loginReply('client'):path.endsWith('/refresh')?reply({tokens:tokens('rotated')}):reply({user:user('client')}));
  await f.session.login({});
  await f.storage.set({...f.saved,expiresAt:1});
  const next=createSession({storage:f.storage,fetchImpl:f.fetchImpl,now:()=>100000});
  assert.equal(await next.restore(),true);
  assert.equal((await next.state()).user.id,'client');
  assert.equal(f.saved.refreshToken,'refresh-rotated');
  await next.logout();assert.equal(f.saved,null);assert.equal(next.active,false);
});
test('parallel 401 responses share one refresh request',async()=>{
  let refreshes=0;
  const f=fixture(async(path,o)=>{
    if(path.endsWith('/login'))return loginReply('client');
    if(path.endsWith('/refresh')){refreshes++;await new Promise(r=>setTimeout(r,10));return reply({tokens:tokens('rotated')});}
    return o.headers.Authorization==='Bearer rotated'?reply({ok:true}):reply({error:'expired'},401);
  });
  await f.session.login({});
  assert.deepEqual(await Promise.all([f.session.request('/one'),f.session.request('/two')]),[{ok:true},{ok:true}]);
  assert.equal(refreshes,1);
});
test('HTTP 200 public snapshot triggers refresh before displaying authenticated state',async()=>{
  let calls=0;
  const f=fixture((path,o)=>path.endsWith('/login')?loginReply('client'):path.endsWith('/refresh')?(calls++,reply({tokens:tokens('rotated')})):reply({user:o.headers.Authorization==='Bearer rotated'?user('client'):null}));
  await f.session.login({});assert.equal((await f.session.state()).user.id,'client');assert.equal(calls,1);
});
test('wrong account identity and rejected refresh clear saved credentials',async()=>{
  for(const mode of ['identity','expired']) {
    const f=fixture(path=>path.endsWith('/login')?loginReply('client'):path.endsWith('/refresh')?reply({error:'expired'},400):reply({user:mode==='identity'?user('other'):null}));
    await f.session.login({});await assert.rejects(f.session.state(),{code:'session_expired'});assert.equal(f.saved,null);assert.equal(f.session.active,false);
  }
});
test('late administrator response cannot survive logout and customer login',async()=>{
  let release,started;const ready=new Promise(r=>started=r);
  const f=fixture(async(path,o)=>{
    if(path.endsWith('/login'))return loginReply(JSON.parse(o.body).id);
    if(path==='/slow'){started();await new Promise(r=>release=r);return reply({user:user('admin')});}
    return reply({user:user('client')});
  });
  await f.session.login({id:'admin'});
  const slow=assert.rejects(f.session.request('/slow'),{code:'session_changed'});
  await ready;await f.session.logout();await f.session.login({id:'client'});release();await slow;
  assert.equal((await f.session.state()).user.id,'client');assert.equal(f.saved.userId,'client');
});
test('refresh finishing after logout cannot recreate the stored session',async()=>{
  let release,started;const ready=new Promise(r=>started=r);
  const f=fixture(async path=>{
    if(path.endsWith('/login'))return loginReply('admin');
    if(path.endsWith('/refresh')){started();await new Promise(r=>release=r);return reply({tokens:tokens('old-admin')});}
    return reply({error:'expired'},401);
  });
  await f.session.login({});const pending=assert.rejects(f.session.request('/private'),{code:'session_changed'});
  await ready;await f.session.logout();release();await pending;assert.equal(f.saved,null);assert.equal(f.session.active,false);
});
test('network errors preserve credentials for retry and are distinct from bad login',async()=>{
  const f=fixture(path=>{if(path.endsWith('/login'))return loginReply('client');throw new Error('offline');});
  await f.session.login({});await assert.rejects(f.session.state(),{code:'network'});assert.equal(f.session.active,true);assert.ok(f.saved);
});
test('registration with and without email confirmation follows server response',async()=>{
  for(const confirmationRequired of [false,true]){
    const f=fixture(path=>path.endsWith('/register')?reply(confirmationRequired?{confirmationRequired}:{tokens:tokens('new')}):reply({user:user('new')}));
    await f.session.register({role:'client'});assert.equal(f.session.active,!confirmationRequired);
    if(!confirmationRequired){await f.session.state();assert.equal(f.saved.userId,'new');}else assert.equal(f.saved,null);
  }
});
test('secure storage failure prevents entering a partially saved session',async()=>{
  const f=fixture(()=>loginReply('client'));f.storage.set=async()=>{throw new Error('Keychain locked');};
  await assert.rejects(f.session.login({}),{code:'storage_failed'});assert.equal(f.session.active,false);assert.equal(f.saved,null);
});
