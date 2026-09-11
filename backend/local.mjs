import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import handler from './app.mjs';
const root=path.resolve('dist');
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/'))return handler(req,res);
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep))throw Error();
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
    if(!types[path.extname(file)])throw Error();
    res.setHeader('Content-Type',types[path.extname(file)]);res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Not found');}
}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('M Platform: http://localhost:'+(process.env.PORT||3000)));
