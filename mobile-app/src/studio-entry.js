import './ios-select-fix.css';
import './ios-select-fix.js';
import * as portalRoutes from './portal-routes.js';
window.MPortal=portalRoutes;
import {mountSiteChrome} from './site-chrome.js';
import {languageReady,getLanguage,toggleLanguage} from './language.js';
await languageReady;document.documentElement.lang=getLanguage();document.documentElement.dir=getLanguage()==='en'?'ltr':'rtl';
window.MStudioToggleLanguage=async()=>{await toggleLanguage();document.documentElement.lang=getLanguage();document.documentElement.dir=getLanguage()==='en'?'ltr':'rtl';};
import './storefront.css';
import * as storefront from './storefront.js';
import * as admin from './admin-mobile.js';
import {filesToCompressedSources} from './image-upload.js';
window.MStudioChrome=mountSiteChrome;
window.MStudioImages={filesToCompressedSources};
window.MStorefront=storefront;window.MAdmin=admin;
import {session} from './session.js';
import {knowledgeBase} from './knowledge-base.js';
window.MStudioSession=session;
window.MKnowledgeBase=knowledgeBase;
const STUDIO_ASSET_VERSION='20261025-staff-access-v3';
for(const file of ['domain.js','app.js','studio.js','product-copy.js','product-complete.js','product-images.js','live.js','ai-catalog.js','admin-ai.js','unified.js','supply-bulk.js','catalog-bulk.js','storefront-controls.js','advanced.js','theme-editor.js','store-design.js']){
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/studio/'+file+'?v='+STUDIO_ASSET_VERSION;script.onload=resolve;script.onerror=reject;document.body.append(script);});
}

