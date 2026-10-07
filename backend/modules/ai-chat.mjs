import {snapshot} from './records.mjs';
import {assert,HttpError,db} from '../lib/supabase.mjs';
import {createHash} from 'node:crypto';
import {ensureConversation,saveCustomerMessage,saveAiMessage,requestHumanHandoff} from './ai-conversations.mjs';
import {recordAiUsage} from './ai-usage.mjs';
import {chatProductSignals,recordRecommendationImpressions} from './chat-conversions.mjs';
import {isUnlimitedStock} from '../../shared/inventory.mjs';

const OPENAI_URL='https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL='gpt-6-luna';
const usageWindows=new Map();
const RATE_WINDOW_MS=10*60*1000;
const IMAGE_MAX_CHARS=700000;
const responseCache=new Map();
const RESPONSE_CACHE_TTL_MS=6*60*60*1000;

function openAiApiKey(){
  return String(process.env.OPENAI_API_KEY||'').trim();
}
async function openAiRequest({apiKey,payload,timeoutMs=26000}){
  const response=await fetch(OPENAI_URL,{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(timeoutMs)
  });
  return {response};
}
function safeImage(value){
  if(!value)return '';
  const text=String(value);
  assert(text.length<=IMAGE_MAX_CHARS,413,'الصورة كبيرة جدًا / Image is too large');
  assert(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(text),400,'صيغة الصورة غير مدعومة / Unsupported image format');
  return text;
}
function viewerKey(user,req){
  if(user?.id)return 'user:'+user.id;
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const ip=forwarded||String(req?.socket?.remoteAddress||'unknown');
  return 'guest:'+createHash('sha256').update(ip).digest('hex').slice(0,24);
}
function enforceRateLimit(user,req){
  const key=viewerKey(user,req),now=Date.now(),limit=user?40:12;
  let row=usageWindows.get(key);
  if(!row||now-row.startedAt>=RATE_WINDOW_MS)row={startedAt:now,count:0};
  row.count+=1;usageWindows.set(key,row);
  if(usageWindows.size>5000){
    for(const [k,v] of usageWindows)if(now-v.startedAt>=RATE_WINDOW_MS)usageWindows.delete(k);
  }
  if(row.count>limit)throw new HttpError(429,'تم الوصول إلى حد الاستخدام مؤقتًا. حاول بعد قليل. / Too many AI requests. Try again shortly.');
  return key;
}

const clean=value=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const parseJsonObject=value=>{
  const raw=String(value||'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{return JSON.parse(raw);}catch{}
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1));}catch{}}
  return null;
};
const clamp=(value,max)=>clean(value).slice(0,max);
const titlePair=item=>{
  const t=item?.translation||{};
  return {ar:clamp(t.titleAr||t.titleEn||item?.product||item?.title||'',240),en:clamp(t.titleEn||t.titleAr||item?.product||item?.title||'',240)};
};
const descriptionPair=item=>{
  const t=item?.translation||{};
  return {ar:clamp(t.descriptionAr||t.descriptionEn||item?.specs||item?.shortDescription||'',900),en:clamp(t.descriptionEn||t.descriptionAr||item?.specs||item?.shortDescription||'',900)};
};
const STOP_TERMS=new Set(['اريد','أريد','ابغى','أبغى','احتاج','أحتاج','عندي','عندكم','عندك','هل','هذا','هذه','منتج','product','want','need','have','show','give','me','the','for','with']);
const terms=text=>clean(text).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x=>x.length>=2&&!STOP_TERMS.has(x)).slice(0,28);
function productIntent(query=''){
  const q=clean(query).toLowerCase();
  const intent={
    q,
    category:'',
    subtype:'',
    wireless:/(بلوتوث|bluetooth|لاسلك|wireless)/u.test(q),
    connector:'',
    watt:null,
    material:'',
    device:'',
    use:'',
    quantity:null,
    cheapest:/(أرخص|ارخص|رخيص|رخيصة|cheap|cheapest|lowest price|اقل سعر|أقل سعر|اقتصادي|budget)/u.test(q)
  };
  if(/(مكبر|سبيكر|speaker|soundbar)/u.test(q)){intent.category='audio';intent.subtype='speaker';}
  else if(/(سماع(?:ة|ه|ات)|earbud|earphone|headphone|headset|tws)/u.test(q)){
    intent.category='audio';
    if(/(tws|ايربود|إيربود|earbud)/u.test(q))intent.subtype='tws';
    else if(/(سلكي|سلكية|wired)/u.test(q))intent.subtype='wired';
    else if(/(رأس|راس|headphone|headset)/u.test(q))intent.subtype='headphone';
    else intent.subtype='personal';
  }else if(/(باور ?بانك|شاحن متنقل|power ?bank)/u.test(q))intent.category='powerbank';
  else if(/(شاحن سيارة|car charger)/u.test(q))intent.category='car_charger';
  else if(/(شاحن حائط|شاحن جداري|شاحن منزلي|wall charger|home charger|adapter)/u.test(q))intent.category='wall_charger';
  else if(/(شاحن|charger)/u.test(q))intent.category='charger';
  else if(/(كيبل|كابل|سلك شحن|cable)/u.test(q))intent.category='cable';
  else if(/(كفر|غطاء جوال|جراب|case|cover)/u.test(q))intent.category='case';
  else if(/(حامل|ستاند|holder|mount)/u.test(q))intent.category='holder';
  else if(/(ساعة ذكية|سوار ذكي|smart ?watch|smart ?band)/u.test(q))intent.category='watch';

  if(/(type ?-?c\s*(to|إلى|الى)\s*type ?-?c|c\s*[-–]\s*c|c2c)/u.test(q))intent.connector='c-c';
  else if(/(usb\s*(to|إلى|الى)\s*type ?-?c|usb\s*[-–]\s*c)/u.test(q))intent.connector='usb-c';
  else if(/(type ?-?c\s*(to|إلى|الى)\s*lightning|c\s*[-–]\s*lightning)/u.test(q))intent.connector='c-lightning';
  else if(/(usb\s*(to|إلى|الى)\s*lightning|usb\s*[-–]\s*lightning)/u.test(q))intent.connector='usb-lightning';
  else if(/lightning|لايتن/i.test(q))intent.connector='lightning';

  const watts=[...q.matchAll(/(?:^|\D)(\d{1,3})\s*w(?:att)?\b/gi)].map(m=>Number(m[1])).filter(n=>n>=5&&n<=300);
  if(watts.length)intent.watt=watts[0];

  const qtyAfter=(q.match(/(?:كمية|الكميه|الكمية|عدد|qty|quantity)\s*[:：-]?\s*(\d{1,7})/iu)||[])[1];
  const qtyBefore=(q.match(/(?:^|\s)(\d{1,7})\s*(?:حبة|حبه|قطعة|قطعه|pcs?|pieces?|units?)(?:\s|$)/iu)||[])[1];
  const parsedQuantity=Number(qtyAfter||qtyBefore||0);
  if(Number.isInteger(parsedQuantity)&&parsedQuantity>0)intent.quantity=parsedQuantity;

  if(/silicone|سيليكون/u.test(q))intent.material='silicone';
  else if(/\btpu\b/u.test(q))intent.material='tpu';
  else if(/leather|جلد/u.test(q))intent.material='leather';
  else if(/acrylic|اكريل|أكريل/u.test(q))intent.material='acrylic';

  const device=q.match(/iphone\s*\d{1,2}(?:\s*(?:pro|max|plus))?|ايفون\s*\d{1,2}(?:\s*(?:برو|ماكس|بلس))?|samsung\s*[a-z]?\d{1,3}|سامسونج\s*[a-z]?\d{1,3}/iu);
  if(device)intent.device=clean(device[0],80).toLowerCase();

  if(/(مكالم|calls?|microphone|مايك)/u.test(q))intent.use='calls';
  else if(/(العاب|ألعاب|gaming|game)/u.test(q))intent.use='gaming';
  return intent;
}

