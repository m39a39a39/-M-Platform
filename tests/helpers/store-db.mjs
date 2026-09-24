import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const ids={admin:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',client:'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',supplier:'cccccccc-cccc-4ccc-cccc-cccccccccccc',other:'dddddddd-dddd-4ddd-dddd-dddddddddddd',media:'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee'};
export async function createStoreDB({migrate=true}={}){
 const pg=new PGlite();await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);`);
 await pg.exec(await readFile(new URL('../../database/migrations/001_initial.sql',import.meta.url),'utf8'));
 for(const [role,key] of [['admin','admin'],['client','client'],['supplier','supplier'],['supplier','other']]){await pg.query('insert into auth.users values($1,$2,$3)',[ids[key],key+'@example.test',JSON.stringify({role,name:key,country:'China'})]);if(role==='admin')await pg.query("update profiles set role='admin',is_owner=true where id=$1",[ids[key]]);}
 await pg.query('update settings set data=$1',[JSON.stringify({categories:[{id:'cat',nameAr:'منتجات',nameEn:'Products',active:true}],subcategories:[],supplyCountries:[{id:'China',nameAr:'الصين',nameEn:'China',active:true}]})]);
 await pg.query('insert into media(id,owner_id,path,mime) values($1,$2,$3,$4)',[ids.media,ids.supplier,'test/product.png','image/png']);
 await pg.exec(await readFile(new URL('../../database/migrations/012_supplier_order_notifications.sql',import.meta.url),'utf8'));
 if(migrate)await applySourceMigration(pg);
 return pg;
}
export async function applySourceMigration(pg){await pg.exec(await readFile(new URL('../../supabase/migrations/20260923085832_store_supply_sources.sql',import.meta.url),'utf8'));}
export function localRest(pg){return async(url,options={})=>{
 try{const u=new URL(url),table=u.pathname.split('/').at(-1),body=options.body?JSON.parse(options.body):null;
 if(u.pathname.includes('/rpc/')){if(table==='commit_changes'){await pg.query('select public.commit_changes($1,$2)',[body.actor,JSON.stringify(body.changes)]);return Response.json(null);}throw Error('Unsupported local RPC '+table);}
 if(!/^[a-z_]+$/.test(table))throw Error('Invalid table');
 if(options.method==='POST'){const keys=Object.keys(body);if(!keys.every(k=>/^[a-z_]+$/.test(k)))throw Error('Invalid fields');await pg.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(body));return Response.json(null);}
 const conditions=[],values=[];let tail='';for(const [key,val] of u.searchParams){if(key==='limit'||key==='offset'){if(!/^\d+$/.test(val))throw Error('Invalid pagination');tail+=' '+key+' '+val;continue;}if(['order','select'].includes(key))continue;
 const m=key.match(/^([a-z_]+)(->>?([A-Za-z]+))?$/);if(!m)throw Error('Unsupported query key '+key);const expr=m[2]?`${m[1]}${m[2].startsWith('->>')?'->>':'->'}'${m[3]}'`:m[1];
 if(val==='is.null')conditions.push(expr+' is null');else if(val.startsWith('eq.')){values.push(val.slice(3));conditions.push(expr+' = $'+values.length);}else if(val.startsWith('cs.')){values.push(val.slice(3));conditions.push(expr+' @> $'+values.length+'::jsonb');}else if(val.startsWith('in.')){values.push(val.slice(4,-1).replaceAll('"','').split(','));conditions.push(expr+'::text = any($'+values.length+'::text[])');}else throw Error('Unsupported filter '+val);
 }
 const result=await pg.query('select * from '+table+(conditions.length?' where '+conditions.join(' and '):'')+tail,values);return Response.json(result.rows);
 }catch(e){return Response.json({message:e.message,code:e.code},{status:400});}
};}
export async function withLocalAPI(pg,run){const old=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://local-test.invalid',SUPABASE_ANON_KEY:'local',SUPABASE_SERVICE_ROLE_KEY:'local',APP_ORIGIN:'https://local-test.invalid'});global.fetch=localRest(pg);try{return await run();}finally{global.fetch=old;for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN'])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
