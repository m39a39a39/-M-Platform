import {renderStoreHeader,renderStoreFooter} from './storefront.js';
let current=null;
export function mountSiteChrome(state,options={},actions={}){
 if(!state?.settings)return;
 current={state,options,actions};document.body.classList.add('has-site-chrome');
 let header=document.getElementById('site-header'),footer=document.getElementById('site-footer');
 if(!header){header=document.createElement('div');header.id='site-header';document.body.prepend(header);}
 if(!footer){footer=document.createElement('div');footer.id='site-footer';document.getElementById('app')?.after(footer);}
 for(const el of [header,footer]){el.className='published-storefront shared-site-chrome';el.dir=document.documentElement.dir;el.style.setProperty('--store-accent',state.settings.storefront?.theme?.color||'#193d43');el.onclick=e=>{const a=e.target.closest('[data-store-action]');if(!a)return;if(a.dataset.storeAction==='home')return;e.preventDefault();actions.action?.(a.dataset.storeAction);};}
 header.innerHTML=renderStoreHeader(state,options);footer.innerHTML=renderStoreFooter(state,options);actions.hydrate?.(header);actions.hydrate?.(footer);
}
export function refreshSiteChrome(){if(current)mountSiteChrome(current.state,current.options,current.actions);}
