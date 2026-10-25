import test from 'node:test';
import assert from 'node:assert/strict';
import {team} from '../backend/modules/team.mjs';
import {authRoute} from '../backend/modules/auth.mjs';
import {createStoreDB,withLocalAPI,ids} from './helpers/store-db.mjs';

const invitedId='ffffffff-ffff-4fff-8fff-ffffffffffff';
const getProfile=async(pg,id)=>(await pg.query('select * from public.profiles where id=$1',[id])).rows[0];
test('owner invitation creates identity, grants only selected admin permissions, and rejects duplicate email',async()=>{
 const pg=await createStoreDB();
 try{
  await withLocalAPI(pg,async()=>{
   const local=global.fetch,calls=[];
   global.fetch=async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/invite'){
     const body=JSON.parse(options.body);
     calls.push({body,redirect:u.searchParams.get('redirect_to')});
     await pg.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[invitedId,body.email,JSON.stringify(body.data)]);
     return Response.json({id:invitedId,email:body.email});
    }
    return local(url,options);
   };
   const owner=await getProfile(pg,ids.admin);
   const result=await team(owner,{action:'invite',name:'New Manager',email:'New.Manager@example.test',permissions:['offers.create','requests.read']});
   assert.deepEqual(result,{ok:true,invited:true,email:'new.manager@example.test'});
   assert.equal(calls.length,1);
   assert.deepEqual(calls[0].body,{email:'new.manager@example.test',data:{name:'New Manager'}});
   assert.equal(calls[0].redirect,'https://local-test.invalid/reset-password.html');
   const profile=await getProfile(pg,invitedId);
   assert.equal(profile.role,'admin');
   assert.equal(profile.is_owner,false);
   assert.deepEqual(profile.permissions,['offers.create','requests.read']);
   assert.equal(profile.data.name,'New Manager');
   assert.equal(profile.data.email,'new.manager@example.test');
   await assert.rejects(()=>team(owner,{action:'invite',name:'New Manager',email:'new.manager@example.test',permissions:['offers.create']}),{status:409});
   assert.equal(calls.length,1,'duplicate invitation must not send another email');
   const existing=await team(owner,{action:'save',id:invitedId,permissions:['requests.read']});
   assert.equal(existing.ok,true);
   assert.deepEqual((await getProfile(pg,invitedId)).permissions,['requests.read']);
  });
 }finally{await pg.close();}
});
test('invitation validates permission scope and identity before any email',async()=>{
 const pg=await createStoreDB();
 try{
  await withLocalAPI(pg,async()=>{
   const owner=await getProfile(pg,ids.admin);
   const client=await getProfile(pg,ids.client);
   const input={action:'invite',name:'Team Mate',email:'manager@example.test',permissions:['offers.create']};
   await assert.rejects(()=>team(client,input),{status:403});
   await assert.rejects(()=>team(owner,{...input,name:'M'}),{status:400});
   await assert.rejects(()=>team(owner,{...input,permissions:['unknown.permission']}),{status:400});
   await assert.rejects(()=>team(owner,{...input,permissions:[]}),{status:400});
   const delegated={...owner,is_owner:false,permissions:['team','requests.read']};
   await assert.rejects(()=>team(delegated,{...input,permissions:['settings']}),{status:403});
   await assert.rejects(()=>team(delegated,{...input,permissions:['team']}),{status:403});
  });
 }finally{await pg.close();}
});
test('reset tokens may set a password only for an active administrator',async()=>{
 const pg=await createStoreDB();
 try{
  await withLocalAPI(pg,async()=>{
   const local=global.fetch,changes=[];
   let currentId=ids.client;
   global.fetch=async(url,options={})=>{
    const u=new URL(url);
    if(u.pathname==='/auth/v1/user'){
     if(options.method==='PUT'){changes.push(JSON.parse(options.body));return Response.json({id:currentId});}
     return Response.json({id:currentId});
    }
    if(u.pathname==='/auth/v1/logout')return Response.json({});
    return local(url,options);
   };
   const payload={accessToken:'valid-test-bearer-token-for-one-time-use',password:'NewSecurePassword123!'};
   await assert.rejects(()=>authRoute('reset',{headers:{}},{},payload),{status:403});
   assert.equal(changes.length,0);
   currentId=ids.admin;
   assert.deepEqual(await authRoute('reset',{headers:{}},{},payload),{ok:true});
   assert.deepEqual(changes,[{password:'NewSecurePassword123!'}]);
  });
 }finally{await pg.close();}
});
