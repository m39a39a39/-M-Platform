import { Preferences } from '@capacitor/preferences';
let language='ar';
const listeners=new Set();
export const getLanguage=()=>language;
export function onLanguageChange(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export const languageReady=Preferences.get({key:'language'}).then(saved=>{language=saved.value==='en'?'en':'ar';for(const listener of listeners)listener(language);}).catch(()=>{});
export async function toggleLanguage(){language=language==='ar'?'en':'ar';for(const listener of listeners)listener(language);await Preferences.set({key:'language',value:language});}
