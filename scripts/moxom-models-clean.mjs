import {writeFile,mkdir} from 'node:fs/promises';

const headers={'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const decode=s=>String(s||'').replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const cleanText=s=>decode(s).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const cleanImage=raw=>{
  try{
    if(raw.startsWith('//'))raw='https:'+raw;
    const u=new URL(decode(raw));u.search='';u.hash='';
    let x=u.href.replace(/\.(\d+)x(\d+)\.(?=jpe?g|png|webp$)/i,'.').replace(/\.(jpe?g|png|webp)\.(?=jpe?g|png|webp$)/i,'.');
    return /ueeshop\.ly200-cdn\.com\/.*\/products\//i.test(x)&&/\.(?:jpe?g|png|webp)$/i.test(x)?x:'';
  }catch{return '';}
};
async function fetchText(url){
  let last;
  for(let attempt=0;attempt<5;attempt++){
    try{
      const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
      if(r.ok)return await r.text();
      last=new Error('HTTP '+r.status);
      if(![429,500,502,503,504].includes(r.status))throw last;
    }catch(e){last=e;}
    await sleep(2200*(attempt+1));
  }
  throw last||new Error('fetch failed');
}
const cards=[];
for(let page=1;page<=20;page++){
  try{
    const html=decode(await fetchText('https://www.moxom.com.cn/collections/products-25?page='+page));
    const re=/<div class="img pic_box"><a href="(\/products\/[^"]+)"[^>]*title="([^"]+)"[^>]*><img src="([^"]+)"/gi;
    for(const m of html.matchAll(re)){
      const url='https://www.moxom.com.cn'+decode(m[1]);
      if(cards.some(x=>x.url===url))continue;
      const image=cleanImage(m[3]);
      if(image)cards.push({page,title:cleanText(m[2]),url,cardImage:image});
    }
  }catch(e){console.error('collection',page,e.message)}
  await sleep(700);
}
console.log('cards',cards.length);
const items=[],errors=[];
for(let i=0;i<cards.length;i++){
  const card=cards[i];
  try{
    const html=decode(await fetchText(card.url));
    const plain=cleanText(html);
    const model=(plain.match(/Item\s*No\.?\s*:\s*([A-Za-z0-9._-]+(?:\s+(?:GM|Air))?)/i)||[])[1]?.trim()||'';
    const images=[card.cardImage];
    const h1i=Math.max(0,html.search(/<h1\b/i));
    const related=html.slice(h1i).search(/Related Products/i);
    const sec=html.slice(h1i,related>0?h1i+related:Math.min(html.length,h1i+650000));
    for(const m of sec.matchAll(/(?:https?:)?\/\/ueeshop\.ly200-cdn\.com\/[^"'<>\s\\]+/gi)){
      const img=cleanImage(m[0]); if(img&&!images.includes(img))images.push(img);
      if(images.length>=5)break;
    }
    if(model)items.push({...card,model,images});
    else errors.push({...card,error:'model_not_found'});
  }catch(e){errors.push({...card,error:String(e?.message||e)});}
  if((i+1)%20===0)console.log('processed',i+1,'ok',items.length,'err',errors.length);
  await sleep(1000);
}
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-models-clean.json',JSON.stringify({generatedAt:new Date().toISOString(),cards:cards.length,count:items.length,items,errors},null,2));
console.log('done',items.length,errors.length);
