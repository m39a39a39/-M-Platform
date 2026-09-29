const KEY='moxom-resolve-20260929';
const MODELS=['MX-HC356','MX-HC343','MX-HC327','MX-HC306','MX-HC311','MX-HC288','MX-HC204','MX-HC345','MX-ST31','MX-ST36','MX-ST23','MX-ST26','MX-VC56','MX-VC55','MX-VC53','MX-VC52','MX-VC34','MX-CB383','MX-CB393','MX-CB404','MX-CB409','MX-CB352','MX-CB408','MX-CB396'];
const base='https://www.moxom.com.cn';
async function get(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0','accept-language':'en-US,en;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(20000)});return {ok:r.ok,status:r.status,url:r.url,text:await r.text()};}
function links(html){
  const out=[];
  for(const m of html.matchAll(/href=["']([^"']*\/products\/[^"'?#]+)[^"']*["']/gi)){
    try{const u=new URL(m[1],base).href;if(!out.includes(u))out.push(u);}catch{}
  }
  return out;
}
function exactModel(html,model){
  const plain=html.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
  const esc=model.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
  return new RegExp('(?:Item\\s*No\\.?|Model(?:\\s*No\\.?)?|Model)\\s*[:：]?\\s*'+esc+'(?:\\b|\\s)','i').test(plain)
    || new RegExp('\\b'+esc+'\\b','i').test(plain);
}
function imgs(html){
  const out=[];
  const push=x=>{try{let u=x.replace(/&amp;/g,'&');if(u.startsWith('//'))u='https:'+u;u=new URL(u,base).href;if(!/^https?:/i.test(u))return;if(!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(u))return;if(/logo|icon|avatar|flag|loading|blank/i.test(u))return;if(!out.includes(u))out.push(u);}catch{}};
  for(const m of html.matchAll(/<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/gi))push(m[1]);
  for(const m of html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["'][^>]*>/gi))push(m[1]);
  for(const m of html.matchAll(/(?:data-original|data-src|src)=["']([^"']+)["']/gi))push(m[1]);
  return out.slice(0,20);
}
async function resolve(model){
  const s=await get(base+'/search/?Keyword='+encodeURIComponent(model));
  const cand=links(s.text).slice(0,8);
  const pages=await Promise.all(cand.map(async url=>{try{const p=await get(url);return {url:p.url,status:p.status,exact:exactModel(p.text,model),title:(p.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g,' ').trim()||'',images:imgs(p.text)};}catch(e){return {url,status:0,exact:false,error:String(e.message||e),images:[]};}}));
  return {model,searchStatus:s.status,candidates:cand.length,exact:pages.filter(x=>x.exact)};
}
export default async function handler(req,res){if(String(req.query?.key||'')!==KEY){res.status(404).json({error:'Not found'});return;}try{const start=Math.max(0,Number(req.query?.start||0)||0),count=Math.max(1,Math.min(8,Number(req.query?.count||6)||6));const subset=MODELS.slice(start,start+count);const results=[];for(const model of subset)results.push(await resolve(model));res.status(200).json({start,count:subset.length,results});}catch(e){res.status(500).json({error:String(e.message||e)});}}