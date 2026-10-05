import {writeFile,mkdir} from 'node:fs/promises';
const plans=[
 ['smart-watch',3],['power-banks-11',5],['bluetooth-earphone-22',5],['ows-or-tws-wireless-earphone',4],
 ['speaker',5],['stands',7],['wireless-chargers-12',4],['car-chargers-10',4],['mouse',3],['hub',3],
 ['phone-cooler',3],['air-pump',3],['pen',3],['socket',4],['products-25',6]
];
const headers={'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fetchText=async url=>{
  let last;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
      if(r.ok)return await r.text();
      last=new Error(`${r.status} ${url}`);
      if(![429,500,502,503,504].includes(r.status))throw last;
    }catch(e){last=e;}
    await sleep(700*(attempt+1));
  }
  throw last||new Error('fetch_failed '+url);
};
const decode=s=>String(s||'').replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const cleanImage=raw=>{
  try{
    if(raw.startsWith('//'))raw='https:'+raw;
    const u=new URL(decode(raw));u.search='';u.hash='';
    let x=u.href.replace(/\.(\d+)x(\d+)\.(?=jpe?g|png|webp$)/i,'.').replace(/\.(jpe?g|png|webp)\.(?=jpe?g|png|webp$)/i,'.');
    return /ueeshop\.ly200-cdn\.com\/.*\/products\//i.test(x)&&/\.(?:jpe?g|png|webp)$/i.test(x)?x:'';
  }catch{return '';}
};
const cards=[], errors=[];
for(const [category,pages] of plans){
  for(let page=1;page<=pages;page++){
    const url=`https://www.moxom.com.cn/collections/${category}?page=${page}`;
    try{
      const html=decode(await fetchText(url));
      const re=/<div class="img pic_box"><a href="(\/products\/[^"]+)"[^>]*title="([^"]+)"[^>]*><img src="([^"]+)"/gi;
      let n=0;
      for(const m of html.matchAll(re)){
        const productUrl='https://www.moxom.com.cn'+decode(m[1]);
        if(cards.some(x=>x.url===productUrl))continue;
        const image=cleanImage(m[3]); if(!image)continue;
        cards.push({category,page,title:decode(m[2]).replace(/\s+/g,' ').trim(),url:productUrl,image});
        n++;
      }
      console.log(category,page,n);
    }catch(e){errors.push({category,page,url,error:e.message});}
    await sleep(400);
  }
}
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-cards.json',JSON.stringify({generatedAt:new Date().toISOString(),count:cards.length,cards,errors},null,2));
console.log('cards',cards.length,'errors',errors.length);
