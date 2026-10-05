import {writeFile,mkdir} from 'node:fs/promises';
const url='https://www.moxom.com.cn/collections/smart-watch?page=1';
const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; MPlatformCatalogResearch/1.0)','accept-language':'en-US,en;q=0.9'}});
if(!r.ok)throw new Error(String(r.status));
const html=(await r.text()).replaceAll('\\/','/');
const snippets=[];
for(const m of html.matchAll(/href=["'](\/products\/[A-Za-z0-9_%().,+&=\-]+)["']/gi)){
  snippets.push(html.slice(Math.max(0,m.index-1200),Math.min(html.length,m.index+2200)));
  if(snippets.length>=6)break;
}
await mkdir('tmp',{recursive:true});
await writeFile('tmp/moxom-featured-crawl.json',JSON.stringify({url,snippets},null,2));
console.log('saved',snippets.length);
