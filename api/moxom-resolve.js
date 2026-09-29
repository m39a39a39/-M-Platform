const KEY='moxom-resolve-20260929';
const ITEMS=[
['MX-HC356','GaN PD65W QC22.5W Dual Port Fast Charger UK Plug'],['MX-HC343','PD45W TFT Display Touch Screen Single Type-C Port UK Charger'],['MX-HC327','PD45W AVS60W Fast Charger UK Plug Single Type-C Output'],['MX-HC306','GaN PD45W QC18W UK Travel Charger'],['MX-HC311','GaN PD35W Universal Converter Charger'],['MX-HC288','GaN 25W Ultra-thin Fast Charging Travel Charger'],['MX-HC204','PD35W Worldwide Travel Adapter'],['MX-HC345','25W Ultra-thin Magnetic Charger'],['MX-ST31','5-IN-1 Multifunctional Folding Wireless Charging Station'],['MX-ST36','PD20W QC18W 2M Fierce 9-In-1 Power Strip'],['MX-ST23','12 IN 1 PD Power Strip'],['MX-ST26','Disc PD20W QC18W 6 IN 1 Power Strip 3M'],['MX-VC56','95W TFT Digital Display Screen Car Charger'],['MX-VC55','75W Type-C USB-A Dual-Port Output Car Charger'],['MX-VC53','45W Super Fast Charging Retractable Car Charger'],['MX-VC52','Multifunctional Fast-Charging Car Charger'],['MX-VC34','RGB Magnetic 15W Car Charger'],['MX-CB383','Zinc Alloy Shell Dot Matrix Screen 240W Fast Charging Data Cable'],['MX-CB393','100W Super Fast Charging Horizontal-screen Digital-display Aluminum Alloy Data Cable'],['MX-CB404','1m 100W Nylon Woven Fast Charging Data Cable'],['MX-CB409','PD 60W Original Fast Data Cable Type-C to Type-C 1M'],['MX-CB352','240W Water Cube Series Data Cable Type-C to Type-C'],['MX-CB408','Smart Auto Eject Charger Protector'],['MX-CB396','Multifunctional Travel Charging Cable Storage Case']
];
const KNOWN={
'MX-HC343':'https://www.moxom.com.cn/products/pd45w-tft-display-touch-screen-single-type-c-port-uk-charger',
'MX-HC306':'https://www.moxom.com.cn/products/gan-pd45wqc18w-uk-travel-charger',
'MX-VC56':'https://www.moxom.com.cn/products/95w-tft-digital-display-screen-car-charger',
'MX-VC55':'https://www.moxom.com.cn/products/75w-type-c--usb-a-dual-port-output-car-charger',
'MX-VC52':'https://www.moxom.com.cn/products/multifunctional-fast-charging-car-charger',
'MX-CB408':'https://www.moxom.com.cn/products/smart-auto-eject-charger-protector',
'MX-CB396':'https://www.moxom.com.cn/products/multifunctional-travel-charging-cable-storage-case'
};
const base='https://www.moxom.com.cn';
const stop=new Set(['the','and','with','for','to','of','a','an','fast','charging','charger','data','cable','uk','type','port','output','plug']);
const tok=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(x=>x.length>1&&!stop.has(x));
async function get(url){const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0','accept-language':'en-US,en;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(20000)});return {status:r.status,url:r.url,text:await r.text()};}
function exactModel(html,model){
 const plain=html.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
 const esc=model.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
 return new RegExp('(?:Item\\s*No\\.?|Model(?:\\s*No\\.?)?|Model)\\s*[:：]?\\s*'+esc+'(?:\\b|\\s)','i').test(plain)||new RegExp('\\b'+esc+'\\b','i').test(plain);
}
function imageUrls(html){
 const out=[];
 const push=x=>{try{let u=x.replace(/&amp;/g,'&');if(u.startsWith('//'))u='https:'+u;u=new URL(u,base);if(!/\/products\//i.test(u.pathname))return;if(!/\.(?:jpe?g|png|webp)(?:\.|$)/i.test(u.pathname))return;u.search='';u.pathname=u.pathname.replace(/\.(?:240x240|500x500)\.(jpg|jpeg|png|webp)$/i,'.$1');const href=u.href;if(!out.includes(href))out.push(href);}catch{}};
 for(const m of html.matchAll(/(?:data-original|data-src|src|content)=["']([^"']+)["']/gi))push(m[1]);
 return out.slice(0,5);
}
function sitemapUrls(xml){return [...xml.matchAll(/<loc>(https?:\/\/[^<]+\/products\/[^<]+)<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,'&'));}
function score(url,title){const u=new URL(url),slug=tok(u.pathname.split('/').pop()),want=tok(title);const set=new Set(slug);let hits=0;for(const w of want)if(set.has(w))hits++;return want.length?hits/want.length:0;}
async function resolve(model,title,allUrls){
 const urls=KNOWN[model]?[KNOWN[model]]:allUrls.map(url=>({url,score:score(url,title)})).filter(x=>x.score>.28).sort((a,b)=>b.score-a.score).slice(0,5).map(x=>x.url);
 const checked=[];
 for(const url of urls){try{const p=await get(url);const exact=exactModel(p.text,model);checked.push({url:p.url,status:p.status,exact,title:(p.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g,' ').trim()||'',images:exact?imageUrls(p.text):[]});if(exact)break;}catch(e){checked.push({url,status:0,exact:false,error:String(e.message||e),images:[]});}}
 return {model,title,candidates:urls.length,exact:checked.filter(x=>x.exact),checked:checked.map(x=>({url:x.url,status:x.status,exact:x.exact,title:x.title}))};
}
export default async function handler(req,res){if(String(req.query?.key||'')!==KEY){res.status(404).json({error:'Not found'});return;}try{const sm=await get('https://moxom.com.cn/en-sitemap.xml');const allUrls=sitemapUrls(sm.text);const start=Math.max(0,Number(req.query?.start||0)||0),count=Math.max(1,Math.min(6,Number(req.query?.count||4)||4));const results=[];for(const [model,title] of ITEMS.slice(start,start+count)){results.push(await resolve(model,title,allUrls));await new Promise(r=>setTimeout(r,250));}res.status(200).json({sitemapStatus:sm.status,urlCount:allUrls.length,start,count:results.length,results});}catch(e){res.status(500).json({error:String(e.message||e)});}}