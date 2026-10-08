import {portalRole,portalUrl} from './portal-routes.js';
import './portal.css';
import {renderStoreHeader,renderStoreFooter} from './storefront.js';
let current=null;
export function mountSiteChrome(state,options={},actions={}){
 if(!state?.settings)return;
 current={state,options,actions};document.body.classList.add('has-site-chrome');
 let header=document.getElementById('site-header'),footer=document.getElementById('site-footer');
 if(!header){header=document.createElement('div');header.id='site-header';const app=document.getElementById('app');if(app)app.prepend(header);else document.body.prepend(header);}
 if(!footer){footer=document.createElement('div');footer.id='site-footer';document.getElementById('app')?.after(footer);}
 for(const el of [header,footer]){el.className='published-storefront shared-site-chrome';el.dir=document.documentElement.dir;el.style.setProperty('--store-accent',state.settings.storefront?.theme?.color||'#193d43');el.onclick=e=>{const a=e.target.closest('[data-store-action]');if(!a)return;if(a.dataset.storeAction==='home')return;e.preventDefault();actions.action?.(a.dataset.storeAction);};}
 const portal=portalRole(location.pathname);
 document.body.classList.toggle('customer-store-shell',portal==='client'||options.role==='client');
 if(portal&&portal!=='client'){header.innerHTML=portalHeader(portal,options.role,options.cartCount||0);footer.innerHTML='';}else{header.innerHTML=renderStoreHeader(state,options)+(portal==='client'&&options.role==='client'?customerNavigation():'');footer.innerHTML=renderStoreFooter(state,options);}actions.hydrate?.(header);actions.hydrate?.(footer);
}
export function refreshSiteChrome(){if(current)mountSiteChrome(current.state,current.options,current.actions);}

function portalHeader(role,signedRole,cartCount){
 const ar=document.documentElement.lang!=='en',label=role==='admin'?(ar?'الإدارة':'Administration'):role==='supplier'?(ar?'بوابة المورد':'Supplier portal'):(ar?'بوابة العميل':'Customer portal');
 const authenticated=signedRole===role;
 const rows=role==='supplier'?[['home','الرئيسية','Home'],['orders','الطلبات','Orders'],['requests','طلبات الأسعار','Quote requests'],['offers','المنتجات','Products']]:role==='client'?[['requests','مشترياتي','Purchases'],['offers','طلبات التوريد','Sourcing requests']]:[];
 const current=new URLSearchParams(location.search).get('screen')||'home';
 return `<header class="portal-header ${role==='client'?'customer-portal-header':''}"><div class="portal-brand"><a href="${portalUrl(role)}">IMSG</a><strong>${label}</strong></div><nav aria-label="${label}">${authenticated?rows.map(([screen,a,e])=>`<a class="portal-primary-link" href="${portalUrl(role,screen)}" ${screen===current?'aria-current="page"':''}>${ar?a:e}</a>`).join(''):''}<a href="/?store=1">${ar?'المتجر':'Store'}</a>${authenticated&&role==='client'?`<button type="button" data-store-action="cart">${ar?'السلة':'Cart'} (${Number(cartCount)||0})</button>`:''}${authenticated?`<a href="${portalUrl(role,'notifications')}">${ar?'الإشعارات':'Notifications'}</a><a class="portal-account-link" href="${portalUrl(role,role==='admin'?'settings':'account')}">${ar?'حسابي':'Account'}</a>`:`<a href="${portalUrl(role==='supplier'?'client':'supplier')}">${role==='supplier'?(ar?'بوابة العميل':'Customer portal'):(ar?'بوابة المورد':'Supplier portal')}</a>`}<button type="button" data-store-action="language">${ar?'English':'العربية'}</button></nav></header>`;
}

function customerNavigation(){
 const ar=document.documentElement.lang!=='en',active=new URLSearchParams(location.search).get('screen')||'home';
 return `<nav class="customer-account-nav" aria-label="${ar?'حساب العميل':'Customer account'}">${[['requests','مشترياتي','Purchases'],['offers','طلبات التوريد','Sourcing requests'],['account','حسابي','Account']].map(([screen,a,e])=>`<a href="${portalUrl('client',screen)}" ${active===screen?'aria-current="page"':''}>${ar?a:e}</a>`).join('')}</nav>`;
}
