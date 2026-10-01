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
window.MStudioSession=session;
for(const file of ['domain.js','app.js','studio.js','live.js','unified.js','supply-bulk.js','catalog-bulk.js','storefront-controls.js','advanced.js','theme-editor.js']){
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/studio/'+file;script.onload=resolve;script.onerror=reject;document.body.append(script);});
}