const TAXONOMY_ALIASES={
  'sub-power-banks':['باور بانك','باوربانك','باورات','شاحن متنقل','power bank','powerbank'],
  'sub-charging-data-cables':['كيبل','كابل','سلك شحن','charging cable','data cable'],
  'sub-audio-cables-adapters':['كابل صوت','كيبل صوت','aux cable','audio cable'],
  'sub-tws-earbuds':['tws','ايربود','إيربود','earbuds'],
  'sub-wired-earphones':['سماعة سلكية','سماعات سلكية','wired earphones'],
  'sub-headphones-gaming':['سماعة رأس','سماعات رأس','headphones','gaming headset'],
  'sub-bluetooth-speakers':['مكبر صوت','سبيكر','bluetooth speaker'],
  'sub-wall-chargers':['شاحن حائط','شاحن جداري','شاحن منزلي','wall charger'],
  'sub-car-chargers-fm':['شاحن سيارة','car charger'],
  'sub-wireless-chargers':['شاحن لاسلكي','wireless charger'],
  'sub-microphones':['مايك','مايكروفون','microphone'],
  'sub-stylus-pens':['قلم لمس','stylus'],
  'sub-webcams':['كاميرا ويب','webcam'],
  'sub-smart-watches':['ساعة ذكية','ساعات ذكية','smart watch'],
  'sub-smart-rings':['خاتم ذكي','خواتم ذكية','smart ring'],
  'sub-phone-cases':['كفر','كفر جوال','جراب جوال','phone case'],
  'sub-selfie-tripods':['عصا سيلفي','سيلفي','tripod','selfie stick'],
  'sub-gimbals-tracking':['جيمبل','gimbal'],
  'sub-phone-coolers':['مبرد جوال','مبرد هاتف','phone cooler'],
  'sub-fans':['مروحة','مراوح','fan']
};
function normalizeCatalogText(value=''){
  return clean(value).toLowerCase()
    .normalize('NFKD').replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
    .replace(/ة/g,'ه').replace(/ـ/g,' ')
    .replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
}
function catalogTokens(value=''){
  return normalizeCatalogText(value).split(' ').filter(x=>x.length>=3);
}
function tokenRelated(a,b){
  if(a===b)return true;
  if(Math.min(a.length,b.length)>=4&&(a.startsWith(b)||b.startsWith(a)))return true;
  return false;
}
function taxonomyEntries(state){
  const settings=state?.settings||{};
  const categories=(settings.categories||[]).filter(x=>x?.active!==false&&x?.id).map(x=>({
    id:String(x.id),kind:'category',parentId:String(x.id),nameAr:String(x.nameAr||''),nameEn:String(x.nameEn||'')
  }));
  const subcategories=(settings.subcategories||[]).filter(x=>x?.active!==false&&x?.id).map(x=>({
    id:String(x.id),kind:'subcategory',parentId:String(x.parentId||''),nameAr:String(x.nameAr||''),nameEn:String(x.nameEn||'')
  }));
  return [...subcategories,...categories];
}
function taxonomyMatch(state,message=''){
  const q=normalizeCatalogText(message);
  if(!q)return null;
  const qTokens=catalogTokens(q);
  const scored=taxonomyEntries(state).map(entry=>{
    const names=[entry.nameAr,entry.nameEn,entry.id.replace(/^(?:sub|cat)-/,'').replace(/-/g,' ')].map(normalizeCatalogText).filter(Boolean);
    let score=0;
    for(const name of names){
      if(name.length>=4&&q.includes(name))score=Math.max(score,entry.kind==='subcategory'?90:70);
      const nameTokens=catalogTokens(name);
      const matched=nameTokens.filter(nt=>qTokens.some(qt=>tokenRelated(qt,nt))).length;
      if(matched){
        const coverage=matched/Math.max(1,nameTokens.length);
        score=Math.max(score,matched*12+Math.round(coverage*18)+(entry.kind==='subcategory'?8:0));
      }
    }
    for(const alias of TAXONOMY_ALIASES[entry.id]||[]){
      const normalized=normalizeCatalogText(alias);
      if(normalized&&q.includes(normalized))score=Math.max(score,normalized.includes(' ')?110:82);
    }
    return {entry,score};
  }).filter(x=>x.score>=24).sort((a,b)=>b.score-a.score);
  if(!scored.length)return null;
  const top=scored[0],next=scored[1];
  if(next&&top.score===next.score&&top.entry.parentId===next.entry.parentId){
    return {categoryId:top.entry.parentId,subcategoryId:'',score:top.score,source:'taxonomy'};
  }
  return top.entry.kind==='subcategory'
    ?{categoryId:top.entry.parentId,subcategoryId:top.entry.id,score:top.score,source:'taxonomy'}
    :{categoryId:top.entry.id,subcategoryId:'',score:top.score,source:'taxonomy'};
}
function hasExplicitProductType(state,message=''){
  const taxonomy=taxonomyMatch(state,message),intent=productIntent(message);
  return !!(taxonomy?.categoryId||taxonomy?.subcategoryId||intent.category);
}
function isProductFollowup(message=''){
  const intent=productIntent(message),q=clean(message).toLowerCase();
  return !!(
    intent.cheapest||intent.connector||intent.watt||intent.material||intent.device||intent.use||intent.quantity||
    qHas(q,['عرض المزيد','المزيد','قارن','قارن بينها','نعم','هذا','هذه','ذلك','ارخص خيار','أرخص خيار','cheapest option','compare','show more'])
  );
}
export function resolveCustomerProductQuery(state,message='',history=[]){
  const current=clean(message);
  if(!current)return '';
  if(hasExplicitProductType(state,current))return current;
  if(!isProductFollowup(current))return current;
  const prior=[...(Array.isArray(history)?history:[])].reverse().find(row=>row?.role==='user'&&hasExplicitProductType(state,row.content));
  return prior?.content?clean(prior.content)+' '+current:current;
}
function catalogReferenceMatch(state,message=''){
  const q=normalizeCatalogText(message);
  if(!q)return false;
  return (state?.publicOffers||[]).some(item=>{
    const sku=normalizeCatalogText(item?.sku||'');
    if(sku&&sku.length>=3&&q.includes(sku))return true;
    const title=titlePair(item);
    return [title.ar,title.en].some(value=>{
      const normalized=normalizeCatalogText(value);
      return normalized.length>=7&&q.includes(normalized);
    });
  });
}
export function isCustomerProductQuery(state,message='',history=[],resolvedQuery=''){
  const current=clean(message),resolved=clean(resolvedQuery||resolveCustomerProductQuery(state,current,history));
  if(!current)return false;
  if(hasExplicitProductType(state,resolved))return true;
  if(catalogReferenceMatch(state,current))return true;
  return false;
}
function emptyProductSearch(query=''){
  return {query:clean(query),context:[],recommendations:[]};
}
function productProfile(item){
  const sub=String(item?.subcategoryId||'').toLowerCase(),cat=String(item?.categoryId||'').toLowerCase();
  const title=titlePair(item),description=descriptionPair(item);
  const hay=clean([item?.product,title.ar,title.en,description.ar,description.en,item?.technicalSpecs,item?.options,sub,cat].filter(Boolean).join(' ')).toLowerCase();
  let category='',subtype='';
  if(sub==='sub-wall-chargers')category='wall_charger';
  else if(sub==='sub-car-chargers-fm')category='car_charger';
  else if(sub==='sub-charging-data-cables')category='cable';
  else if(sub==='sub-wireless-chargers'||sub==='sub-laptop-chargers'||sub==='sub-power-strips-travel')category='charger';
  else if(sub==='sub-wireless-charging-mounts')category='holder';
  else if(sub.includes('bluetooth-speaker')||/(مكبر|سبيكر|speaker|soundbar)/u.test(hay)){category='audio';subtype='speaker';}
  else if(sub.includes('tws')||/(\btws\b|earbud)/u.test(hay)){category='audio';subtype='tws';}
  else if(sub.includes('headphone')||/(headphone|headset|سماع(?:ة|ه) (?:رأس|راس))/u.test(hay)){category='audio';subtype='headphone';}
  else if(sub.includes('wired-ear')||/(wired ear|سماعة سلك)/u.test(hay)){category='audio';subtype='wired';}
  else if(/power ?bank|باور ?بانك|شاحن متنقل/u.test(hay))category='powerbank';
  else if(/car charger|شاحن سيارة/u.test(hay))category='car_charger';
  else if(/wall charger|home charger|شاحن حائط|شاحن جداري|adapter/u.test(hay))category='wall_charger';
  else if(/charger|شاحن/u.test(hay))category='charger';
  else if(/cable|كيبل|كابل/u.test(hay))category='cable';
  else if(/case|cover|كفر|جراب|غطاء/u.test(hay))category='case';
  else if(/holder|mount|حامل/u.test(hay))category='holder';
  else if(/smart ?watch|smart ?band|ساعة ذكية|سوار ذكي/u.test(hay))category='watch';

  let connector='';
  if(/type ?-?c\s*(to|-|–)\s*type ?-?c|c\s*[-–]\s*c|c2c/u.test(hay))connector='c-c';
  else if(/usb\s*(to|-|–)\s*type ?-?c|usb\s*[-–]\s*c/u.test(hay))connector='usb-c';
  else if(/type ?-?c\s*(to|-|–)\s*lightning|c\s*[-–]\s*lightning/u.test(hay))connector='c-lightning';
  else if(/usb\s*(to|-|–)\s*lightning|usb\s*[-–]\s*lightning/u.test(hay))connector='usb-lightning';
  else if(/lightning/u.test(hay))connector='lightning';

  const watts=[...hay.matchAll(/(?:^|\D)(\d{1,3})\s*w(?:att)?\b/gi)].map(m=>Number(m[1])).filter(n=>n>=5&&n<=300);
  const material=/silicone|سيليكون/u.test(hay)?'silicone':/\btpu\b/u.test(hay)?'tpu':/leather|جلد/u.test(hay)?'leather':/acrylic|اكريل|أكريل/u.test(hay)?'acrylic':'';
  return {hay,category,subtype,connector,watts,material};
}

