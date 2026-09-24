import {normalizeHome} from './legacy-home-data.mjs';
import {defaultStore,defaultOptions} from '../../shared/storefront-model.mjs';
export function upgradeStore(input,settings={}){
 if(input?.schemaVersion===2)return input;
 if(!input)return defaultStore();
 const h=normalizeHome(input.home||{},settings),out={...defaultStore(),...structuredClone(input),schemaVersion:2,options:{...defaultOptions(),...Object.fromEntries(Object.keys(defaultOptions()).map(k=>[k,h[k]]))}};
 const old=input.sections||[],explicit=new Set(old.map(s=>s.type));
 const builtin=(type)=>{const keys={welcome:['welcomeTitle','welcomeDescription','browseLabel'],catalog:['catalogTitle','catalogDescription'],request:['requestTitle','requestDescription','requestButton'],footer:['companyName','companyDescription']}[type];return {id:'home-'+type,type,visible:h['show'+type[0].toUpperCase()+type.slice(1)]!==false,channel:'both',...Object.fromEntries(keys.flatMap((k,i)=>[[['title','subtitle','button'][i],h[k]],[['title','subtitle','button'][i]+'En',h[k+'En']]])),...(type==='request'?{buttonTarget:'request'}:{}),...(type==='footer'?{email:h.showContact?h.email:'',phone:h.showContact?h.phone:''}:{})};};
 out.sections=[...(!explicit.has('welcome')&&!old.some(s=>s.type==='hero')?[builtin('welcome')]:[]),...old.map(s=>['welcome','catalog','request','footer'].includes(s.type)?{...s,...builtin(s.type),id:s.id,visible:s.visible&&builtin(s.type).visible}:{...s,productSource:s.collectionId?'collection':'latest'}),...['catalog','request','footer'].filter(t=>!explicit.has(t)).map(builtin)].map(s=>({...s,type:s.type==='welcome'?'hero':s.type==='request'?'cta':s.type}));
 delete out.home;return out;
}
export function upgradeSettings(data={}){const out={...data,storefront:upgradeStore(data.storefront,data)};if(data.studioDraft)out.studioDraft=upgradeStore(data.studioDraft,data);for(const k of ['homeTitleAr','homeTitleEn','homeSubtitleAr','homeSubtitleEn'])delete out[k];return out;}
