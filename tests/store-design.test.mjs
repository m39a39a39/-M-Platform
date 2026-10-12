import test from 'node:test';
import assert from 'node:assert/strict';
import {generateStoreDesign,designContext,validateDesign} from '../backend/modules/store-design.mjs';
import {defaultStore} from '../shared/storefront-model.mjs';
import {normalizeStore} from '../backend/modules/studio.mjs';
import {renderStorefront} from '../mobile-app/src/storefront.js';
const store=normalizeStore(defaultStore());
const user={id:'admin-id',role:'admin',permissions:['settings']};
const proposal={summary:'واجهة بسيطة',sections:[{type:'hero',title:'تسوق منتجاتنا',titleEn:'Explore our products',subtitle:'اختر ما يناسبك',subtitleEn:'Find your products',button:'استكشف',buttonEn:'Explore',items:'',itemsEn:'',image:'',background:'#123456',textColor:'#ffffff',align:'center',columns:3,mobileColumns:1,padding:48,gap:24,radius:16,titleSize:40,productSource:'latest',productIds:[],categoryId:'',limit:6,buttonTarget:'products'}]};
const context=designContext(store,[{id:'cat',nameAr:'تصنيف',active:true}],[{id:'p1',data:{status:'published',product:'Charger',supplierId:'secret',unitPrice:20}}]);
test('design includes only safe catalog context and preserves other page settings',()=>{
 assert.doesNotMatch(JSON.stringify(context),/supplierId|secret|unitPrice/);
 const before=JSON.stringify(store),result=validateDesign({...proposal,theme:{name:'hijack'}},store,context);
 assert.equal(JSON.stringify(store),before);assert.equal(result.sections.length,1);assert.equal(result.sections[0].page,'home');assert.match(result.sections[0].id,/^ai-/);
 assert.equal(result.sections[0].background,'#123456');assert.equal(result.theme,undefined);
 const published={...store,sections:[...store.sections.filter(s=>s.page!=='home'),...result.sections]};
 const html=renderStorefront({settings:{storefront:published,categories:[],subcategories:[]},publicOffers:[]},'web',{language:'ar'});
 assert.match(html,/تسوق منتجاتنا/);assert.match(html,/#123456/);
});
test('invalid provider content cannot introduce code, products, media, global sections or invalid layouts',()=>{
 for(const patch of [{type:'header'},{title:'<script>alert(1)</script>'},{image:'https://evil.test/a.jpg'},{productIds:['missing']},{categoryId:'missing'},{background:'url(evil)'},{padding:999},{buttonTarget:'link'},{productSource:'manual',productIds:[]}])assert.throws(()=>validateDesign({...proposal,sections:[{...proposal.sections[0],...patch}]},store,context));
 assert.throws(()=>validateDesign({...proposal,sections:[]},store,context));
 assert.throws(()=>validateDesign({...proposal,sections:Array(9).fill(proposal.sections[0])},store,context));
 const out=validateDesign({...proposal,sections:[{...proposal.sections[0],href:'javascript:evil()',page:'product',id:'owned'}]},store,context);
 assert.equal(out.sections[0].href,'');assert.equal(out.sections[0].page,'home');assert.notEqual(out.sections[0].id,'owned');
});
async function mock(run,{version=7,allowed=true,status=200,finish='stop',content=proposal}={}){
 const original=global.fetch,env={...process.env},calls=[];
 Object.assign(process.env,{SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',APP_ORIGIN:'https://app.test',OPENAI_API_KEY:'test'});
 global.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url:String(url),method:options.method||'GET',body});
  if(String(url).includes('/settings?'))return Response.json([{id:'site',version,data:{categories:[]}}]);
  if(String(url).includes('/rpc/consume_chat_rate_limit'))return Response.json({allowed});
  if(String(url).includes('/public_offers?'))return Response.json([]);
  if(String(url).includes('/ai_usage_events'))return Response.json(null);
  if(String(url)==='https://api.openai.com/v1/chat/completions')return Response.json({choices:[{finish_reason:finish,message:{content:JSON.stringify(content)}}],usage:{prompt_tokens:10}},{status});
  throw Error('Unexpected '+url);
 };
 try{await run(calls);}finally{global.fetch=original;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);}
}
const body={store,version:7,prompt:'تصميم بسيط للمتجر'};
test('generation checks permissions, input, concurrency and rate limits',async()=>{
 await mock(async calls=>{await assert.rejects(generateStoreDesign({role:'client'},body),{status:403});await assert.rejects(generateStoreDesign(user,{...body,prompt:'a'}),{status:400});assert.equal(calls.length,0);});
 await mock(async calls=>{await assert.rejects(generateStoreDesign(user,body),{status:409});assert.equal(calls.length,1);},{version:8});
 await mock(async calls=>{await assert.rejects(generateStoreDesign(user,body),{status:429});assert.ok(!calls.some(c=>c.url.includes('api.openai.com')));},{allowed:false});
});
test('generation returns an editable proposal without writing draft or published settings',async()=>{
 await mock(async calls=>{const result=await generateStoreDesign(user,body);assert.equal(result.version,7);assert.equal(result.sections[0].type,'hero');assert.equal(result.sections[0].title,'تسوق منتجاتنا');assert.ok(calls.every(c=>c.method==='GET'||/consume_chat_rate_limit|ai_usage_events|api.openai.com/.test(c.url)));const provider=calls.find(c=>c.url.includes('api.openai.com'));assert.equal(provider.body.response_format.json_schema.strict,true);});
});
test('provider refusal, failure, truncation and malformed proposals leave settings untouched',async()=>{
 await mock(async()=>assert.rejects(generateStoreDesign(user,body),{status:429}),{status:429});
 await mock(async()=>assert.rejects(generateStoreDesign(user,body),{status:502}),{finish:'length'});
 await mock(async()=>assert.rejects(generateStoreDesign(user,body),{status:502}),{content:{sections:[]}});
});

test('product sections keep product photos visible without a section banner image',()=>{const out=validateDesign({...proposal,sections:[{...proposal.sections[0],type:'products',image:''}]},store,context);assert.equal(out.sections[0].showImage,true);});