function intentHasHardConstraints(intent){
  return !!(intent.category||intent.subtype||intent.connector||intent.watt||intent.material||intent.device||intent.wireless);
}
function explicitlyCompatible(item,intent,taxonomy=null){
  const p=productProfile(item);

  // The live storefront taxonomy is authoritative for product type whenever it
  // matched the request. Legacy intent categories remain only as a fallback for
  // generic language that does not resolve to a real category/subcategory.
  if(!taxonomy){
    if(intent.category==='audio'){
      if(p.category!=='audio')return false;
    }else if(intent.category&&p.category){
      const categoryMatch=intent.category==='charger'
        ?['charger','wall_charger','car_charger'].includes(p.category)
        :p.category===intent.category;
      if(!categoryMatch)return false;
    }
  }

  if(intent.subtype==='personal'){
    if(!['tws','headphone','wired'].includes(p.subtype))return false;
  }else if(intent.subtype==='speaker'){
    if(p.subtype!=='speaker')return false;
  }else if(intent.subtype){
    if(p.subtype!==intent.subtype)return false;
  }

  if(intent.wireless&&p.subtype==='wired')return false;
  if(intent.connector&&p.connector&&p.connector!==intent.connector)return false;
  if(intent.watt&&p.watts.length&&!p.watts.includes(intent.watt))return false;
  if(intent.material&&p.material&&p.material!==intent.material)return false;
  return true;
}
function effectiveUnitPrice(item,quantity=null){
  let price=Number(item?.unitPrice);
  if(!Number.isFinite(price))return null;
  const q=Number(quantity);
  if(Number.isInteger(q)&&q>0&&Array.isArray(item?.tiers)){
    const tiers=[...item.tiers]
      .map(t=>({min:Number(t?.min),price:Number(t?.price)}))
      .filter(t=>Number.isFinite(t.min)&&Number.isFinite(t.price)&&t.min>0)
      .sort((a,b)=>a.min-b.min);
    for(const tier of tiers)if(q>=tier.min)price=tier.price;
  }
  return Number.isFinite(price)?price:null;
}
function intentScore(item,intent,{ignoreCategory=false}={}){
  const p=productProfile(item);
  let score=0;
  if(intent.category&&!ignoreCategory){
    if(p.category===intent.category)score+=32;
    else if(intent.category==='charger'&&['wall_charger','car_charger','charger'].includes(p.category))score+=20;
    else if(intent.category==='audio'&&p.category==='audio')score+=24;
    else if(p.category)score-=28;
  }
  if(intent.subtype){
    if(p.subtype===intent.subtype)score+=24;
    else if(intent.subtype==='personal'&&['tws','headphone','wired'].includes(p.subtype))score+=16;
    else if(intent.subtype==='personal'&&p.subtype==='speaker')score-=58;
    else if(intent.subtype==='speaker'&&p.subtype!=='speaker'&&p.category==='audio')score-=48;
  }
  if(intent.wireless){
    if(/bluetooth|wireless|لاسلك|بلوتوث|\btws\b/u.test(p.hay))score+=9;
    if(p.subtype==='wired')score-=18;
  }
  if(intent.connector){
    if(p.connector===intent.connector)score+=20;
    else if(p.connector)score-=12;
  }
  if(intent.watt){
    if(p.watts.includes(intent.watt))score+=18;
    else if(p.watts.length){
      const delta=Math.min(...p.watts.map(w=>Math.abs(w-intent.watt)));
      score+=delta<=5?8:delta<=15?2:-8;
    }
  }
  if(intent.material){
    if(p.material===intent.material)score+=16;
    else if(p.material)score-=10;
  }
  if(intent.device){
    const compactDevice=intent.device.replace(/\s+/g,' ');
    score+=p.hay.includes(compactDevice)?18:0;
  }
  if(intent.use==='calls'&&/(call|mic|microphone|مكالم|مايك|enc|anc)/u.test(p.hay))score+=8;
  if(intent.use==='gaming'&&/(gaming|game|ألعاب|العاب|low latency)/u.test(p.hay))score+=8;
  return score;
}
function productScore(item,needles,intent,signals={},taxonomy=null){
  const p=productProfile(item),sku=String(item?.sku||'').toLowerCase();
  const lexical=needles.reduce((score,term)=>score+(p.hay.includes(term)?(sku.includes(term)?7:2):0),0);
  const performance=Math.max(0,Math.min(8,Number(signals?.[item?.id]?.score)||0));
  return lexical+intentScore(item,intent,{ignoreCategory:!!taxonomy})+performance;
}
function rankedProductItems(state,query,signals={}){
  const rows=(state?.publicOffers||[]).filter(x=>x?.status==='published'&&!x?.deletedAt&&!x?.studioArchived);
  const needles=terms(query),intent=productIntent(query),taxonomy=taxonomyMatch(state,query),hard=intentHasHardConstraints(intent)||!!taxonomy;
  const ranked=rows.map(item=>{
    const taxonomyCompatible=!taxonomy
      ||taxonomy.subcategoryId&&String(item?.subcategoryId||'')===taxonomy.subcategoryId
      ||!taxonomy.subcategoryId&&taxonomy.categoryId&&String(item?.categoryId||'')===taxonomy.categoryId;
    return {
      item,
      score:productScore(item,needles,intent,signals,taxonomy)+(taxonomyCompatible&&taxonomy?18:0),
      compatible:taxonomyCompatible&&explicitlyCompatible(item,intent,taxonomy),
      effectivePrice:effectiveUnitPrice(item,intent.quantity)
    };
  }).filter(row=>!hard||row.compatible);

  return ranked.sort((a,b)=>{
    if(intent.cheapest){
      const ap=a.effectivePrice,bp=b.effectivePrice;
      const aHas=Number.isFinite(ap),bHas=Number.isFinite(bp);
      if(aHas&&bHas&&ap!==bp)return ap-bp;
      if(aHas!==bHas)return aHas?-1:1;
      if(a.score!==b.score)return b.score-a.score;
    }else if(a.score!==b.score)return b.score-a.score;
    return String(b.item?.createdAt||'').localeCompare(String(a.item?.createdAt||''));
  });
}
function productContextFromRows(rows,intent){
  return rows.map(({item,effectivePrice})=>{
    const title=titlePair(item),description=descriptionPair(item),basePrice=Number.isFinite(Number(item.unitPrice))?Number(item.unitPrice):null;
    const tiers=Array.isArray(item?.tiers)?item.tiers
      .map(t=>({min:Number(t?.min),price:Number(t?.price)}))
      .filter(t=>Number.isFinite(t.min)&&Number.isFinite(t.price)&&t.min>0)
      .sort((a,b)=>a.min-b.min)
      .slice(0,20):[];
    return {
      id:clamp(item.id,90),
      number:item.displayNo||'',
      sku:clamp(item.sku,120),
      product:clamp(item.product,180),
      title,
      description,
      technicalSpecs:clamp(item.technicalSpecs,1200),
      options:clamp(item.options,800),
      price:intent.quantity&&Number.isFinite(effectivePrice)?effectivePrice:basePrice,
      basePrice,
      requestedQuantity:intent.quantity||null,
      tiers,
      currency:clamp(item.currency,12),
      moq:item.moq??null,
      stock:isUnlimitedStock(item)?null:(item.stock??null),
      stockUnlimited:isUnlimitedStock(item),
      leadTime:item.leadTime??null,
      country:clamp(item.country,120),
      categoryId:clamp(item.categoryId,120),
      subcategoryId:clamp(item.subcategoryId,120)
    };
  });
}
function productRecommendationsFromRows(rows,intent,language){
  return rows.map(({item,effectivePrice})=>{
    const titles=titlePair(item),image=Array.isArray(item.images)?String(item.images[0]||''):'';
    const basePrice=Number.isFinite(Number(item.unitPrice))?Number(item.unitPrice):null;
    return {
      id:clamp(item.id,90),
      sku:clamp(item.sku,100),
      title:language==='en'?(titles.en||titles.ar):(titles.ar||titles.en),
      price:intent.quantity&&Number.isFinite(effectivePrice)?effectivePrice:basePrice,
      basePrice,
      priceQuantity:intent.quantity||null,
      currency:clamp(item.currency||'SAR',12),
      moq:item.moq??null,
      image:clamp(image,1200),
      href:'/?product='+encodeURIComponent(String(item.id||''))
    };
  }).filter(x=>x.id&&x.title);
}
export function customerProductSearch(state,query,language='ar',signals={}){
  const intent=productIntent(query);
  const rows=rankedProductItems(state,query,signals).filter(x=>x.score>0).slice(0,6);
  return {
    query:clean(query),
    context:productContextFromRows(rows,intent),
    recommendations:productRecommendationsFromRows(rows,intent,language)
  };
}
function productContext(state,query,signals={}){
  return customerProductSearch(state,query,'ar',signals).context;
}
export function customerProductRecommendations(state,query,language='ar',signals={}){
  return customerProductSearch(state,query,language,signals).recommendations;
}
function quickRepliesFor(query,cards,language){
  const q=clean(query).toLowerCase();
  if(!cards.length)return [];
  if(qHas(q,['شاحن','charger']))return language==='en'?['Wall charger','Car charger','Cheapest option','With cable']:['شاحن منزلي','شاحن سيارة','أرخص خيار','مع كابل'];
  if(qHas(q,['كيبل','كابل','cable']))return language==='en'?['Type-C to Type-C','USB to Type-C','Lightning','Cheapest option']:['Type-C to Type-C','USB to Type-C','Lightning','أرخص خيار'];
  if(qHas(q,['سماعة','سماعه','سماعات','earbuds','headphones','tws']))return language==='en'?['TWS','Wired','Best for calls','Cheapest option']:['TWS','سلكية','أفضل للمكالمات','أرخص خيار'];
  if(qHas(q,['كفر','غطاء','case','cover']))return language==='en'?['iPhone','Samsung','TPU','Silicone']:['آيفون','سامسونج','TPU','سيليكون'];
  return language==='en'?['Cheapest option','Compare these','Show more']:['أرخص خيار','قارن بينها','عرض المزيد'];
}
function chatUiMetadata(state,query,language,signals={},productSearch=null){
  const products=productSearch?.recommendations||customerProductRecommendations(state,query,language,signals);
  return {products,quickReplies:quickRepliesFor(query,products,language)};
}
function requestTitle(item){
  const title=titlePair(item);
  return title.ar||title.en||clamp(item?.product,240)||'';
}
function clientContext(state){
  const requests=[...(state?.requests||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0)).slice(0,6).map(item=>({
    number:item.displayNo||'',
    type:clamp(item.orderType||'custom',40),
    title:requestTitle(item),
    status:clamp(item.status,80),
    trackingStatus:clamp(item.trackingStatus,80),
    quantity:item.quantity??null,
    country:clamp(item.country,120),
    neededDate:clamp(item.neededDate,80),
    paymentStatus:clamp(item.paymentStatus,80),
    selectedQuoteNumber:(state?.quotes||[]).find(q=>q.id===item.selectedQuoteId)?.displayNo||''
  }));
  const interests=[...(state?.interests||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0)).slice(0,6).map(item=>({
    number:item.displayNo||'',
    status:clamp(item.status,80),
    trackingStatus:clamp(item.trackingStatus,80),
    quantity:item.quantity??null,
    paymentStatus:clamp(item.paymentStatus,80),
    product:titlePair(item.offerSnapshot||{}),
    total:Number.isFinite(Number(item.total))?Number(item.total):null,
    currency:clamp(item.currency,12)
  }));
  const quotes=[...(state?.quotes||[])].slice(0,8).map(item=>({
    number:item.displayNo||'',
    requestNumber:(state?.requests||[]).find(r=>r.id===item.requestId)?.displayNo||'',
    status:clamp(item.status,80),
    unitPrice:Number.isFinite(Number(item.unitPrice))?Number(item.unitPrice):null,
    currency:clamp(item.currency,12),
    moq:item.moq??null,
    leadTime:item.leadTime??null
  }));
  return {orders:requests,readyProductOrders:interests,quotes};
}
function normalizeHistory(value){
  if(!Array.isArray(value))return[];
  return value.slice(-6).map(row=>({
    role:row?.role==='assistant'?'assistant':'user',
    content:clamp(row?.content,900)
  })).filter(row=>row.content);
}
function extractReply(data){
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string')return clean(content);
  if(Array.isArray(content))return clean(content.map(x=>typeof x==='string'?x:x?.text||'').join('\n'));
  return '';
}

