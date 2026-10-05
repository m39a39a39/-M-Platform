import {writeFile,mkdir} from 'node:fs/promises';
const headers={'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'};
const cards=[],errors=[];
const decode=s=>String(s||'').replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const cleanImage=raw=>{
  if(raw.startsWith('//'))raw='https:'+raw;
  const u=new URL(decode(raw));u.search='';u.hash='';
  return u.href.replace(/\.(\d+)x(\d+)\.(?=jpe?g|png|webp$)/i,'.').replace(/\.(jpe?g|png|webp)\.(?=jpe?g|png|webp$)/i,'.');
};
for(let page=21;page<=35;page++){
  const url='https://www.moxom.com.cn/collections/products-25?page='+page;
  try{
    const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
    if(!r.ok)throw new Error(String(r.status));
    const html=decode(await r.text());
    const re=/<div class="img pic_box"><a href="(\/products\/[^"]+)"[^>]*title="([^"]+)"[^>]*><img src="([^"]+)"/gi;
    let n=0;
    for(const m of html.matchAll(re)){
      const productUrl='https://www.moxom.com.cn'+decode(m[1]);
      if(cards.some(x=>x.url===productUrl))continue;
      cards.push({page,title:decode(m[2]).replace(/\s+/g,' ').trim(),url:productUrl,image:cleanImage(m[3])}); n++;
    }
    console.log('page',page,n);
  }catch(e){errors.push({page,error:e.message});}
  await new Promise(r=>setTimeout(r,500));
}
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-cards-21-35.json',JSON.stringify({generatedAt:new Date().toISOString(),count:cards.length,cards,errors},null,2));
console.log('cards',cards.length,'errors',errors.length);
