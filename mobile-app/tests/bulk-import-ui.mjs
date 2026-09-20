import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';

await mkdir('layout-results',{recursive:true});
const report=[];
for(const [engine,type] of Object.entries({chromium,webkit})) for(const language of ['ar','en']){
  const browser=await type.launch({headless:true});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>localStorage.setItem('CapacitorStorage.language',lang),language);
  const supplier={id:'supplier',role:'supplier',name:'QA Supplier',company:'QA Company',email:'supplier@example.test'};
  await page.route('https://m-platform-tan.vercel.app/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const auth=req.headers().authorization||'';
    let body={};
    if(path.endsWith('/auth/login'))body={user:supplier,tokens:{accessToken:'supplier',refreshToken:'refresh-supplier'}};
    else if(path.endsWith('/state'))body={user:auth?supplier:null,requests:[],quotes:[],publicOffers:[],interests:[],accounts:[],settings:{categories:[
      {id:'audio',nameAr:'سماعات',nameEn:'Audio',active:true,order:0},
      {id:'chargers',nameAr:'شواحن',nameEn:'Chargers',active:true,order:1}
    ]}};
    else if(path.endsWith('/notifications'))body=[];
    else if(path.endsWith('/app-config'))body={apiVersion:1};
    else return route.fulfill({status:500,json:{error:'Unexpected fixture endpoint '+path}});
    await route.fulfill({json:body});
  });
  try{
    await page.goto('http://127.0.0.1:4173');
    await page.locator('#guestLoginBtn').click();
    await page.locator('#email').fill('supplier@example.test');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#loginBtn').click();
    await page.locator('#appView').waitFor({state:'visible'});

    const bulkButton=page.locator('[data-action="bulk-public-import"]').first();
    await bulkButton.click();
    await page.locator('#bulkExcelFile').waitFor({state:'visible'});
    const geometry=await page.evaluate(()=>{
      const width=innerWidth;
      const visible=[...document.querySelectorAll('#modal *')].filter(el=>el.getClientRects().length);
      const outside=visible.filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > width+1;}).map(el=>({tag:el.tagName,cls:el.className,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));
      return {width,doc:document.documentElement.scrollWidth,outside};
    });
    assert.ok(geometry.doc<=geometry.width+1,'Bulk modal widened the document');
    assert.deepEqual(geometry.outside,[],'Bulk modal has horizontal overflow');

    const [download]=await Promise.all([
      page.waitForEvent('download'),
      page.locator('#bulkDownloadTemplate').click()
    ]);
    assert.equal(download.suggestedFilename(),'M-Platform-products-template.xlsx');
    const path=await download.path();
    assert.ok(path,'Template download path missing');
    await page.locator('#bulkExcelFile').setInputFiles(path);
    const expected=language==='ar'?'لم يتم العثور على منتجات داخل الملف.':'No products were found in the file.';
    await page.locator('#bulkFileMessage').filter({hasText:expected}).waitFor();

    await page.screenshot({path:`layout-results/${engine}-${language}-bulk-import.png`,fullPage:false});
    assert.deepEqual(errors,[]);
    report.push({engine,language,pass:true});
    console.log(`PASS ${engine}-${language}: bulk import modal, template download, template re-read, mobile width`);
  }catch(error){
    report.push({engine,language,pass:false,error:error.stack});
    console.error(error);
    await page.screenshot({path:`layout-results/${engine}-${language}-bulk-import-failure.png`,fullPage:false}).catch(()=>{});
  }finally{
    await context.close();
    await browser.close();
  }
}
assert.ok(report.every(x=>x.pass),'Bulk import UI regression failed');
