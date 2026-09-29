import {randomUUID} from 'node:crypto';
import {config,db} from '../backend/lib/supabase.mjs';

const KEY='4b29df01-8b71-4faf-b5ae-5c89f9892c1e';
const OWNER='e729ac18-9ee3-4a8b-bcc0-fcb0e308f3e9';
const ITEMS=[
  {label:'J85',url:'https://d2ol7oe51mr4n9.cloudfront.net/user_3Jfoz6Yb60CP0AVtvBZZ6UGT0HQ/4ff2dbce-d7ff-4018-b7fe-35b4aefb4c42.jpg'},
  {label:'B23',url:'https://d2ol7oe51mr4n9.cloudfront.net/user_3Jfoz6Yb60CP0AVtvBZZ6UGT0HQ/e0f43347-c04d-4c8f-9014-ad70a94b5f9b.jpg'},
  {label:'Q68',url:'https://d2ol7oe51mr4n9.cloudfront.net/user_3Jfoz6Yb60CP0AVtvBZZ6UGT0HQ/438da7e4-9dcb-4ee7-b175-95af832eb9aa.jpg'},
  {label:'Q71-box',url:'https://d2ol7oe51mr4n9.cloudfront.net/user_3Jfoz6Yb60CP0AVtvBZZ6UGT0HQ/d5c04fca-e9fe-424e-b2fd-215704dc93b5.jpg'},
  {label:'Q71-product',url:'https://d2ol7oe51mr4n9.cloudfront.net/user_3Jfoz6Yb60CP0AVtvBZZ6UGT0HQ/c6383223-4931-4426-ac5c-ee52c0254f55.jpg'}
];
export default async function handler(req,res){
  try{
    if(String(req.query?.key||'')!==KEY){res.status(404).json({error:'Not found'});return;}
    const c=config(), out=[];
    for(const item of ITEMS){
      const r=await fetch(item.url,{headers:{'user-agent':'Mozilla/5.0 MPlatformImporter/1.0'},signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error(item.label+': source '+r.status);
      const bytes=Buffer.from(await r.arrayBuffer());
      if(bytes.length<12||bytes.length>5242880)throw new Error(item.label+': invalid size');
      const id=randomUUID(),mediaPath=`${OWNER}/${id}`;
      const up=await fetch(`${c.url}/storage/v1/object/m-private/${mediaPath}`,{
        method:'POST',
        headers:{apikey:c.service,Authorization:`Bearer ${c.service}`,'Content-Type':'image/jpeg'},
        body:bytes,
        signal:AbortSignal.timeout(20000)
      });
      if(!up.ok)throw new Error(item.label+': upload '+up.status);
      await db('media','',{method:'POST',body:{id,owner_id:OWNER,path:mediaPath,mime:'image/jpeg'}});
      out.push({label:item.label,id,src:`/api/media/${id}`});
    }
    res.status(200).json({ok:true,items:out});
  }catch(error){res.status(500).json({ok:false,error:String(error?.message||error)});}
}