import {uploadProductImages} from '../backend/modules/media.mjs';

const KEY='moxom-official-images-20260930';
const ADMIN_ID='e729ac18-9ee3-4a8b-bcc0-fcb0e308f3e9';
const ITEMS=[
["LX-HC846","GaN PD45W & AVS60W Single USB-C Fast Charger (UK Plug)"],
["LX-HC844","PD45W&QC27W 2C1A Digital Display Fast Charger"],
["LX-HC838","PD67W & QC18W Triple Port Fast Charger (UK Plug)"],
["LX-HC836","PD100W & QC60W TFT Display Triple Port Fast Charger"],
["LX-HC832","2500W PD70W Worldwide Travel Fast Charger"],
["LX-ST808 WL","4 I N 1 Multifunction Wireless Charging Station"],
["LX-PB809","PD30W Wired Charging + 25W Wireless Charging 10000mAh Slim Wireless Power Bank"],
["LX-PB808","PD35W 10000mAh Dual Built-In Cables & Digital Display Power Bank"],
["LX-PB807","3C Certification PD45W QC22.5W 20000mAh Stellar Power Bank"],
["LX-VC809","75W Transparent LCD Car Charger"],
["LX-VC808","95W 3 Ports Car Charger"],
["MX-CL08","Wireless CarPlay Adapter"],
["MX-CL10","Wired to Wireless CarPlay Car Receiver"],
["MX-VS202","Magnetic Vacuum Phone Holder with Magnetic Ring"],
["MX-VS201","Neck Mount Magnetic Holder With Strap Compatible with Phones Action Cameras & More"],
["MX-VS198 WL","25W Aluminum Alloy Car Magnetic Wireless Charging Holder"],
["LX-CB956","1.5M 240W Type-C Multi-Function Fast Charging Data Cable"],
["LX-CB953","1.2M 240W Type-C Digital Display Fast Charge Cable"],
["LX-CB943","Type-C to Type-C 1.2M 100W Fast Charging Smart Auto-Off Data Cable"],
["MX-HB09","10 IN 1 High Speed USB 3.0 PD100W HUB"],
["LX-TW807 ANC+ENC","6MIC ANC+ENC Dual Noise-Canceling TWS In-Ear Wireless Earbuds"],
["LX-TW809 ENC","TWS Clip-On 4MIC ENC Noise-Canceling Wireless Earbuds"],
["MX-WH32","IP68 Waterproof 1.53 HD Round Screen Smartwatch"],
["MX-CP08","Cool Magnetic Semiconductor Mobile Phone Clip-on Radiator"]
];
const base='https://www.moxom.com.cn';
const stop=new Set(['the','and','with','for','to','of','a','an','fast','charging','charger','data','cable','uk','type','port','output','plug','wireless','phone']);
const tok=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(x=>x.length>1&&!stop.has(x));
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 MPlatformImporter/1.0','accept-language':'en-US,en;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  return {status:r.status,url:r.url,text:await r.text()};
}
function exactModel(html,model){
  const plain=html.replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/\s+/g,' ');
  const esc=model.replace(/[.*+?^$()|[\]\\{}]/g,'\\$&');
  return new RegExp('(?:Item\\s*No\\.?|Model(?:\\s*No\\.?)?|Model)\\s*[:：]?\\s*'+esc+'(?:\\b|\\s)','i').test(plain);
}
function imageUrls(html){
  const h1=Math.max(0,html.search(/<h1\b/i));
  const related=html.slice(h1).search(/Related Products/i);
  const section=html.slice(h1,related>0?h1+related:Math.min(html.length,h1+500000));
  const out=[];
  const push=x=>{
    try{
      let raw=x.replace(/&amp;/g,'&'); if(raw.startsWith('//'))raw='https:'+raw;
      const u=new URL(raw,base);
      if(!/ueeshop\.ly200-cdn\.com$/i.test(u.hostname)||!/\/products\//i.test(u.pathname))return;
      if(!/\.(?:jpe?g|png|webp)(?:\.|$)/i.test(u.pathname))return;
      u.search='';
      u.pathname=u.pathname.replace(/\.(?:240x240|500x500|800x800)\.(jpg|jpeg|png|webp)$/i,'.$1');
      const href=u.href;if(!out.includes(href))out.push(href);
    }catch{}
  };
  for(const m of section.matchAll(/(?:data-original|data-src|src|content)=[\"']([^\"']+)[\"']/gi))push(m[1]);
  return out.slice(0,3);
}
function sitemapUrls(xml){return [...xml.matchAll(/<loc>(https?:\/\/[^<]+\/products\/[^<]+)<\/loc>/gi)].map(m=>m[1].replace(/&amp;/g,'&'));}
function score(url,title){const slug=tok(new URL(url).pathname.split('/').pop()),want=tok(title),set=new Set(slug);let hits=0;for(const w of want)if(set.has(w))hits++;return want.length?hits/want.length:0;}
async function findExact(model,title,allUrls){
  const ranked=allUrls.map(url=>({url,score:score(url,title)})).filter(x=>x.score>.22).sort((a,b)=>b.score-a.score).slice(0,12);
  const checked=[];
  for(const x of ranked){
    try{const p=await get(x.url),exact=exactModel(p.text,model);checked.push({url:p.url,status:p.status,exact});if(exact)return {page:p.url,html:p.text,checked};}catch(e){checked.push({url:x.url,status:0,exact:false,error:String(e.message||e)});}
  }
  try{
    const s=await get(base+'/search/?Keyword='+encodeURIComponent(model));
    const q=[];
    for(const m of s.text.matchAll(/href=[\"']([^\"']*\/products\/[^\"'?#]+)[^\"']*[\"']/gi)){try{const u=new URL(m[1],base).href;if(!q.includes(u))q.push(u);}catch{}}
    for(const url of q.slice(0,12)){
      if(checked.some(x=>x.url===url))continue;
      try{const p=await get(url),exact=exactModel(p.text,model);checked.push({url:p.url,status:p.status,exact});if(exact)return {page:p.url,html:p.text,checked};}catch(e){checked.push({url,status:0,exact:false,error:String(e.message||e)});}
    }
  }catch{}
  return {page:null,html:null,checked};
}
async function fetchDataUri(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 MPlatformImporter/1.0','accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new Error('image fetch '+r.status);
  const b=Buffer.from(await r.arrayBuffer());
  if(b.length<10000||b.length>5242880)throw new Error('invalid image size '+b.length);
  const mime=b[0]===255&&b[1]===216&&b[2]===255?'image/jpeg':b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp':null;
  if(!mime)throw new Error('unsupported image');
  return {source:`data:${mime};base64,${b.toString('base64')}`,bytes:b.length,mime};
}
export default async function handler(req,res){
  if(String(req.query?.key||'')!==KEY){res.status(404).json({error:'Not found'});return;}
  try{
    const sm=await get('https://moxom.com.cn/en-sitemap.xml');
    const allUrls=sitemapUrls(sm.text);
    const start=Math.max(0,Number(req.query?.start||0)||0),count=Math.max(1,Math.min(2,Number(req.query?.count||2)||2));
    const user={id:ADMIN_ID,role:'admin'},results=[];
    for(const [model,title] of ITEMS.slice(start,start+count)){
      try{
        const found=await findExact(model,title,allUrls);
        if(!found.page){results.push({model,title,ok:false,reason:'exact_model_not_found',checked:found.checked.slice(0,5)});continue;}
        const urls=imageUrls(found.html);
        if(!urls.length){results.push({model,title,ok:false,reason:'no_official_images',page:found.page});continue;}
        const prepared=[];
        for(const url of urls){try{prepared.push({url,...await fetchDataUri(url)});}catch{}}
        if(!prepared.length){results.push({model,title,ok:false,reason:'image_download_failed',page:found.page,urls});continue;}
        const images=await uploadProductImages(user,prepared.map(x=>x.source));
        results.push({model,title,ok:true,page:found.page,sourceImages:prepared.map(x=>({url:x.url,bytes:x.bytes,mime:x.mime})),images});
      }catch(e){results.push({model,title,ok:false,reason:String(e.message||e)});}
    }
    res.status(200).json({sitemapStatus:sm.status,urlCount:allUrls.length,start,count:results.length,results});
  }catch(e){res.status(500).json({error:String(e.message||e)});}
}