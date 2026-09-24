// Isolated, disposable local preview. Never connects to a deployed database.
import http from 'node:http';
import {defaultStore} from '../shared/storefront-model.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createStoreDB,localRest,ids} from '../tests/helpers/store-db.mjs';
import {submitSupplySource,reviewSupplySource} from '../backend/modules/supply-sources.mjs';
import {snapshot} from '../backend/modules/records.mjs';
import {profile} from '../backend/modules/auth.mjs';
import {assignSupplier} from '../backend/modules/fulfillment.mjs';
import {createCartOrder} from '../backend/modules/cart-orders.mjs';
import {mutate} from '../backend/modules/mutations.mjs';
import {manageOrder} from '../backend/modules/order-management.mjs';
import {saveStudio} from '../backend/modules/studio.mjs';
const port=4194,origin=`http://127.0.0.1:${port}`,pg=await createStoreDB();
Object.assign(process.env,{SUPABASE_URL:'https://local-test.invalid',SUPABASE_ANON_KEY:'local',SUPABASE_SERVICE_ROLE_KEY:'local',APP_ORIGIN:origin});
global.fetch=localRest(pg);
const user=async key=>(await pg.query('select * from profiles where id=$1',[ids[key]])).rows[0];
const admin=await user('admin'),supplier=await user('supplier'),client=await user('client');
const terms={unitPrice:35,currency:'SAR',moq:2,stock:200,leadTime:7,country:'China'};
const proposal={sku:'SAMPLE-1',product:'منتج تجريبي للتوريد',specs:'مواصفات تجريبية للتحقق من عروض التوريد',categoryId:'cat',images:['/api/media/'+ids.media]};
const source=await submitSupplySource(supplier,{terms,proposal});
const approved=await reviewSupplySource(admin,{id:source.sourceId,version:1,action:'approve',salePrice:60,currency:'SAR',translation:{titleAr:proposal.product,titleEn:'Supply test product',descriptionAr:proposal.specs,descriptionEn:'Product specifications'},redactionConfirmed:true});
const sampleNames=[['حقيبة أعمال جلدية بمساحة تنظيم واسعة ومناسبة للرحلات والاجتماعات اليومية','Premium business bag with spacious compartments for travel and everyday meetings'],['دفتر','Notebook'],['سماعات لاسلكية','Wireless headphones']];
for(const [i,names] of sampleNames.entries()){
 const item=await submitSupplySource(supplier,{terms,proposal:{...proposal,sku:'SAMPLE-'+(i+2),product:names[0]}});
 await reviewSupplySource(admin,{id:item.sourceId,version:1,action:'approve',salePrice:75+i*20,currency:'SAR',translation:{titleAr:names[0],titleEn:names[1],descriptionAr:proposal.specs,descriptionEn:'Sample product'},redactionConfirmed:true});
}
const storefront=defaultStore();storefront.sections[0].image=proposal.images[0];storefront.sections.splice(1,0,{id:'categories',type:'categories',title:'تسوق حسب التصنيف',titleEn:'Shop by category',visible:true,channel:'both',categoryImages:{cat:proposal.images[0]}});
await pg.query("update settings set data=jsonb_set(data,'{storefront}',$1::jsonb) where id='site'",[JSON.stringify(storefront)]);
await createCartOrder(client,{items:[{offerId:approved.productId,quantity:4}],delivery:{name:'عميل الاختبار',phone:'12345',country:'السعودية',address:'عنوان تجريبي'}});
const root=fileURLToPath(new URL('../mobile-app/dist/',import.meta.url));
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6UAAAAABJRU5ErkJggg==','base64');
http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
 if(url.pathname.startsWith('/api/')){
  let text='';for await(const chunk of req){text+=chunk;if(text.length>8000000)throw Error('Too large');}const body=text?JSON.parse(text):{};
  const token=String(req.headers.authorization||'').replace('Bearer ','').replace('-fixture',''),known=['admin','supplier','other','client'];
  const current=known.includes(token)?await user(token):null;let result;
  if(url.pathname.endsWith('/auth/login')){const key=String(body.email).split('@')[0];if(!known.includes(key))throw Error('استخدم admin أو supplier أو other أو client مع @example.test');const u=await user(key);result={user:profile(u),tokens:{accessToken:key+'-fixture',refreshToken:key+'-fixture',expiresAt:Math.floor(Date.now()/1000)+3600,userId:u.id}};}
  else if(url.pathname.endsWith('/auth/logout'))result={ok:true};
  else if(url.pathname.endsWith('/state'))result=await snapshot(current);
  else if(url.pathname.includes('/media/')){res.setHeader('Content-Type','image/png');res.end(image);return;}
  else if(url.pathname.endsWith('/notifications'))result=[];
  else if(!current){res.statusCode=401;result={error:'سجّل الدخول إلى المعاينة'};}
  else if(url.pathname.endsWith('/supply-sources/submit'))result=await submitSupplySource(current,body);
  else if(url.pathname.endsWith('/supply-sources/review'))result=await reviewSupplySource(current,body);
  else if(url.pathname.endsWith('/orders/assign'))result=await assignSupplier(current,body);
  else if(url.pathname.endsWith('/cart-orders'))result=await createCartOrder(current,body);
  else if(url.pathname.endsWith('/mutations'))result=await mutate(current,body);
  else if(url.pathname.endsWith('/order-management'))result=await manageOrder(current,body);
  else if(url.pathname.endsWith('/studio'))result=await saveStudio(current,body);
  else if(url.pathname.endsWith('/uploads')){const id=crypto.randomUUID();await pg.query('insert into media(id,owner_id,path,mime) values($1,$2,$3,$4)',[id,current.id,'fixture/'+id,'image/png']);result={src:'/api/media/'+id};}
  else {res.statusCode=404;result={error:'هذا الإجراء خارج نطاق المعاينة'};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
 }
 const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));if(name.includes('..'))throw Error('Invalid path');
 const data=await readFile(root+name);res.setHeader('Content-Type',name.endsWith('.html')?'text/html':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'application/octet-stream');res.end(name.endsWith('.js')?data.toString().replaceAll('https://m-platform-tan.vercel.app',origin):data);
}catch(error){res.statusCode=error.status||500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:error.message}));}}).listen(port,'127.0.0.1',()=>console.log(`Local supplier preview: ${origin}/studio.html — admin@example.test or other@example.test; any test password.`));
