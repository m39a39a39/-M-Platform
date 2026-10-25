import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base='http://127.0.0.1:4173';
for(const engine of [chromium,webkit]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[],submissions=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/v1/auth/reset',async route=>{
   submissions.push(route.request().postDataJSON());
   await route.fulfill({json:{ok:true}});
  });
  const token='test-invitation-access-token-with-acceptable-length';
  await page.goto(base+'/#access_token='+token+'&type=invite',{waitUntil:'domcontentloaded'});
  await page.waitForURL(url=>url.pathname==='/reset-password.html');
  await page.locator('#resetForm').waitFor();
  await page.locator('[name=password]').fill('ExamplePass1234!');
  await page.locator('[name=confirm]').fill('ExamplePass1234!');
  await page.locator('#resetForm button').click();
  await page.locator('#message').getByText('تم تفعيل حساب الإدارة', {exact:false}).waitFor();
  assert.deepEqual(submissions,[{accessToken:token,password:'ExamplePass1234!'}]);
  assert.equal(await page.locator('#resetForm').isVisible(),false);
  await page.goto(base+'/reset-password.html#access_token='+token+'&type=recovery');
  await page.locator('#resetForm').waitFor();
  assert.equal(await page.locator('#resetForm').isVisible(),true);
  await page.goto(base+'/reset-password.html#type=invite&access_token=short');
  assert.equal(await page.locator('#resetForm').isVisible(),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
}
console.log('Invite acceptance, recovery and expired-link UI passed on Chromium and WebKit.');
