import {writeFile,mkdir} from 'node:fs/promises';

const plans=[
 ['smart-watch',2,14],
 ['power-banks-11',4,14],
 ['bluetooth-earphone-22',5,14],
 ['ows-or-tws-wireless-earphone',3,10],
 ['speaker',4,12],
 ['stands',6,14],
 ['wireless-chargers-12',4,10],
 ['car-chargers-10',4,10],
 ['mouse',3,6],
 ['hub',3,6],
 ['phone-cooler',2,5],
 ['air-pump',2,5],
 ['pen',2,5],
 ['socket',3,6]
];
const headers={'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const fetchText=async url=>{
  let last;
  for(let attempt=0;attempt<5;attempt++){
    try{
      const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
      if(r.ok)return await r.text();
      last=new Error(`${r.status} ${url}`);
      if(![429,500,502,503,504].includes(r.status))throw last;
    }catch(e){last=e;}
    await sleep(800*(attempt+1));
  }
  throw last||new Error('fetch_failed '+url);
};
const decode=s=>String(s||'').replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const cleanText=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const cleanImage=raw=>{
  try{
    if(raw.startsWith('//'))raw='https:'+raw;
    const u=new URL(decode(raw));u.search='';u.hash='';
    let x=u.href.replace(/\.(\d+)x(\d+)\.(?=jpe?g|png|webp$)/i,'.');
    x=x.replace(/\.(jpe?g|png|webp)\.(?=jpe?g|png|webp$)/i,'.');
    return /ueeshop\.ly200-cdn\.com\/.*\/products\//i.test(x)&&/\.(?:jpe?g|png|webp)$/i.test(x)?x:'';
  }catch{return '';}
};
const cards=[];
for(const [category,pages,quota] of plans){
  let got=0;
  for(let page=1;page<=pages && got<quota;page++){
    try{
      const html=decode(await fetchText(`https://www.moxom.com.cn/collections/${category}?page=${page}`));
      const re=/<div class="img pic_box"><a href="(\/products\/[^"]+)"[^>]*title="([^"]+)"[^>]*><img src="([^"]+)"/gi;
      for(const m of html.matchAll(re)){
        const url='https://www.moxom.com.cn'+decode(m[1]);
        if(cards.some(x=>x.url===url))continue;
        const image=cleanImage(m[3]);
        cards.push({category,url,title:cleanText(m[2]),cardImage:image});
        got++; if(got>=quota)break;
      }
    }catch(e){console.error('collection',category,page,e.message)}
    await sleep(500);
  }
  console.log('cards',category,got);
}
console.log('selected cards',cards.length);

const items=[],errors=[];
for(let i=0;i<cards.length;i++){
  const card=cards[i];
  try{
    const html=decode(await fetchText(card.url));
    const plain=cleanText(html);
    const model=(plain.match(/Item\s*No\.?\s*:\s*([A-Za-z0-9._-]+(?:\s+(?:Air|GM))?)/i)||[])[1]?.trim()||'';
    const images=[];
    if(card.cardImage)images.push(card.cardImage);
    for(const m of html.matchAll(/(?:https?:)?\/\/ueeshop\.ly200-cdn\.com\/[^"'<>\s\\]+/gi)){
      const clean=cleanImage(decode(m[0])); if(!clean)continue;
      if(!images.includes(clean))images.push(clean);
      if(images.length>=5)break;
    }
    if(model&&images.length>=2)items.push({...card,model,images});
    else errors.push({...card,model,imageCount:images.length,error:'incomplete'});
  }catch(e){errors.push({...card,error:e.message});}
  if((i+1)%10===0)console.log('processed',i+1,'verified',items.length,'errors',errors.length);
  await sleep(900);
}
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-featured-crawl.json',JSON.stringify({
  generatedAt:new Date().toISOString(),cards:cards.length,ok:items.length,errors:errors.length,items,errorSamples:errors.slice(0,20)
},null,2));
console.log('verified',items.length);
