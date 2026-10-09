import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {rpc,HttpError} from '../lib/supabase.mjs';

const limits={
  message:{guest:12,client:40,seconds:600},
  lead:{guest:6,client:6,seconds:600},
  conversion:{guest:120,client:120,seconds:600},
  read:{guest:120,client:120,seconds:60}
};

export async function enforceChatLimit(user,req,scope){
  const policy=limits[scope];
  if(!policy)throw new Error('Unknown chat rate limit');
  // Vercel supplies x-forwarded-for. Never key limits by a caller-created guestKey.
  const forwarded=String(req?.headers?.['x-forwarded-for']||'').split(',')[0].trim();
  const ip=isIP(forwarded)?forwarded:String(req?.socket?.remoteAddress||'unknown');
  const identity=user?.id?'user:'+user.id:'ip:'+ip;
  const key=scope+':'+createHash('sha256').update(identity).digest('hex');
  const result=await rpc('consume_chat_rate_limit',{
    p_key:key,p_limit:user?policy.client:policy.guest,p_window_seconds:policy.seconds
  });
  // Database outages or unexpected responses must not disable abuse protection.
  if(typeof result?.allowed!=='boolean')throw new HttpError(503,'تعذر التحقق من حد الطلبات / Rate limit service unavailable');
  if(!result.allowed){
    const error=new HttpError(429,'طلبات كثيرة؛ حاول بعد قليل / Too many requests. Try again shortly.');
    error.retryAfter=Math.max(1,Math.min(policy.seconds,Number(result.retry_after)||policy.seconds));
    throw error;
  }
}
