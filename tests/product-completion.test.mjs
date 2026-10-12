import test from 'node:test';
import assert from 'node:assert/strict';
import {productCopy} from '../backend/modules/product-copy.mjs';
import {completionImages,completionResult} from '../backend/modules/product-completion.mjs';
import {resolveProductTaxonomy} from '../backend/modules/product-taxonomy.mjs';
import {saveStudioProduct} from '../backend/modules/studio.mjs';
import {createStoreDB,withLocalAPI,ids,localRest} from './helpers/store-db.mjs';
const admin={id:ids.admin,role:'admin',is_owner:true};
const taxonomy={categories:[{id:'cat',nameAr:'شواحن',nameEn:'Chargers',active:true}],subcategories:[{id:'car',parentId:'cat',nameAr:'شواحن سيارات',nameEn:'Car chargers',active:true}]};
const source={titleAr:'شاحن AMAYA',titleEn:'AMAYA charger'};
const generated={titleAr:'شاحن AMAYA',titleEn:'AMAYA charger',descriptionAr:'شاحن من AMAYA.',descriptionEn:'A charger from AMAYA.',shortDescription:'شاحن AMAYA',technicalSpecs:'',options:'',evidence:[],categoryId:'cat',subcategoryId:'',newCategoryAr:'',newCategoryEn:'',newSubcategoryAr:'',newSubcategoryEn:''};
test('completion accepts no readable images and refuses arbitrary image URLs',()=>{
 assert.deepEqual(completionImages(undefined),[]);assert.throws(()=>completionImages(['https://private.test/image']));
 assert.throws(()=>completionImages(Array(4).fill('data:image/png;base64,AAAA')));
 const result=completionResult({...generated,technicalSpecs:'65W',options:'3 ports',shortDescription:'65W charger'},taxonomy,source);
 assert.equal(result.extra.technicalSpecs,'');assert.equal(result.extra.options,'');assert.equal(result.extra.shortDescription,'');assert.equal(result.taxonomy.categoryId,'cat');
 assert.equal(completionResult({...generated,technicalSpecs:'20W',evidence:['20W']},taxonomy,source).extra.technicalSpecs,'20W');
});
test('taxonomy reuses normalized bilingual names, respects parents and never grants creation privileges',()=>{
 const reused=resolveProductTaxonomy({role:'admin',permissions:['offers.edit']},taxonomy,{newCategory:{nameAr:'شَوَاحِن',nameEn:'CHARGERS'},newSubcategory:{nameAr:'شواحن سيارات',nameEn:'Car chargers'}});
 assert.equal(reused.categoryId,'cat');assert.equal(reused.subcategoryId,'car');assert.equal(reused.changed,false);
 assert.throws(()=>resolveProductTaxonomy({role:'admin',permissions:['offers.edit']},taxonomy,{newCategory:{nameAr:'كابلات',nameEn:'Cables'}}),{status:403});
 assert.throws(()=>resolveProductTaxonomy(admin,taxonomy,{categoryId:'other',subcategoryId:'car'}));
 assert.throws(()=>resolveProductTaxonomy(admin,taxonomy,{categoryId:'cat',newCategory:{nameAr:'كابلات',nameEn:'Cables'}}));
 const next=resolveProductTaxonomy(admin,taxonomy,{newCategory:{nameAr:'كابلات',nameEn:'Cables'},newSubcategory:{nameAr:'كابلات صوت',nameEn:'Audio cables'}});
 assert.equal(next.subcategories.at(-1).parentId,next.categoryId);assert.equal(next.changed,true);assert.equal(taxonomy.categories.length,1);
 const normalized=completionResult({...generated,categoryId:'invalid',newCategoryAr:'شواحن',newCategoryEn:'Chargers',subcategoryId:'car'},taxonomy,source);
 assert.equal(normalized.taxonomy.categoryId,'cat');assert.equal(normalized.taxonomy.newCategory,null);
});
test('completion uses high-detail inline images and taxonomy; unreadable images fall back to name without asking for more',async()=>{
 const old=global.fetch,env={...process.env},requests=[];
 Object.assign(process.env,{SUPABASE_URL:'https://fixture.test',SUPABASE_ANON_KEY:'a',SUPABASE_SERVICE_ROLE_KEY:'s',APP_ORIGIN:'https://app.test',OPENAI_API_KEY:'fixture'});
 global.fetch=async(url,options={})=>{
  if(String(url).includes('/settings?'))return Response.json([{id:'site',data:taxonomy}]);
  if(String(url).includes('consume_chat_rate_limit'))return Response.json({allowed:true});
  if(String(url).includes('ai_usage_events'))return Response.json(null);
  requests.push(JSON.parse(options.body));return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(generated)}}]});
 };
 try{
  const result=await productCopy(admin,{mode:'complete',source,images:['data:image/png;base64,AAAA']});
  assert.equal(result.proposal.technicalSpecs,'');assert.equal(result.proposal.titleAr,source.titleAr);assert.equal(result.needsMoreImages,undefined);
  assert.equal(requests[0].messages[1].content[1].image_url.detail,'high');assert.equal(JSON.parse(requests[0].messages[1].content[0].text).TAXONOMY_JSON.categories[0].id,'cat');
  const noImages=await productCopy(admin,{mode:'complete',source});assert.equal(noImages.proposal.titleEn,'AMAYA charger');
 }finally{global.fetch=old;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env);}
});
const product=id=>({id,version:0,name:'سماعة',nameEn:'Headphones',sku:'HP-'+id.slice(-5),description:'سماعة للاستخدام اليومي',descriptionEn:'Headphones for daily use',shortDescription:'',technicalSpecs:'',options:'',notes:'',categoryId:'ai-new-category',subcategoryId:'ai-new-subcategory',status:'active',price:35,currency:'SAR',moq:1,stock:10,leadDays:3,country:'China',images:[],tiers:[]});
test('new category, child and product save atomically; repeated approval reuses categories and preserves settings',async()=>{
 const pg=await createStoreDB();
 try{await withLocalAPI(pg,async()=>{
  await pg.exec(`update settings set data=data || '{"unrelated":"keep","studioDraft":{"categories":[],"products":[]}}'::jsonb`);
  const proposal={newCategory:{nameAr:'سماعات',nameEn:'Headphones'},newSubcategory:{nameAr:'سماعات سلكية',nameEn:'Wired headphones'}};
  const id='11111111-1111-4111-8111-111111111111';
  await saveStudioProduct(admin,{product:product(id),taxonomyProposal:proposal,redactionConfirmed:true});
  const row=(await pg.query('select data from public_offers where id=$1',[id])).rows[0].data,settings=(await pg.query('select data from settings')).rows[0].data;
  assert.equal(settings.unrelated,'keep');assert.equal(settings.categories.length,2);assert.equal(settings.subcategories.length,1);assert.equal(row.categoryId,settings.categories[1].id);assert.equal(row.subcategoryId,settings.subcategories[0].id);assert.equal(settings.studioDraft.categories.length,2);
  assert.equal(row.unitPrice,35);assert.equal(row.stock,'10');
  await saveStudioProduct(admin,{product:product('22222222-2222-4222-8222-222222222222'),taxonomyProposal:proposal,redactionConfirmed:true});
  assert.equal((await pg.query('select data from settings')).rows[0].data.categories.length,2);
 });}finally{await pg.close();}
});
test('failed product validation and concurrent settings conflicts leave no orphan category or product',async()=>{
 const pg=await createStoreDB();
 try{await withLocalAPI(pg,async()=>{
  const id='33333333-3333-4333-8333-333333333333',proposal={newCategory:{nameAr:'صوتيات',nameEn:'Audio'}};
  await assert.rejects(saveStudioProduct(admin,{product:{...product(id),subcategoryId:'',price:0},taxonomyProposal:proposal,redactionConfirmed:true}));
  assert.equal((await pg.query('select data from settings')).rows[0].data.categories.length,1);
  const old=global.fetch,rest=localRest(pg);let injected=false;
  global.fetch=async(url,opts)=>{if(String(url).includes('/rpc/commit_changes')&&!injected){injected=true;await pg.exec("update settings set version=version+1");}return rest(url,opts);};
  try{await assert.rejects(saveStudioProduct(admin,{product:{...product(id),subcategoryId:''},taxonomyProposal:proposal,redactionConfirmed:true}),{status:409});}finally{global.fetch=old;}
  assert.equal((await pg.query('select count(*)::int n from public_offers where id=$1',[id])).rows[0].n,0);
  assert.equal((await pg.query('select data from settings')).rows[0].data.categories.length,1);
 });}finally{await pg.close();}
});
