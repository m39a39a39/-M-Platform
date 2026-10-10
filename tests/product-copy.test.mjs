import test from 'node:test';
import assert from 'node:assert/strict';
import {productCopy,copySource,validateCopy} from '../backend/modules/product-copy.mjs';
const user={id:'f34e8486-35e1-403c-9524-15a8d095fd64',role:'admin',permissions:['offers.edit']};
const productId='c3b2d826-a640-4945-b3b4-b1cb204bef56';
const copy={titleAr:'شاحن AMAYA 20W',titleEn:'AMAYA 20W charger',descriptionAr:'شاحن AMAYA بقدرة 20 واط.',descriptionEn:'AMAYA charger with 20W power.'};
async function mock(run,{status=200,content=copy,finish='stop',allowed=true,row={id:productId,version:2,data:{product:'AMAYA 20W',specs:'20W',status:'published'}}}={}){
 const old=global.fetch,env={...process.env},calls=[];
 Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',APP_ORIGIN:'https://app.test',OPENAI_API_KEY:'test-key'});
 global.fetch=async(url,opts={})=>{const body=opts.body?JSON.parse(opts.body):null;calls.push({url:String(url),body,method:opts.method||'GET'});
  if(String(url).includes('/rpc/consume_chat_rate_limit'))return Response.json({allowed});
  if(String(url).includes('/public_offers?'))return Response.json(row?[row]:[]);
  if(String(url).includes('/ai_usage_events'))return Response.json(null);
  if(String(url)==='https://api.openai.com/v1/chat/completions')return Response.json({choices:[{finish_reason:finish,message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:10,completion_tokens:20}},{status});
  throw Error('Unexpected request '+url);
 };
 try{await run(calls);}finally{global.fetch=old;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
}
test('copy source excludes commercial, contact and account fields; output only changes requested copy',()=>{
 assert.deepEqual(Object.keys(copySource({name:'Charger',price:99,stock:5,notes:'supplier phone',supplierId:'private'})),['titleAr','titleEn','descriptionAr','descriptionEn','technicalSpecs','options','shortDescription']);
 assert.deepEqual(validateCopy({...copy,stock:0},'title'),{titleAr:copy.titleAr,titleEn:copy.titleEn});
 for(const bad of ['', '<script>alert(1)</script>','https://supplier.test','x'.repeat(101)])assert.throws(()=>validateCopy({...copy,titleAr:bad},'title'));
});
test('generation requires edit permission and usable product identity before contacting provider',async()=>{
 await mock(async calls=>{
  await assert.rejects(productCopy({role:'client'},{source:{name:'a'}}),{status:403});
  await assert.rejects(productCopy({role:'admin',permissions:['settings']},{source:{name:'a'}}),{status:403});
  await assert.rejects(productCopy(user,{source:{description:'unknown'}}),{status:400});
  await assert.rejects(productCopy(user,{mode:'publish',source:{name:'a'}}),{status:400});assert.equal(calls.length,0);
 });
});
test('inline generation uses unsaved text and strict schema, records usage without product writes',async()=>{
 await mock(async calls=>{
  const result=await productCopy(user,{mode:'title',source:{name:'New unsaved AMAYA 20W',price:20,notes:'secret'},instruction:'Concise'});
  assert.deepEqual(result.proposal,{titleAr:copy.titleAr,titleEn:copy.titleEn});
  const provider=calls.find(c=>c.url.includes('openai.com')),input=JSON.parse(provider.body.messages[1].content);
  assert.equal(input.PRODUCT_JSON.titleAr,'New unsaved AMAYA 20W');assert.equal(input.PRODUCT_JSON.price,undefined);assert.equal(input.PRODUCT_JSON.notes,undefined);
  assert.deepEqual(provider.body.response_format.json_schema.schema.required,['titleAr','titleEn']);
  assert.ok(calls.some(c=>c.url.includes('ai_usage_events')));assert.ok(!calls.some(c=>/public_offers|commit_changes/.test(c.url)));
 });
});
test('bulk generation reads persisted version and ignores forged source; stale or removed products are rejected',async()=>{
 await mock(async calls=>{
  const result=await productCopy(user,{productId,version:2,source:{name:'Injected fake name'},mode:'description'});
  assert.equal(result.version,2);assert.deepEqual(Object.keys(result.proposal),['descriptionAr','descriptionEn']);
  assert.equal(JSON.parse(calls.find(c=>c.url.includes('openai.com')).body.messages[1].content).PRODUCT_JSON.titleAr,'AMAYA 20W');
  await assert.rejects(productCopy(user,{productId,version:1}),{status:409});
 });
 for(const row of [null,{version:2,data:{deletedAt:'now'}},{version:2,data:{status:'source_review'}}])await mock(async()=>{await assert.rejects(productCopy(user,{productId,version:2}),{status:404});},{row});
});
test('shared limit blocks paid calls, provider errors and partial output never become proposals',async()=>{
 await mock(async calls=>{await assert.rejects(productCopy(user,{source:{name:'Charger'}}),{status:429});assert.equal(calls.filter(c=>c.url.includes('openai.com')).length,0);},{allowed:false});
 await mock(async()=>{await assert.rejects(productCopy(user,{source:{name:'Charger'}}),{status:429});},{status:429});
 await mock(async()=>{await assert.rejects(productCopy(user,{source:{name:'Charger'}}),{status:502});},{finish:'length'});
 await mock(async()=>{await assert.rejects(productCopy(user,{source:{name:'Charger'}}),{status:502});},{content:{titleAr:'only'}});
});
