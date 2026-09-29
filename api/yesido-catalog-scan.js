const BASE='https://www.iyesido.com';
const decode=s=>String(s||'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
const strip=s=>decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const abs=u=>{try{return new URL(decode(u),BASE).href}catch{return null}};
const original=u=>{try{const x=new URL(u);x.search='';return x.href}catch{return u}};
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 MPlatformCatalogAudit/1.0','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(12000)});
  if(!r.ok)throw new Error('HTTP '+r.status+' '+url);
  return await r.text();
}
function pageProducts(html){
  const found=new Map();
  const re=/<a\b([^>]*?)href=["']([^"']*\/pid\d+\/[^"']+\.htm)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const href=abs(m[2]); if(!href)continue;
    const attrs=(m[1]||'')+' '+(m[3]||'');
    const text=strip(m[4]);
    const title=strip((attrs.match(/\btitle=["']([^"']+)["']/i)||[])[1]||'');
    const alt=strip((m[4].match(/\balt=["']([^"']+)["']/i)||[])[1]||'');
    const label=text||title||alt;
    const sku=(label.match(/^([A-Za-z0-9._-]{1,80})(?:\s|$)/)||[])[1];
    if(!sku)continue;
    const key=href;
    const prev=found.get(key)||{sku,title:'',url:href};
    if(label.length>prev.title.length)prev.title=label;
    prev.sku=sku;
    found.set(key,prev);
  }
  return [...found.values()];
}
function detailImages(html,sku){
  const h1Match=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title=strip(h1Match?.[1]||'');
  const h1Index=h1Match?.index??0;
  const relatedOffset=html.slice(h1Index).search(/Related Products/i);
  const endIndex=relatedOffset>0?h1Index+relatedOffset:Math.min(html.length,h1Index+500000);
  const section=html.slice(h1Index,endIndex).replaceAll('\\/','/');
  const urls=[];
  const push=u=>{
    const clean=original(abs(u.startsWith('//')?'https:'+u:u));
    if(!clean||!/icdn\.tradew\.com\/file\//i.test(clean))return;
    if(!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(clean))return;
    if(/logo|icon|avatar|flag|qrcode|wechat/i.test(clean))return;
    if(!urls.includes(clean))urls.push(clean);
  };
  for(const m of section.matchAll(/(?:https?:)?\/\/icdn\.tradew\.com\/file\/[^"'<>\s\\]+/gi))push(m[0]);
  if(!urls.length){
    for(const m of section.matchAll(/(?:src|data-src|data-original|data-original-src|href)=["']([^"']+)["']/gi))push(m[1]);
  }
  return {title,images:urls.slice(0,12)};
}
async function pool(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function worker(){while(next<items.length){const i=next++;try{out[i]=await fn(items[i],i)}catch(e){out[i]={...items[i],detailError:String(e.message||e)}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out;
}
export default async function handler(req,res){
  try{
    const page=Math.max(1,Math.min(40,Number(req.query?.page||1)||1));
    const listUrl=page===1?`${BASE}/products-list.htm`:`${BASE}/p${page}/products-list.htm`;
    const html=await get(listUrl);
    const products=pageProducts(html);
    const withDetails=String(req.query?.details||'1')!=='0';
    const detailed=withDetails?await pool(products,8,async p=>{
      const d=detailImages(await get(p.url),p.sku);
      return {...p,title:d.title||p.title,images:d.images};
    }):products;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.status(200).json({page,listUrl,count:detailed.length,products:detailed});
  }catch(e){
    res.status(500).json({error:String(e.message||e)});
  }
}