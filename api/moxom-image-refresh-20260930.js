const KEY='moxomfix-9f73c2e6';
const UA={'user-agent':'Mozilla/5.0 (compatible; MPlatform/1.0)','accept-language':'en-US,en;q=0.9'};
const fetchText=async url=>{
  try{
    const r=await fetch(url,{headers:UA,signal:AbortSignal.timeout(15000)});
    return {url,status:r.status,ok:r.ok,contentType:r.headers.get('content-type'),text:(await r.text()).slice(0,500000)};
  }catch(e){return {url,status:0,ok:false,error:String(e?.message||e),text:''};}
};
const cleanProductLinks=html=>[...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/\/products\//i.test(x)&&x!='/products/'))];
const absolute=u=>u.startsWith('http')?u:'https://www.moxom.com.cn'+(u.startsWith('/')?u:'/'+u);
const decodeHtml=s=>String(s||'').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
const originalCdn=u=>{
  let x=decodeHtml(u).replace(/^\/\//,'https://');
  x=x.replace(/\.(?:\d+x\d+|\d+x|x\d+)\.(jpe?g|png|webp)(?=$|[?#])/i,'.$1');
  return x;
};
const extractProductImages=html=>{
  const urls=[];
  for(const m of html.matchAll(/(?:https?:)?\/\/ueeshop\.ly200-cdn\.com\/u_file\/[^"'<>\s\\]+/gi)){
    let u=originalCdn(m[0]);
    if(!/\/products\//i.test(u))continue;
    u=u.replace(/[),;]+$/,'');
    if(!urls.includes(u))urls.push(u);
    if(urls.length>=12)break;
  }
  return urls;
};
const titleOf=html=>{
  const m=html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m?decodeHtml(m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()):'';
};
const exactSkuInPage=(html,sku)=>{
  const s=sku.replace(/[.*+?^(){}$|[\]\\]/g,'\\$&');
  return new RegExp('(?:Item\\s*No\\.?|Model|SKU)\\s*:?\\s*(?:<[^>]+>\\s*)*'+s+'(?:\\b|\\s|<)','i').test(html) ||
    new RegExp('\\b'+s+'\\b','i').test(html.replace(/<script[\s\S]*?<\/script>/gi,' '));
};
export default async function handler(req,res){
  if(req.query.key!==KEY)return res.status(404).json({ok:false});
  res.setHeader('Cache-Control','no-store');
  const q=String(req.query.q||'').trim();
  const sku=String(req.query.sku||'').trim();
  if(q&&sku){
    const search=await fetchText('https://www.moxom.com.cn/search/?Keyword='+encodeURIComponent(q));
    const links=cleanProductLinks(search.text).slice(0,20);
    const checked=[];
    for(const link of links){
      const page=await fetchText(absolute(link));
      const images=extractProductImages(page.text);
      const exact=page.ok&&exactSkuInPage(page.text,sku);
      checked.push({link,status:page.status,title:titleOf(page.text),exact,images:images.slice(0,5)});
      if(exact){
        const probes=[];
        for(const image of images.slice(0,5)){
          try{
            const r=await fetch(image,{method:'HEAD',headers:UA,signal:AbortSignal.timeout(10000)});
            probes.push({url:image,status:r.status,type:r.headers.get('content-type'),length:Number(r.headers.get('content-length')||0)});
          }catch(e){probes.push({url:image,status:0,error:String(e?.message||e)});}
        }
        return res.status(200).json({ok:true,sku,q,found:true,page:absolute(link),title:titleOf(page.text),images:images.slice(0,5),probes,checked});
      }
    }
    return res.status(200).json({ok:true,sku,q,found:false,searchStatus:search.status,checked});
  }
  if(q){
    const row=await fetchText('https://www.moxom.com.cn/search/?Keyword='+encodeURIComponent(q));
    const links=cleanProductLinks(row.text).slice(0,100);
    const pos=row.text.toUpperCase().indexOf(q.toUpperCase());
    const snippet=pos>=0?row.text.slice(Math.max(0,pos-2500),Math.min(row.text.length,pos+5000)):'';
    return res.status(200).json({ok:true,q,status:row.status,links,snippet});
  }
  const urls=['https://www.moxom.com.cn/robots.txt','https://www.moxom.com.cn/sitemap.xml','https://www.moxom.com.cn/sitemap_index.xml','https://www.moxom.com.cn/'];
  const rows=[];for(const u of urls)rows.push(await fetchText(u));
  const home=rows[3]?.text||'';
  const forms=[...home.matchAll(new RegExp('<form\\b[\\s\\S]*?<\\/form>','gi'))].map(m=>m[0]).filter(x=>/search/i.test(x)).slice(0,10);
  const links=[...home.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/search|product|sitemap/i.test(x)).slice(0,100);
  res.status(200).json({ok:true,rows:rows.map(r=>({...r,text:r.text.slice(0,20000)})),forms,links});
}