import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {defaultStore} from '../../shared/storefront-model.mjs';
import {ensureThemePages} from '../../shared/theme-pages.mjs';

const settings={storefront:ensureThemePages(defaultStore()),categories:[],subcategories:[],supplyCountries:[],_version:1};
const users=Object.fromEntries(['admin','client','supplier'].map(role=>[role,{id:role,role,name:`${role} PERSON`,company:`${role} COMPANY`,email:`${role}@example.test`,isOwner:role==='admin'}]));
const pathFor={admin:'/admin.html',client:'/customer.html',supplier:'/supplier.html'};

for(const [engine,launcher] of Object.entries({chromium,webkit})){
 const browser=await launcher.launch({headless:true});
 for(const role of ['client','supplier','admin']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/http:\/\/127\.0\.0\.1:4173\/(?:customer|supplier|admin)$/,async route=>{const response=await route.fetch({url:'http://127.0.0.1:4173/'});await route.fulfill({response});});
  await page.route('https://m-platform-tan.vercel.app/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const bearer=(req.headers().authorization||'').replace('Bearer ','');
    let body={};
    if(path.endsWith('/auth/login'))body={user:users[role],tokens:{accessToken:role,refreshToken:'r-'+role}};
    else if(path.endsWith('/auth/logout'))body={ok:true};
    else if(path.endsWith('/state'))body={user:users[bearer]||null,requests:[],quotes:[],publicOffers:[],interests:[],accounts:bearer==='admin'?Object.values(users):bearer?[users[bearer]]:[],settings};
    else if(path.endsWith('/notifications'))body=[];
    else if(path.endsWith('/app-config'))body={apiVersion:1};
    else if(path.endsWith('/ai-conversation'))body={messages:[]};
    else return route.fulfill({status:404,json:{error:'unused test endpoint'}});
    await route.fulfill({json:body});
  });

  await page.goto('http://127.0.0.1:4173'+pathFor[role]);
  if(role==='admin'){
    await page.locator('#studio-login').waitFor({state:'visible'});
    await page.locator('#studio-login input[name="email"]').fill(role+'@example.test');
    await page.locator('#studio-login input[name="password"]').fill('fixture-password');
    await page.locator('#studio-login button').click();
    await page.locator('#content').waitFor({state:'visible'});
    assert.ok(await page.locator('.side').count()===1,'Admin dashboard shell missing');
    assert.ok((await page.locator('#content').textContent()).length>0,'Admin dashboard content missing');
  }else{
    await page.locator('#loginView').waitFor({state:'visible'});
    await page.locator('#email').fill(role+'@example.test');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#loginBtn').click();
    await page.locator('#appView').waitFor({state:'visible'});
    assert.equal(await page.locator('#bottomNav [data-screen="account"]').count(),1,role+' account navigation missing');
    if(role==='client')assert.equal(await page.locator('#headerCartBtn:not(.hidden)').count(),1,'Client cart header missing');
    await page.locator('#bottomNav [data-screen="account"]').click();
    assert.ok((await page.locator('#screen').textContent()).includes(role+' PERSON'),role+' account screen did not render identity');
    await page.locator('#screen [data-action="logout"]').click();
    await page.locator('#loginView').waitFor({state:'visible'});
  }
  assert.deepEqual(errors,[],role+' '+engine+' page errors: '+errors.join(' | '));
  await context.close();
 }
 await browser.close();
}
console.log('Current client/supplier/admin portal smoke passed');
