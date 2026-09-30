const KEY='moxomfix-9f73c2e6';
const fetchText=async url=>{
  try{
    const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; MPlatform/1.0)','accept-language':'en-US,en;q=0.9'},signal:AbortSignal.timeout(15000)});
    return {url,status:r.status,ok:r.ok,contentType:r.headers.get('content-type'),text:(await r.text()).slice(0,300000)};
  }catch(e){return {url,status:0,ok:false,error:String(e?.message||e),text:''};}
};
export default async function handler(req,res){
  if(req.query.key!==KEY)return res.status(404).json({ok:false});
  res.setHeader('Cache-Control','no-store');
  const q=String(req.query.q||'').trim();
  if(q){
    const row=await fetchText('https://www.moxom.com.cn/search/?Keyword='+encodeURIComponent(q));
    const links=[...row.text.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/\/products\//i.test(x));
    const uniq=[...new Set(links)].slice(0,100);
    const pos=row.text.toUpperCase().indexOf(q.toUpperCase());
    const snippet=pos>=0?row.text.slice(Math.max(0,pos-2500),Math.min(row.text.length,pos+5000)):'';
    return res.status(200).json({ok:true,q,status:row.status,links:uniq,snippet});
  }
  const urls=[
    'https://www.moxom.com.cn/robots.txt',
    'https://www.moxom.com.cn/sitemap.xml',
    'https://www.moxom.com.cn/sitemap_index.xml',
    'https://www.moxom.com.cn/',
  ];
  const rows=[];
  for(const u of urls)rows.push(await fetchText(u));
  const home=rows[3]?.text||'';
  const forms=[...home.matchAll(new RegExp('<form\\b[\\s\\S]*?<\\/form>','gi'))].map(m=>m[0]).filter(x=>/search/i.test(x)).slice(0,10);
  const links=[...home.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1]).filter(x=>/search|product|sitemap/i.test(x)).slice(0,100);
  res.status(200).json({ok:true,rows:rows.map(r=>({...r,text:r.text.slice(0,20000)})),forms,links});
}