const TRACKING_LABELS={
  received:['تم استلام الطلب','Received'],reviewing:['قيد المراجعة','Under review'],sourcing:['جاري التوريد','Sourcing'],
  quotes_available:['العروض متاحة','Quotes available'],quote_selected:['تم اختيار العرض','Quote selected'],
  supplier_confirmation:['بانتظار تأكيد المورد','Supplier confirmation'],payment_confirmation:['بانتظار تأكيد الدفع','Payment confirmation'],
  production:['قيد التجهيز','Preparing'],quality_check:['الفحص والجودة','Quality check'],ready_to_ship:['جاهز للشحن','Ready to ship'],
  shipped:['تم الشحن','Shipped'],in_delivery:['قيد التوصيل','Out for delivery'],delivered:['تم التسليم','Delivered'],
  completed:['مكتمل','Completed'],customer_action:['بانتظار إجراء من العميل','Customer action required'],
  on_hold:['معلق مؤقتًا','On hold'],cancelled:['ملغي','Cancelled']
};
const qHas=(message,patterns)=>patterns.some(pattern=>message.includes(pattern));
const localized=(pair,language)=>Array.isArray(pair)?pair[language==='en'?1:0]:String(pair||'');
const latestByDate=rows=>[...(rows||[])].sort((a,b)=>(Date.parse(b?.trackingUpdatedAt||b?.updatedAt||b?.createdAt||0)||0)-(Date.parse(a?.trackingUpdatedAt||a?.updatedAt||a?.createdAt||0)||0));
const visibleOrderNumber=item=>String(item?.displayNo||item?.number||'').trim();
function matchingOwnOrder(state,message){
  const rows=latestByDate([...(state?.requests||[]),...(state?.interests||[])]);
  const digits=message.match(/\b\d{4,}\b/g)||[];
  if(digits.length){
    const exact=rows.find(row=>digits.includes(visibleOrderNumber(row)));
    if(exact)return exact;
  }
  return rows[0]||null;
}
function productMatchConfidence(product,message){
  const sku=String(product?.sku||'').toLowerCase();
  if(sku&&message.includes(sku))return 100;
  const title=clean((product?.title?.ar||'')+' '+(product?.title?.en||'')).toLowerCase();
  const useful=terms(message).filter(t=>!['سعر','السعر','price','cost','متوفر','stock','available','كم','اقل','أقل','minimum','moq'].includes(t));
  return useful.reduce((score,t)=>score+(title.includes(t)?1:0),0);
}
function directProductFact(state,message,language,signals={},productQuery=message,productSearch=null){
  const wantsPrice=qHas(message,['سعر','السعر','price','cost','بكم','كم سعر','رخيص','رخيصة','cheap','budget','أرخص','ارخص','cheapest']);
  const wantsMoq=qHas(message,['اقل كمية','أقل كمية','حد ادنى','حد أدنى','moq','minimum']);
  const wantsStock=qHas(message,['متوفر','المخزون','مخزون','stock','available','availability']);
  const wantsLead=qHas(message,['مدة التجهيز','كم يوم','lead time','تجهيز']);
  if(!wantsPrice&&!wantsMoq&&!wantsStock&&!wantsLead)return null;
  const products=productSearch?.context||productContext(state,productQuery,signals);
  const first=products[0],second=products[1];
  if(!first)return null;
  const confidence=productMatchConfidence(first,message),secondConfidence=second?productMatchConfidence(second,message):0;
  if(confidence<1||confidence<100&&confidence<=secondConfidence)return null;
  const title=(language==='en'?first.title?.en:first.title?.ar)||first.sku||'Product';
  const facts=[];
  if(wantsPrice&&Number.isFinite(Number(first.price))){
    const quantity=Number(first.requestedQuantity)||0;
    const label=quantity
      ?(language==='en'?('Price at '+quantity+' pcs: '):('السعر لـ '+quantity+' حبة: '))
      :(language==='en'?'Price: ':'السعر: ');
    facts.push(label+Number(first.price)+' '+(first.currency||'SAR'));
  }
  if(wantsMoq&&first.moq!==undefined&&first.moq!==null&&first.moq!=='')facts.push((language==='en'?'MOQ: ':'الحد الأدنى: ')+first.moq+(language==='en'?'':' قطعة'));
  if(wantsStock){
    if(first.stockUnlimited)facts.push(language==='en'?'Availability: Available to order':'التوفر: متوفر للطلب');
    else if(first.stock!==undefined&&first.stock!==null&&first.stock!=='')facts.push((language==='en'?'Stock: ':'المخزون: ')+first.stock);
  }
  if(wantsLead&&first.leadTime!==undefined&&first.leadTime!==null&&first.leadTime!=='')facts.push((language==='en'?'Lead time: ':'مدة التجهيز: ')+first.leadTime+(language==='en'?' days':' يوم'));
  if(!facts.length)return null;
  return title+' — '+facts.join(' · ');
}
function productCardSummary(card,language){
  const parts=[card?.title||''];
  if(Number.isFinite(Number(card?.price)))parts.push(Number(card.price)+' '+(card.currency||'SAR'));
  if(card?.moq!==undefined&&card?.moq!==null&&card?.moq!=='')parts.push((language==='en'?'MOQ ':'الحد الأدنى ')+card.moq);
  return parts.filter(Boolean).join(' — ');
}
function directProductDiscoveryAnswer(message,language,productSearch){
  const cards=productSearch?.recommendations||[];
  if(!cards.length)return language==='en'
    ?'I could not find a matching product in the current store catalog. You can send a special sourcing request.'
    :'لم أجد منتجًا مطابقًا في كتالوج المتجر الحالي. يمكنك إرسال طلب توريد خاص.';
  const q=clean(message).toLowerCase(),intent=productIntent(productSearch?.query||message);
  if(qHas(q,['قارن','مقارنة','compare'])&&cards.length>=2){
    const rows=cards.slice(0,3).map(card=>productCardSummary(card,language)).join(language==='en'?'; ':'؛ ');
    return (language==='en'?'Quick comparison: ':'مقارنة سريعة: ')+rows+'.';
  }
  const first=cards[0];
  if(intent.cheapest&&Number.isFinite(Number(first?.price))){
    const quantity=Number(first?.priceQuantity)||0;
    if(language==='en')return (quantity?'At '+quantity+' pcs, the cheapest matching option is ':'The cheapest matching option is ')+first.title+' — '+Number(first.price)+' '+(first.currency||'SAR')+'.';
    return (quantity?'عند كمية '+quantity+' حبة، أرخص خيار مطابق هو ':'أرخص خيار مطابق حاليًا هو ')+first.title+' — '+Number(first.price)+' '+(first.currency||'SAR')+'.';
  }
  if(intent.quantity){
    return language==='en'
      ?'These are the matching store options with pricing calculated for '+intent.quantity+' pcs where quantity tiers are available.'
      :'هذه الخيارات المطابقة من المتجر، وتم احتساب سعر كمية '+intent.quantity+' حبة عند توفر شرائح أسعار للكميات.';
  }
  return language==='en'?'These are the best matching options currently available in the store.':'هذه أنسب الخيارات المتوفرة حاليًا في المتجر.';
}
function wantsHumanSupport(message=''){
  const q=clean(message).toLowerCase();
  return qHas(q,[
    'خدمة العملاء','موظف','موظفه','موظفة','موظفين','شخص حقيقي','انسان','إنسان','بشري',
    'حولني','حوّلني','حولني لموظف','اكلم موظف','أكلم موظف','اتكلم مع موظف','أتكلم مع موظف',
    'customer service','human agent','human support','live agent','talk to a person','speak to an agent','representative'
  ]);
}
function policyPageIdForMessage(message=''){
  const q=clean(message).toLowerCase();
  if(qHas(q,['الشحن','شحن','التوصيل','توصيل','ناقل','shipping','delivery','freight','carrier']))return 'policy-shipping';
  if(qHas(q,['استرجاع','استرداد','ارجاع','إرجاع','refund','return']))return 'policy-returns';
  if(qHas(q,['إلغاء','الغاء','cancel','cancellation']))return 'policy-cancellation';
  if(qHas(q,['الدفع','تحويل','عربون','payment','deposit','bank transfer']))return 'policy-payments';
  if(qHas(q,['خصوصية','privacy']))return 'policy-privacy';
  if(qHas(q,['ملفات الارتباط','كوكيز','cookies','cookie']))return 'policy-cookies';
  if(qHas(q,['الشروط','الأحكام','terms','conditions']))return 'policy-terms';
  return '';
}
function isCompanyPolicyQuestion(message=''){
  const q=normalizeCatalogText(message);
  return qHas(q,[
    'اسم الشركه','اسم شركتكم','اسمكم','اسمكم التجاري','عنوان الشركه','عنوان شركتكم','عنوانكم','عنوانك',
    'اين مقركم','وين مقركم','مقر الشركه','مقركم','اين موقعكم','وين موقعكم','موقع الشركه','موقعكم',
    'من انتم','عن الشركه','company name','company address','registered address','office address','head office',
    'where are you located','where is your office','who are you','about the company','location'
  ]);
}
function policyQuestionSignal(message=''){
  const q=clean(message).toLowerCase();
  return !!policyPageIdForMessage(message)||isCompanyPolicyQuestion(message)||qHas(q,['سياسة','السياسة','ضمان','warranty','policy']);
}
function selectedPolicyPage(state,pageId){
  return (state?.settings?.storefront?.pages||[]).find(page=>page?.id===pageId&&page?.active!==false)||null;
}
function policyPagesForLanguage(state,language){
  return (state?.settings?.storefront?.pages||[])
    .filter(page=>page?.active!==false)
    .map(page=>({
      id:String(page?.id||''),
      title:clean(language==='en'?(page?.titleEn||page?.title):(page?.title||page?.titleEn)),
      content:String(language==='en'?(page?.contentEn||page?.content||''):(page?.content||page?.contentEn||''))
    }))
    .filter(page=>clean(page.content));
}
function policyChunks(value=''){
  return String(value||'').replace(/\r/g,'\n').split(/\n+|[.!؟。؛]+\s*/u).map(clean).filter(chunk=>chunk.length>=4);
}
function directCompanyPolicyAnswer(state,message,language){
  if(!isCompanyPolicyQuestion(message))return null;
  const q=normalizeCatalogText(message);
  const asksAddress=qHas(q,['عنوان','مقر','وين','اين','where','address','office','located']);
  const cues=(asksAddress
    ?['عنوان الشركة','العنوان','company address','registered address','office address','head office','address']
    :['اسم الشركة','company name','legal name','guangzhou mig trading','广州米各贸易有限公司']
  ).map(normalizeCatalogText);
  const candidates=[];
  for(const page of policyPagesForLanguage(state,language)){
    for(const chunk of policyChunks(page.content)){
      const normalized=normalizeCatalogText(chunk);
      const cueScore=cues.reduce((score,cue)=>score+(cue&&normalized.includes(cue)?12:0),0);
      if(!cueScore)continue;
      const queryScore=catalogTokens(q).reduce((score,token)=>score+(catalogTokens(normalized).some(value=>tokenRelated(token,value))?2:0),0);
      candidates.push({chunk,score:cueScore+queryScore});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0]?.chunk?clamp(candidates[0].chunk,520):null;
}
function directPolicyAnswer(state,message,language){
  if(!policyQuestionSignal(message))return null;
  const company=directCompanyPolicyAnswer(state,message,language);
  if(company)return company;
  const pages=policyPagesForLanguage(state,language);
  if(!pages.length)return null;
  const pageId=policyPageIdForMessage(message);
  const selected=pageId?pages.filter(page=>page.id===pageId):pages;
  const candidates=[];
  const qTokens=catalogTokens(message).filter(token=>!['سياسه','policy','ماذا','كيف','what','how'].includes(token));
  for(const page of selected.length?selected:pages){
    const titleTokens=catalogTokens(page.title);
    for(const chunk of policyChunks(page.content)){
      const chunkTokens=catalogTokens(chunk);
      let score=pageId&&page.id===pageId?4:0;
      for(const token of qTokens){
        if(chunkTokens.some(value=>tokenRelated(token,value)))score+=3;
        if(titleTokens.some(value=>tokenRelated(token,value)))score+=2;
      }
      candidates.push({page,chunk,score});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  const top=candidates[0];
  if(top&&top.score>=4){
    const body=clamp(top.chunk,650);
    return top.page.title?top.page.title+': '+body:body;
  }
  if(pageId){
    const page=(selected.length?selected:pages)[0];
    if(page?.content){
      const body=clamp(page.content,650);
      return page.title?page.title+': '+body:body;
    }
  }
  return null;
}
export function directCustomerAnswer(state,user,message,language='ar',signals={},productQuery=message,productSearch=null,productActive=false){
  const normalized=clean(message).toLowerCase();
  if(user&&qHas(normalized,['طلبي','الطلب','وين الطلب','اين الطلب','أين الطلب','حالة الطلب','تتبع','tracking','my order','order status'])){
    const order=matchingOwnOrder(state,normalized);
    if(order){
      const number=visibleOrderNumber(order),tracking=order.trackingStatus||order.status||'';
      const status=localized(TRACKING_LABELS[tracking]||tracking,language);
      const payment=String(order.paymentStatus||'');
      const parts=[];
      if(status)parts.push((language==='en'?'Status: ':'الحالة: ')+status);
      if(payment)parts.push((language==='en'?'Payment: ':'الدفع: ')+payment);
      if(order.trackingNumber)parts.push((language==='en'?'Tracking: ':'رقم التتبع: ')+order.trackingNumber);
      if(parts.length)return (language==='en'?'Order ':'الطلب ')+(number||'')+' — '+parts.join(' · ');
    }
  }
  const policy=directPolicyAnswer(state,normalized,language);
  if(policy)return policy;
  const fact=directProductFact(state,normalized,language,signals,productQuery,productSearch);
  if(fact)return fact;
  return productActive?directProductDiscoveryAnswer(normalized,language,productSearch):null;
}
function cacheKeyFor(language,message,context){
  const compact={language,message:clean(message).toLowerCase(),products:context?.products||[],shoppingSignal:context?.shoppingSignal||null};
  return createHash('sha256').update(JSON.stringify(compact)).digest('hex');
}
async function getCachedReply(key){
  const local=responseCache.get(key);
  if(local&&Date.now()-local.at<=RESPONSE_CACHE_TTL_MS)return local.reply;
  if(local)responseCache.delete(key);
  try{
    const now=new Date().toISOString();
    const rows=await db('ai_response_cache',`cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(now)}&limit=1`);
    const row=rows?.[0];
    if(row?.reply){
      responseCache.set(key,{reply:row.reply,at:Date.now()});
      return row.reply;
    }
  }catch(error){
    console.warn('Persistent AI cache read failed',error?.message||'unknown');
  }
  return '';
}
async function setCachedReply(key,reply,model=''){
  responseCache.set(key,{reply,at:Date.now()});
  if(responseCache.size>1000){
    const cutoff=Date.now()-RESPONSE_CACHE_TTL_MS;
    for(const [cacheKey,row] of responseCache)if(row.at<cutoff)responseCache.delete(cacheKey);
    while(responseCache.size>1000)responseCache.delete(responseCache.keys().next().value);
  }
  try{
    await db('ai_response_cache','on_conflict=cache_key',{
      method:'POST',
      body:{cache_key:key,reply,model:String(model||''),expires_at:new Date(Date.now()+RESPONSE_CACHE_TTL_MS).toISOString()},
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'}
    });
  }catch(error){
    console.warn('Persistent AI cache write failed',error?.message||'unknown');
  }
}
function safeMarketingSignal(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const type=clamp(value.type,60);
  const allowed=new Set(['product_interest','repeated_product','comparing_products','search_no_results','narrow_search','cart_interest','cart_hesitation']);
  if(!allowed.has(type))return null;
  const result={type};
  for(const key of ['query','productSku','productTitle','currency'])if(value[key]!==undefined)result[key]=clamp(value[key],key==='query'?300:180);
  for(const key of ['price','moq','quantity','results','cartCount','viewedTimes','distinctProducts','cartTotal']){
    const n=Number(value[key]);if(Number.isFinite(n))result[key]=n;
  }
  return result;
}
async function analyzeProductImage({image,message,language,apiKey,model,gatewayUser}){
  const prompt=language==='ar'
    ?'حلل صورة المنتج بهدف البحث عنه داخل كتالوج متجر إلكتروني. أعد JSON فقط. حدد نوع المنتج العام، وأهم الكلمات المرئية أو المواصفات مثل الماركة والموديل والواط والمنافذ واللون إذا كانت واضحة. لا تخمن معلومات غير ظاهرة. إذا لم يظهر منتج قابل للشراء بوضوح اجعل confidence = "none" و query فارغًا.'
    :'Analyze this product image for catalog search. Return JSON only. Identify the generic product type plus clearly visible brand, model, wattage, ports, color, or other useful visible specifications. Do not guess unseen details. If no purchasable product is clearly visible, set confidence to "none" and query to an empty string.';
  const payload={
    model,
    messages:[{
      role:'user',
      content:[
        {type:'text',text:prompt+(message?('\nCustomer note: '+clamp(message,500)):'')},
        {type:'image_url',image_url:{url:image,detail:'low'}}
      ]
    }],
    response_format:{
      type:'json_schema',
      json_schema:{
        name:'product_image_search',
        strict:true,
        schema:{
          type:'object',
          properties:{
            query:{type:'string'},
            productType:{type:'string'},
            visibleText:{type:'string'},
            confidence:{type:'string',enum:['high','medium','low','none']}
          },
          required:['query','productType','visibleText','confidence'],
          additionalProperties:false
        }
      }
    },
    max_completion_tokens:220,
    temperature:0.1,
    reasoning_effort:'none'
  };
  let response;
  try{
    ({response}=await openAiRequest({apiKey,payload,timeoutMs:22000}));
  }catch{
    throw new HttpError(502,'تعذر تحليل الصورة الآن. / Could not analyze the image.');
  }
  if(!response.ok)throw aiProviderError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة تحليل الصورة غير صالحة. / Invalid image analysis response.');}
  const raw=extractReply(data);
  const parsed=parseJsonObject(raw);
  if(!parsed)throw new HttpError(502,'تعذر فهم نتيجة تحليل الصورة. / Could not parse image analysis.');
  return {
    query:clamp(parsed?.query,500),
    productType:clamp(parsed?.productType,180),
    visibleText:clamp(parsed?.visibleText,300),
    confidence:['high','medium','low','none'].includes(parsed?.confidence)?parsed.confidence:'low'
  };
}

function aiProviderError(status){
  if(status===429)return new HttpError(429,'تم الوصول إلى حد الاستخدام مؤقتًا. حاول بعد قليل. / AI usage limit reached. Try again shortly.');
  if(status===402)return new HttpError(503,'خدمة المساعد الذكي متوقفة مؤقتًا بسبب حد الميزانية. / AI assistant budget limit reached.');
  if(status===401||status===403)return new HttpError(503,'إعداد خدمة الذكاء الاصطناعي يحتاج مراجعة. / AI service configuration needs review.');
  return new HttpError(502,'تعذر الحصول على رد من المساعد الذكي. / AI assistant unavailable.');
}

export async function aiChat(user,body={},req=null){
  assert(!user||user.role==='client',403,'المساعد الذكي متاح للعملاء والمتصفحين فقط / AI assistant is for customers and visitors only');
  const image='';
  const message=clamp(body.message,2000);
  assert(message,400,'اكتب رسالتك / Enter a message');
  const language=body.language==='en'?'en':'ar';
  const marketingSignal=safeMarketingSignal(body.marketingSignal);
  const proactive=!!marketingSignal;
  let conversation=null;
  if(!proactive){
    conversation=await ensureConversation(user,body,true);
    const savedText=image?(message|| (language==='ar'?'📷 بحث بصورة':'📷 Image search')):message;
    const saved=await saveCustomerMessage(conversation,savedText);
    conversation=saved.conversation;
    if(conversation.status==='human')return {conversationId:conversation.id,humanMode:true};
    if(wantsHumanSupport(message)){
      const reply=language==='en'
        ?'Your request is now waiting for a customer service agent. I can still help you here until a team member takes over.'
        :'طلبك الآن بانتظار موظف خدمة العملاء. أقدر أواصل مساعدتك هنا إلى أن يستلم الموظف المحادثة.';
      conversation=await requestHumanHandoff(conversation);
      const metadata={handoff:'waiting',leadPrompt:!user};
      await saveAiMessage(conversation,reply,metadata);
      await recordAiUsage({surface:'customer',source:'database',user,conversationId:conversation.id,model:''});
      return {reply,source:'database',conversationId:conversation.id,humanMode:false,waitingHuman:true,leadPrompt:!user};
    }
  }
  let gatewayUser='';
  const model=String(process.env.OPENAI_CHAT_MODEL||DEFAULT_MODEL).replace(/^openai\//,'');
  const policyPageId=policyPageIdForMessage(message);
  const policySignal=policyQuestionSignal(message);
  const guestSnapshotOptions=policySignal
    ?{...(policyPageId?{pageId:policyPageId}:{}),aiPolicies:true}
    :{q:message,aiCatalog:true};
  const state=await snapshot(user||null,!user?guestSnapshotOptions:{});
  const conversionSignals=await chatProductSignals();
  const history=normalizeHistory(body.history);
  const resolvedTextQuery=resolveCustomerProductQuery(state,message,history);
  const productActive=!policySignal&&(!!marketingSignal||isCustomerProductQuery(state,message,history,resolvedTextQuery));
  const resolvedProductSearch=productActive?customerProductSearch(state,resolvedTextQuery,language,conversionSignals):emptyProductSearch(resolvedTextQuery);
  if(!proactive&&!image){
    const direct=directCustomerAnswer(state,user,message,language,conversionSignals,resolvedTextQuery,resolvedProductSearch,productActive);
    if(direct){
      const ui=chatUiMetadata(state,resolvedTextQuery,language,conversionSignals,resolvedProductSearch);
      if(conversation){
        await saveAiMessage(conversation,direct,ui);
        await recordRecommendationImpressions({conversation,user,products:ui.products});
      }
      await recordAiUsage({surface:'customer',source:'database',user,conversationId:conversation?.id,model});
      return {reply:direct,source:'database',recommendations:ui.products,quickReplies:ui.quickReplies,...(conversation?{conversationId:conversation.id,humanMode:false,waitingHuman:!!conversation.handoff_requested_at}:{})};
    }
  }
  const apiKey=openAiApiKey();
  if(!apiKey)throw new HttpError(503,'لم يتم تفعيل مفتاح OpenAI بعد. / OpenAI API key is not configured yet.');
  const imageSearch=image?await analyzeProductImage({image,message,language,apiKey,model,gatewayUser:gatewayUser||(gatewayUser=enforceRateLimit(user,req))}):null;
  if(imageSearch?.confidence==='none'||imageSearch&&!imageSearch.query){
    const reply=language==='ar'
      ?'لم أستطع تحديد المنتج بوضوح من هذه الصورة. جرّب صورة أوضح للمنتج من الأمام أو أضف اسمه أو مواصفته.'
      :'I could not identify the product clearly from this image. Try a clearer front view or add the product name or specification.';
    if(conversation)await saveAiMessage(conversation,reply);
    await recordAiUsage({surface:'customer',source:'openai',user,conversationId:conversation?.id,model});
    return {reply,source:'openai',usage:null,...(conversation?{conversationId:conversation.id,humanMode:false}:{})};
  }
  const productQuery=[imageSearch?.query,imageSearch?.productType,imageSearch?.visibleText,marketingSignal?.query,marketingSignal?.productSku,marketingSignal?.productTitle,resolvedTextQuery].filter(Boolean).join(' ');
  const shouldSearchProducts=productActive||!!imageSearch||!!marketingSignal;
  const productSearch=!shouldSearchProducts
    ?emptyProductSearch(productQuery)
    :productQuery===resolvedTextQuery&&!imageSearch&&!marketingSignal
      ?resolvedProductSearch
      :customerProductSearch(state,productQuery,language,conversionSignals);
  const personalContextNeeded=!!user&&qHas(message.toLowerCase(),['طلبي','الطلب','الدفع','فاتورة','عرض','تتبع','order','payment','invoice','quote','tracking']);
  const policyPage=policyPageId?selectedPolicyPage(state,policyPageId):null;
  const fallbackPolicies=policySignal&&!policyPage?policyPagesForLanguage(state,language).slice(0,8).map(page=>({id:page.id,title:page.title,content:clamp(page.content,1800)})):[];
  const context={
    viewer:user?{signedIn:true}:{signedIn:false},
    products:productSearch.context,
    ...(policyPage?{policy:{id:policyPage.id,title:language==='en'?(policyPage.titleEn||policyPage.title):(policyPage.title||policyPage.titleEn),content:clamp(language==='en'?(policyPage.contentEn||policyPage.content):(policyPage.content||policyPage.contentEn),1800)}}:{}),
    ...(fallbackPolicies.length?{policies:fallbackPolicies}:{}),
    ...(imageSearch?{imageSearch}:{}),
    ...(marketingSignal?{shoppingSignal:marketingSignal}:{}),
    ...(personalContextNeeded?clientContext(state):{})
  };
  const ui=chatUiMetadata(state,productQuery,language,conversionSignals,productSearch);
  const cacheable=!user&&!proactive&&!imageSearch&&history.length===0;
  const cacheKey=cacheable?cacheKeyFor(language,message,context):'';
  if(cacheKey){
    const cached=await getCachedReply(cacheKey);
    if(cached){
      if(conversation){
        await saveAiMessage(conversation,cached,ui);
        await recordRecommendationImpressions({conversation,user,products:ui.products});
      }
      await recordAiUsage({surface:'customer',source:'cache',user,conversationId:conversation?.id,model});
      return {reply:cached,source:'cache',recommendations:ui.products,quickReplies:ui.quickReplies,...(conversation?{conversationId:conversation.id,humanMode:false,waitingHuman:!!conversation.handoff_requested_at}:{})};
    }
  }
  const system=language==='ar'
    ?`أنت مستشار مبيعات وتوريد محترف داخل IMSG. هدفك فهم ما يحتاجه العميل ومساعدته على اتخاذ قرار شراء مناسب، بدون ضغط أو مبالغة.
اعتمد على PLATFORM_CONTEXT_JSON في معلومات المنتجات والأسعار والمخزون والطلبات والعروض والسياسات. إذا احتوى السياق على policy أو policies فاعتبرها المصدر الرسمي للسؤال المتعلق بالسياسة، وأجب منها مباشرة وباختصار. لا تخترع أي سعر أو خصم أو مخزون أو حالة أو ميزة غير موجودة.
افهم احتياج العميل من كلامه وسلوكه الشرائي غير الحساس فقط، مثل البحث، المنتجات التي يقارنها، أو السلة. لا تستنتج أو تستخدم صفات حساسة شخصية.
أجب عن السؤال الحالي فقط. الرد العادي جملة أو جملتان قصيرتان، ولا تشرح سياسة كاملة ما لم يطلب العميل التفاصيل.
إذا احتجت توضيحًا، اسأل سؤالًا واحدًا فقط في الرد، ولا تجمع عدة أسئلة معًا. لا تسأل عن الكمية في البداية إلا إذا كانت ضرورية للسعر أو الحد الأدنى للطلب، ولا تكرر سؤالًا أجاب عنه العميل سابقًا.
إذا كانت المنتجات الموجودة في السياق مناسبة، لا تسرد مواصفاتها كلها في النص لأن الواجهة ستعرض بطاقات المنتجات. اكتفِ بجملة قصيرة مثل "هذه أنسب الخيارات" ثم اسأل سؤالًا واحدًا فقط عند الحاجة.
إذا كان المنتج stockUnlimited=true فقل إنه متوفر للطلب ولا تذكر رقم مخزون. إذا كان stockUnlimited=false فاستخدم رقم المخزون الموجود فقط ولا تخترع توفرًا غير موجود.
إذا كان PLATFORM_CONTEXT_JSON يحتوي imageSearch، فالصورة تم تحليلها مرة واحدة مسبقًا. استخدم وصف imageSearch والمنتجات المطابقة في السياق لتحديد أقرب الخيارات، وقل بوضوح "أقرب تطابق" عندما لا يكون التطابق مؤكدًا.
إذا لم يوجد منتج مطابق، اقترح إرسال طلب خاص بدل اختراع منتج.
لا تستخدم ندرة أو استعجالًا أو خصمًا غير حقيقي، ولا تقل إن منتجًا هو الأفضل إلا إذا شرحت معيار المقارنة من البيانات المتاحة.
ممنوع كشف هوية المورد أو اسمه أو رقم هاتفه أو بريده أو أي وسيلة تواصل مباشرة، وممنوع طلب التواصل خارج IMSG.
لا تعرض المعرفات الداخلية لقاعدة البيانات. استخدم فقط رقم الطلب/العرض الظاهر إن وجد.
لا تدّع أنك عدلت طلبًا أو دفعت أو وافقت على عرض. أنت تشرح وتقترح فقط.
إذا كان PLATFORM_CONTEXT_JSON يحتوي shoppingSignal، فأنت تكتب رسالة استباقية قصيرة جدًا: جملة أو جملتان، طبيعية وغير مزعجة، لا تذكر أنك تراقب العميل، وتقدّم مساعدة مرتبطة مباشرة بما يبدو أنه يبحث عنه. لا تبدأ بتحية طويلة.`
    :`You are a professional sales and sourcing advisor inside IMSG. Your goal is to understand what the customer needs and help them make a suitable purchase decision without pressure or exaggeration.
Use PLATFORM_CONTEXT_JSON for product, price, stock, order, quote, and policy facts. If the context contains policy or policies, treat them as the official source for policy questions and answer from them directly and concisely. Never invent a price, discount, stock level, status, feature, or promotion.
Understand needs only from the customer's words and non-sensitive shopping behavior such as searches, compared products, or cart activity. Never infer or use sensitive personal traits.
Answer only the current question. Normal replies should be one or two short sentences; never paste a full policy unless the customer asks for details.
If clarification is necessary, ask at most one question per reply. Never bundle multiple questions. Do not ask for quantity early unless price or MOQ truly requires it, and never repeat a question the customer already answered.
When the context contains suitable products, do not list all specifications in prose because the UI will show product cards. Use one short sentence such as "These are the best matching options" and ask only one clarification if needed.
If stockUnlimited=true, say the product is available to order and do not mention a stock count. If stockUnlimited=false, use only the explicit tracked stock value and do not invent availability.
If PLATFORM_CONTEXT_JSON contains imageSearch, the image was analyzed once before this response. Use the imageSearch description and matched catalog products to identify the closest options, and explicitly say "closest match" when the match is uncertain.
If there is no exact match, suggest a custom sourcing request rather than inventing a product.
Do not use fake scarcity, false urgency, or nonexistent discounts. Do not call something the best unless you explain the comparison criterion from available data.
Never reveal supplier identity, name, phone, email, or direct contact details, and never encourage off-platform contact.
Never expose internal database IDs; use only visible order/offer numbers when present.
Do not claim you changed an order, made a payment, or accepted an offer. You only explain and recommend.
If PLATFORM_CONTEXT_JSON contains shoppingSignal, write a very short proactive message: one or two natural, non-intrusive sentences. Never say you are monitoring the customer. Offer help directly related to what they appear to be looking for, with no long greeting.`;
  const payload={
    model,
    messages:[
      {role:'system',content:system},
      {role:'system',content:'PLATFORM_CONTEXT_JSON\n'+JSON.stringify(context)},
      ...history,
      {role:'user',content:message}
    ],
    max_completion_tokens:190,
    temperature:0.2,
    reasoning_effort:'none'
  };
  if(!gatewayUser)gatewayUser=enforceRateLimit(user,req);
  let response;
  try{
    ({response}=await openAiRequest({apiKey,payload,timeoutMs:26000}));
  }catch{
    throw new HttpError(502,'تعذر الاتصال بالمساعد الذكي. / Could not reach AI assistant.');
  }
  if(!response.ok)throw aiProviderError(response.status);
  let data;try{data=await response.json();}catch{throw new HttpError(502,'استجابة المساعد غير صالحة. / Invalid AI response.');}
  const reply=extractReply(data);
  if(!reply)throw new HttpError(502,'لم يصل رد من المساعد الذكي. / Empty AI response.');
  if(cacheKey)await setCachedReply(cacheKey,reply,model);
  if(conversation){
    const current=await ensureConversation(user,{conversationId:conversation.id,guestKey:body.guestKey,language},false);
    if(current?.status==='human')return {conversationId:current.id,humanMode:true};
    await saveAiMessage(current||conversation,reply,ui);
    await recordRecommendationImpressions({conversation:current||conversation,user,products:ui.products});
  }
  await recordAiUsage({surface:'customer',source:'openai',user,conversationId:conversation?.id,model,usage:data?.usage});
  return {reply,source:'openai',usage:data?.usage||null,recommendations:ui.products,quickReplies:ui.quickReplies,...(conversation?{conversationId:conversation.id,humanMode:false,waitingHuman:!!conversation.handoff_requested_at}:{})};
}
