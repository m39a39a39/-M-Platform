import {readFile,writeFile,mkdir} from 'node:fs/promises';
const source=JSON.parse(await readFile('tmp/moxom-latest-cards.json','utf8'));
const cards=(source.cards||[]).slice(0,165);
const headers={'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clean=s=>String(s||'').replaceAll('\\/','/').replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&#39;',"'");
const cleanImage=raw=>{
  try{
    if(raw.startsWith('//'))raw='https:'+raw;
    const u=new URL(clean(raw));u.search='';u.hash='';
    let x=u.href.replace(/\.(\d+)x(\d+)\.(?=jpe?g|png|webp$)/i,'.').replace(/\.(jpe?g|png|webp)\.(?=jpe?g|png|webp$)/i,'.');
    return /ueeshop\.ly200-cdn\.com\/.*\/products\//i.test(x)&&/\.(?:jpe?g|png|webp)$/i.test(x)?x:'';
  }catch{return '';}
};
async function fetchPage(url){
  let last;
  for(let attempt=0;attempt<4;attempt++){
    try{
      const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
      if(r.ok)return await r.text();
      last=new Error('HTTP '+r.status);
      if(r.status===429||r.status>=500)await sleep(3500*(attempt+1)); else throw last;
    }catch(e){last=e;await sleep(2500*(attempt+1));}
  }
  throw last||new Error('fetch failed');
}
const items=[],errors=[];
for(let i=0;i<cards.length;i++){
  const card=cards[i];
  try{
    const html=clean(await fetchPage(card.url));
    const plain=html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    const model=(plain.match(/Item\s*No\.?\s*:\s*([A-Za-z0-9._-]+(?:\s+(?:GM|Air))?)/i)||[])[1]?.trim()||'';
    const images=[]; if(card.image)images.push(card.image);
    const h1i=Math.max(0,html.search(/<h1\b/i));
    const rel=html.slice(h1i).search(/Related Products/i);
    const sec=html.slice(h1i,rel>0?h1i+rel:Math.min(html.length,h1i+650000));
    for(const m of sec.matchAll(/(?:https?:)?\/\/ueeshop\.ly200-cdn\.com\/[^"'<>\s\\]+/gi)){
      const img=cleanImage(m[0]); if(img&&!images.includes(img))images.push(img);
      if(images.length>=5)break;
    }
    if(model)items.push({...card,model,images});
    else errors.push({...card,error:'model_not_found'});
  }catch(e){errors.push({...card,error:String(e?.message||e)});}
  if((i+1)%10===0)console.log(i+1,'ok',items.length,'err',errors.length);
  await sleep(1500);
}
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-latest-models.json',JSON.stringify({generatedAt:new Date().toISOString(),count:items.length,items,errors},null,2));
console.log('done',items.length,errors.length);
