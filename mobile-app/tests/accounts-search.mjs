import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('layout-results',{recursive:true});
const report=[];
for(const [engine,type] of Object.entries({chromium,webkit}))for(const language of ['ar','en']){
 const browser=await type.launch();
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[],registrations=[];let failState=false,confirm=false,logins=0;
 const users=Object.fromEntries(['admin','client','supplier'].map(role=>[role,{id:role,role,name:`${role} PERSON`,company:`${role} COMPANY`,email:`${role}@example.test`,isOwner:role==='admin'}]));
 const requests=[{id:'admin-private',displayNo:501,product:'SecretAdmin',status:'review',customerId:'client',supplierIds:['supplier'],images:[],version:1}];
 const quotes=[{id:'offer1',displayNo:601,product:'Alpha',status:'pending',supplierId:'supplier',requestId:'admin-private',images:[]}];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(lang=>localStorage.setItem('CapacitorStorage.language',lang),language);
 await page.route('https://m-platform-tan.vercel.app/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;
   const role=(req.headers().authorization||'').replace('Bearer ','');
   let body={};
   if(path.endsWith('/auth/login')){logins++;const id=req.postDataJSON().email.split('@')[0];body={user:users[id],tokens:{accessToken:id,refreshToken:`r-${id}`}};}
   else if(path.endsWith('/auth/register')){const data=req.postDataJSON();registrations.push(data);body=confirm?{confirmationRequired:true}:{tokens:{accessToken:data.role,refreshToken:`r-${data.role}`}};}
   else if(path.endsWith('/auth/logout'))body={ok:true};
   else if(path.endsWith('/state')){
     if(role&&failState)return route.fulfill({status:503,json:{error:'Unavailable'}});
     body={user:users[role]||null,requests:role==='admin'?requests:[],quotes:role==='admin'?quotes:[],publicOffers:[],interests:[],accounts:role==='admin'?Object.values(users):[]};
   }else if(path.endsWith('/notifications'))body=[];
   else if(path.endsWith('/app-config'))body={apiVersion:1};
   else {errors.push(`Unexpected endpoint ${path}`);return route.fulfill({status:500,json:{error:'Unexpected fixture call'}});}
   await route.fulfill({json:body});
 });
 const nav=async screen=>{await page.locator(`#bottomNav [data-screen="${screen}"]`).click();};
 const login=async role=>{await page.locator('#guestLoginBtn').click();await page.locator('#email').fill(`${role}@example.test`);await page.locator('#password').fill('fixture-password');await page.locator('#loginBtn').click();await page.locator('#appView').waitFor({state:'visible'});};
 const logout=async()=>{if(await page.locator('#bottomNav [data-screen="more"]:visible').count()){await nav('more');await page.locator('[data-admin-more-tab="settings"]').click();}else await nav('account');await page.locator('#screen [data-action="logout"]').click();await page.locator('#guestView').waitFor({state:'visible'});assert.equal(await page.locator('#screen').innerText(),'');};
 try{
  await page.goto('http://127.0.0.1:4173');await login('admin');await nav('offers');
  const input=page.locator('[data-admin-search]');await input.focus();
  await input.evaluate(el=>{window.originalSearch=el;window.searchBlurCount=0;el.addEventListener('blur',()=>window.searchBlurCount++);});
  for(const character of 'Alpha'){
    await page.keyboard.insertText(character);
    // Wait past debounce: the old implementation replaced the field on every input.
    await page.waitForTimeout(180);
    assert.equal(await input.evaluate(el=>document.activeElement===el&&window.originalSearch===el),true,'Search node or focus changed');
  }
  assert.equal(await input.inputValue(),'Alpha');assert.equal(await page.evaluate(()=>window.searchBlurCount),0);
  assert.equal(await page.locator('[data-admin-results] article').count(),1);
  await input.fill('does-not-exist');await page.waitForTimeout(180);assert.equal(await page.locator('[data-admin-results] article').count(),0);
  await nav('more');assert.equal(await input.inputValue(),'');assert.equal(await page.locator('[data-admin-account]').count(),1);
  await input.fill('client');await page.waitForTimeout(180);assert.equal(await page.locator('[data-admin-account]').count(),1);
  await page.locator('[data-admin-more-tab="suppliers"]').click();assert.equal(await input.inputValue(),'');assert.equal(await page.locator('[data-admin-account]').count(),1);
  await nav('requests');assert.equal(await input.inputValue(),'');
  await nav('offers');assert.equal(await input.inputValue(),'does-not-exist');
  await page.locator('[data-admin-offer-filter="all"]').click();await page.waitForTimeout(180);assert.equal(await input.inputValue(),'');
  await page.screenshot({path:`layout-results/${engine}-${language}-independent-search.png`});
  await logout();
  for(const role of ['client','supplier']){
    await login(role);
    const roleScreens=role==='client'?['home','requests','offers','account']:['home','requests','offers','account'];
    if(role==='client'){assert.equal(await page.locator('#bottomNav [data-screen="offers"]:visible').count(),1);assert.equal(await page.locator('#bottomNav [data-screen="notifications"]:visible').count(),0);assert.equal(await page.locator('#headerNotificationsBtn:not(.hidden)').count(),1);}
    for(const screen of roleScreens){
      await nav(screen);assert.equal(await page.locator('[data-admin-root]').count(),0);
      assert.equal((await page.locator('#screen').innerText()).includes('SecretAdmin'),false);
    }
    assert.ok((await page.locator('#screen').innerText()).includes(`${role} PERSON`));
    await logout();
  }
  await login('admin');await nav('offers');assert.equal(await input.inputValue(),'');await logout();
  // Both registration roles stay inside the same app and send the existing API contract.
  for(const role of ['client','supplier']){
    await page.locator(role==='client'?'#guestCustomerRegister':'#guestSupplierRegister').click();
    await page.locator('#registerView').waitFor({state:'visible'});
    for(const [field,value] of Object.entries({Name:'Test Person',Company:'Test Company',Email:`new-${role}@example.test`,Phone:'+971500000000',Country:'UAE',Password:'fixture-password',Confirm:'wrong-password'}))await page.locator(`#register${field}`).fill(value);
    if(role==='supplier')await page.locator('#registerCategory').fill('Electronics');
    const count=registrations.length;
    await page.locator('#registerBtn').click();await page.waitForTimeout(150);assert.equal(registrations.length,count);
    await page.locator('#registerConfirm').fill('fixture-password');
    await page.screenshot({path:`layout-results/${engine}-${language}-register-${role}.png`});
    await page.locator('#registerBtn').click();await page.locator('#appView').waitFor({state:'visible'});
    assert.equal(registrations.at(-1).role,role);assert.equal('confirmPassword' in registrations.at(-1),false);
    assert.equal(context.pages().length,1);assert.equal(page.url(),'http://127.0.0.1:4173/');await logout();
  }
  // Successful login + data outage must allow retry without submitting credentials again.
  failState=true;await page.locator('#guestLoginBtn').click();await page.locator('#email').fill('client@example.test');await page.locator('#password').fill('fixture-password');await page.locator('#loginBtn').click();
  await page.locator('#sessionView').waitFor({state:'visible'});const loginCount=logins;
  assert.equal(await page.locator('#password').inputValue(),'');
  failState=false;await page.locator('#sessionRetryBtn').click();await page.locator('#appView').waitFor({state:'visible'});assert.equal(logins,loginCount);await logout();
  confirm=true;await page.locator('#guestCustomerRegister').click();
  for(const [field,value] of Object.entries({Name:'New Person',Email:'confirm@example.test',Phone:'+971500000000',Country:'UAE',Password:'fixture-password',Confirm:'fixture-password'}))await page.locator(`#register${field}`).fill(value);
  await page.locator('#registerBtn').click();await page.locator('#loginView').waitFor({state:'visible'});assert.equal(await page.locator('#email').inputValue(),'confirm@example.test');
  // Web testing never persists tokens in unencrypted browser storage.
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('refreshToken')),false);
  assert.deepEqual(errors,[]);report.push({engine,language,pass:true});console.log(`PASS ${engine}-${language}: typing focus, page search isolation, role switching, registration, retry, confirmation`);
 }catch(error){report.push({engine,language,pass:false,error:error.stack});console.error(error);await page.screenshot({path:`layout-results/${engine}-${language}-accounts-failure.png`});}
 finally{await context.close();await browser.close();}
}
await writeFile('layout-results/accounts-report.json',JSON.stringify(report,null,2));
assert.ok(report.every(x=>x.pass),'Account/search regression failed');
