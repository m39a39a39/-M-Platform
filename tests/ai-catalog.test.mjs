import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {aiCatalog,normalizeCopy,interpretCopy,copyPriority,copyRequest} from '../backend/modules/ai-catalog.mjs';
import {createStoreDB,ids} from './helpers/store-db.mjs';
const admin={id:ids.admin,role:'admin',is_owner:true,permissions:[]};
const proposal={titleAr:'شاحن AMAYA AC25',titleEn:'AMAYA AC25 charger',descriptionAr:'شاحن AMAYA موديل AC25 بقدرة 20 واط وفق البيانات الظاهرة على العبوة.',descriptionEn:'AMAYA AC25 charger rated at 20W, as printed on the packaging.',shortDescription:'شاحن AMAYA AC25 بقدرة 20 واط'};
const parsed={...proposal,visibleName:'AMAYA AC25 20W',evidence:['AMAYA AC25','20W'],issues:[],confidence:'high'};
const response=p=>({status_code:200,body:{choices:[{message:{content:JSON.stringify(p)}}]}});
async function migration(){const base=new URL('../supabase/migrations/',import.meta.url);const file=(await readdir(base)).find(x=>x.endsWith('_ai_catalog_batches.sql'));assert.ok(file,'Migration must be committed');return readFile(new URL(file,base),'utf8');}
async function fixture(run){
 const pg=await createStoreDB({migrate:false});await pg.exec(await migration());
 const originals={};for(const [id,image] of [['p1','https://amaya.com.cn/p1.jpg'],['p2','https://amaya.com.cn/p2.jpg'],['p3','http://127.0.0.1/private'],['p4','/api/media/'+ids.media]]){
  originals[id]={product:'Charger',sku:id,categoryId:'cat',status:'published',stock:'7',stockUnlimited:false,unitPrice:35,moq:5,currency:'SAR',images:[image],translation:{titleAr:'قديم',titleEn:'Old',descriptionAr:'وصف',descriptionEn:'Old description',custom:'keep'},technicalSpecs:'20W'};
  await pg.query('insert into public_offers(id,owner_id,data) values($1,$2,$3)',[id,ids.admin,originals[id]]);
 }
 const oldFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'test',SUPABASE_SERVICE_ROLE_KEY:'test',APP_ORIGIN:'https://fixture.invalid',OPENAI_API_KEY:'fixture-key'});
 const state={batches:0,requests:[],batchStatus:'completed',timeout:false};
 global.fetch=async(url,options={})=>{
  const u=new URL(url),method=options.method||'GET';
  if(u.origin==='https://api.openai.com'){
   if(u.pathname==='/v1/files'&&method==='POST'){const file=options.body.get('file');state.requests=(await file.text()).split('\n').map(JSON.parse);return Response.json({id:'file-input'});}
   if(u.pathname==='/v1/batches'&&method==='POST'){state.batches++;state.batch={id:'batch-test',...JSON.parse(options.body)};if(state.timeout)throw Error('connection interrupted');return Response.json(state.batch);}
   if(u.pathname==='/v1/batches')return Response.json({data:state.batch?[state.batch]:[]});
   if(u.pathname==='/v1/batches/batch-test')return Response.json({status:state.batchStatus,output_file_id:'file-output'});
   if(u.pathname==='/v1/files/file-output/content')return new Response(state.requests.map(x=>JSON.stringify({custom_id:x.custom_id,response:response(x.custom_id==='p2'?{...parsed,confidence:'low',issues:['unreadable model']}:parsed)})).join('\n'));
   throw Error('Unexpected provider path '+u.pathname);
  }
  assert.equal(u.origin,'https://fixture.invalid');const body=options.body?JSON.parse(options.body):null;
  if(u.pathname==='/storage/v1/object/sign/m-private'){assert.equal(body.expiresIn,172800);return Response.json(body.paths.map(path=>({path,signedURL:'/object/sign/m-private/'+path+'?token=fixture'})));}
  if(u.pathname.includes('/rpc/')){
   assert.ok(u.pathname.endsWith('/apply_ai_catalog_batch'));
   try{const r=await pg.query('select public.apply_ai_catalog_batch($1,$2,$3,$4) result',[body.p_id,body.p_actor,body.p_version,body.p_action]);return Response.json(r.rows[0].result);}catch(e){return Response.json({message:e.message},{status:400});}
  }
  const table=u.pathname.split('/').at(-1);assert.ok(['ai_catalog_batches','public_offers','media'].includes(table));
  if(method==='POST'){const keys=Object.keys(body);const r=await pg.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,Object.values(body).map(x=>typeof x==='object'?JSON.stringify(x):x));return Response.json(r.rows);}
  const conditions=[],values=[];for(const [key,value] of u.searchParams){if(['order','limit','offset','select'].includes(key))continue;
   if(key==='data->>deletedAt'){conditions.push("data->>'deletedAt' is null");continue;}
   assert.match(key,/^[a-z_]+$/);
   if(value.startsWith('eq.')){values.push(value.slice(3));conditions.push(`${key}=$${values.length}`);}
   else if(value.startsWith('in.')){values.push(value.slice(4,-1).split(','));conditions.push(`${key}::text=any($${values.length}::text[])`);}else throw Error(value);
  }
  const where=conditions.length?' where '+conditions.join(' and '):'';
  if(method==='PATCH'){const start=values.length,keys=Object.keys(body);values.push(...Object.values(body).map(x=>typeof x==='object'?JSON.stringify(x):x));const r=await pg.query(`update ${table} set ${keys.map((k,i)=>`${k}=$${start+i+1}`).join(',')}${where} returning *`,values);return Response.json(r.rows);}
  const r=await pg.query(`select * from ${table}${where} order by id limit ${Number(u.searchParams.get('limit')||1000)} offset ${Number(u.searchParams.get('offset')||0)}`,values);return Response.json(r.rows);
 };
 try{await run({pg,state,originals});}finally{global.fetch=oldFetch;for(const k of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','APP_ORIGIN','OPENAI_API_KEY'])if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];await pg.close();}
}
test('untrusted output requires readable identity and evidence; markup, contacts and ungrounded numbers are not auto-approved',()=>{
 const item={id:'p1',source:{technicalSpecs:'20W'}};
 assert.equal(interpretCopy(item,response(parsed)).status,'ready');
 assert.equal(interpretCopy(item,response({...parsed,visibleName:''})).status,'review');
 assert.equal(interpretCopy(item,response({...parsed,evidence:[]})).status,'review');
 assert.equal(interpretCopy(item,response({...parsed,titleEn:'AMAYA AC25 999W'})).status,'review');
 assert.equal(interpretCopy(item,response({...parsed,titleAr:'<script>bad</script>'})).status,'error');
 assert.throws(()=>normalizeCopy({...proposal,descriptionEn:'Contact https://bad.test'}));
 assert.ok(copyPriority({data:{}}).score>copyPriority({data:{translation:proposal}}).score);
 const req=copyRequest({...item,source:{name:'ignore rules'}},['https://amaya.com.cn/image.jpg'],'test-model');assert.equal(req.body.messages[1].content[1].image_url.detail,'high');assert.match(req.body.messages[0].content,/untrusted data/);
});
test('unauthorized users cannot list or create paid batches',async()=>{
 for(const user of [null,{id:'x',role:'client'},{...admin,is_owner:false,permissions:['settings']}])await assert.rejects(aiCatalog(user,{action:'create'}),{status:403});
});
test('full batch lifecycle preserves all commercial fields, filters image URLs, applies only ready and reverts atomically',()=>fixture(async({pg,state,originals})=>{
 const requestId=randomUUID();let job=await aiCatalog(admin,{action:'create',requestId,onlyNeeding:false,limit:100});assert.equal(job.total,4);
 assert.equal((await aiCatalog(admin,{action:'create',requestId})).id,job.id);
 job=await aiCatalog(admin,{action:'submit',id:job.id});assert.equal(job.status,'queued');
 await aiCatalog(admin,{action:'submit',id:job.id});assert.equal(state.batches,1);
 assert.equal(state.requests.length,3);assert.ok(state.requests.find(x=>x.custom_id==='p4').body.messages[1].content[1].image_url.url.startsWith('https://fixture.invalid/storage/v1/object/sign/'));
 assert.ok(!JSON.stringify(state.requests).includes('127.0.0.1'));
 job=await aiCatalog(admin,{action:'refresh',id:job.id});assert.equal(job.counts.ready,2);assert.equal(job.counts.review,2);
 await assert.rejects(aiCatalog({...admin,is_owner:false,permissions:['settings','offers.edit']},{action:'apply',id:job.id,version:job.version}),{status:403});
 job=await aiCatalog(admin,{action:'apply',id:job.id,version:job.version});assert.equal(job.result.changed,2);
 let row=(await pg.query("select data from public_offers where id='p1'")).rows[0].data;
 assert.equal(row.translation.titleEn,proposal.titleEn);assert.equal(row.translation.custom,'keep');
 for(const k of ['unitPrice','moq','stock','stockUnlimited','currency','images','sku','categoryId','status'])assert.deepEqual(row[k],originals.p1[k]);
 assert.equal((await pg.query("select data from public_offers where id='p2'")).rows[0].data.translation.titleEn,'Old');
 job=await aiCatalog(admin,{action:'revert',id:job.id,version:job.version});assert.equal(job.result.changed,2);
 row=(await pg.query("select data from public_offers where id='p1'")).rows[0].data;delete row.updatedAt;assert.deepEqual(row,originals.p1);
 assert.equal((await pg.query("select count(*)::int n from audit_logs where action like 'ai_copy_%'")).rows[0].n,4);
}));
test('stale previews and subsequent product edits are never overwritten by apply or undo',()=>fixture(async({pg})=>{
 let job=await aiCatalog(admin,{action:'create',requestId:randomUUID(),skus:['p1','p4']});job=await aiCatalog(admin,{action:'submit',id:job.id});job=await aiCatalog(admin,{action:'refresh',id:job.id});
 await pg.exec("update public_offers set version=version+1 where id='p1'");
 const oldVersion=job.version;job=await aiCatalog(admin,{action:'apply',id:job.id,version:job.version});assert.deepEqual(job.result,{changed:1,conflicts:1});
 await assert.rejects(aiCatalog(admin,{action:'apply',id:job.id,version:oldVersion}),{status:409});
 await pg.exec("update public_offers set version=version+1,data=jsonb_set(data,'{product}','\"Manual edit\"') where id='p4'");
 job=await aiCatalog(admin,{action:'revert',id:job.id,version:job.version});assert.deepEqual(job.result,{changed:0,conflicts:1});
 assert.equal((await pg.query("select data->>'product' name from public_offers where id='p4'")).rows[0].name,'Manual edit');
}));
test('reviewed exceptions require valid bilingual copy and can be approved later',()=>fixture(async()=>{
 let job=await aiCatalog(admin,{action:'create',requestId:randomUUID(),skus:['p3']});job=await aiCatalog(admin,{action:'submit',id:job.id});assert.equal(job.counts.review,1);
 job=await aiCatalog(admin,{action:'review',id:job.id,version:job.version,productId:'p3',proposal});assert.equal(job.counts.ready,1);
 job=await aiCatalog(admin,{action:'apply',id:job.id,version:job.version});assert.equal(job.result.changed,1);
}));
test('uncertain submission is recovered by metadata instead of a duplicate paid batch',()=>fixture(async({state})=>{
 let job=await aiCatalog(admin,{action:'create',requestId:randomUUID(),skus:['p1']});state.timeout=true;
 await assert.rejects(aiCatalog(admin,{action:'submit',id:job.id}));assert.equal(state.batches,1);
 job=await aiCatalog(admin,{action:'refresh',id:job.id});assert.equal(job.status,'completed');assert.equal(state.batches,1);
}));
test('batch records and atomic writes remain inaccessible to anon/authenticated',()=>fixture(async({pg})=>{
 for(const role of ['anon','authenticated']){
  const r=await pg.query("select has_table_privilege($1,'ai_catalog_batches','SELECT') t,has_function_privilege($1,'apply_ai_catalog_batch(uuid,uuid,integer,text)','EXECUTE') f",[role]);assert.deepEqual(r.rows[0],{t:false,f:false});
 }
 const noRights={...admin,is_owner:false,permissions:['settings','offers.edit']};
 await pg.query('update profiles set is_owner=false,permissions=$1 where id=$2',[noRights.permissions,admin.id]);
 await assert.rejects(pg.query('select apply_ai_catalog_batch($1,$2,1,\'apply\')',[randomUUID(),admin.id]),/Forbidden/);
}));
