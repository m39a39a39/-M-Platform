import {writeFile, mkdir} from 'node:fs/promises';

const plans = {
  'smart-watch':2,
  'speaker':3,
  'bluetooth-earphone-22':4,
  'stands':7,
  'power-banks-11':5,
  'wireless-chargers':4,
  'mouse':3,
  'hub':3,
  'air-pump':2,
  'phone-cooler':2,
  'car-chargers':4,
  'pen':2,
  'travel-adapter':3
};
const headers={'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'};
const fetchText=async url=>{
  const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw new Error(`${r.status} ${url}`);
  return await r.text();
};
const decode=s=>String(s||'').replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const cleanText=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const links=[];
for(const [category,pages] of Object.entries(plans)){
  for(let page=1;page<=pages;page++){
    try{
      const html=decode(await fetchText(`https://www.moxom.com.cn/collections/${category}?page=${page}`));
      for(const m of html.matchAll(/href=["'](\/products\/[A-Za-z0-9_%().,+&=\-]+)["']/gi)){
        const url='https://www.moxom.com.cn'+m[1].replace(/&amp;/g,'&');
        if(!links.some(x=>x.url===url))links.push({category,url});
      }
    }catch(e){console.error('collection',category,page,e.message)}
  }
}
console.log('product links',links.length);

const rows=new Array(links.length);let next=0;
async function worker(){
  while(next<links.length){
    const i=next++, item=links[i];
    try{
      const html=decode(await fetchText(item.url));
      const plain=cleanText(html);
      const model=(plain.match(/Item\s*No\.?\s*:\s*([A-Za-z0-9._-]+(?:\s+(?:Air|GM))?)/i)||[])[1]?.trim()||'';
      const title=cleanText((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||'');
      const images=[];
      for(const m of html.matchAll(/(?:https?:)?\/\/ueeshop\.ly200-cdn\.com\/[^"'<>\s\\]+/gi)){
        let raw=decode(m[0]); if(raw.startsWith('//'))raw='https:'+raw;
        try{
          const u=new URL(raw);u.search='';u.hash='';
          let clean=u.href.replace(/\.\d+x\d+(?=\.(?:jpe?g|png|webp)$)/i,'');
          if(!/\.(?:jpe?g|png|webp)$/i.test(clean))continue;
          if(!images.includes(clean))images.push(clean);
        }catch{}
        if(images.length>=6)break;
      }
      rows[i]={category:model?item.category:'',model,title,url:item.url,images};
    }catch(e){rows[i]={category:item.category,url:item.url,error:e.message}}
    if(i%25===0)console.log('processed',i,'/',links.length);
  }
}
await Promise.all(Array.from({length:10},worker));
const ok=rows.filter(x=>x?.model&&x?.images?.length>=2);
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-featured-crawl.json',JSON.stringify({generatedAt:new Date().toISOString(),links:links.length,ok:ok.length,items:ok,diagnostic:rows.slice(0,5)},null,2));
console.log('verified',ok.length);
