import {db} from '../lib/supabase.mjs';

const RATE_PER_MILLION={
  'gpt-6-luna':{input:0.10,cached:0.01,output:0.50}
};

const nonNegative=value=>Math.max(0,Number(value)||0);
export function normalizeAiUsage(usage={}){
  const prompt=nonNegative(usage?.prompt_tokens);
  const completion=nonNegative(usage?.completion_tokens);
  const cached=Math.min(prompt,nonNegative(usage?.prompt_tokens_details?.cached_tokens));
  return {promptTokens:prompt,cachedTokens:cached,completionTokens:completion,totalTokens:nonNegative(usage?.total_tokens)||prompt+completion};
}
export function estimateAiCostUsd(model,usage={}){
  const u=normalizeAiUsage(usage),rate=RATE_PER_MILLION[String(model||'').toLowerCase()];
  if(!rate)return 0;
  const uncached=Math.max(0,u.promptTokens-u.cachedTokens);
  return Number(((uncached*rate.input+u.cachedTokens*rate.cached+u.completionTokens*rate.output)/1_000_000).toFixed(8));
}
export async function recordAiUsage({surface,source,user=null,conversationId=null,model='',usage=null}={}){
  try{
    const u=normalizeAiUsage(usage||{});
    await db('ai_usage_events','',{
      method:'POST',
      body:{
        surface,
        source,
        actor_id:user?.id||null,
        conversation_id:conversationId||null,
        model:String(model||''),
        prompt_tokens:u.promptTokens,
        cached_tokens:u.cachedTokens,
        completion_tokens:u.completionTokens,
        total_tokens:u.totalTokens,
        estimated_cost_usd:source==='openai'?estimateAiCostUsd(model,usage||{}):0
      },
      headers:{Prefer:'return=minimal'}
    });
  }catch(error){
    console.warn('AI usage logging failed',JSON.stringify({surface,source,error:error?.message||'unknown'}));
  }
}
async function usageRows(since){
  const result=[];
  for(let offset=0;offset<50000;offset+=1000){
    const rows=await db('ai_usage_events',`created_at=gte.${encodeURIComponent(since)}&select=surface,source,prompt_tokens,cached_tokens,completion_tokens,total_tokens,estimated_cost_usd,created_at&order=created_at.desc&limit=1000&offset=${offset}`);
    result.push(...rows);
    if(rows.length<1000)break;
  }
  return result;
}
function aggregate(rows){
  const summary={requests:0,database:0,cache:0,openai:0,promptTokens:0,cachedTokens:0,completionTokens:0,totalTokens:0,costUsd:0,bySurface:{}};
  for(const row of rows){
    summary.requests+=1;
    if(row.source==='database')summary.database+=1;
    else if(row.source==='cache')summary.cache+=1;
    else if(row.source==='openai')summary.openai+=1;
    summary.promptTokens+=nonNegative(row.prompt_tokens);
    summary.cachedTokens+=nonNegative(row.cached_tokens);
    summary.completionTokens+=nonNegative(row.completion_tokens);
    summary.totalTokens+=nonNegative(row.total_tokens);
    summary.costUsd+=nonNegative(row.estimated_cost_usd);
    const surface=String(row.surface||'other');
    const target=summary.bySurface[surface]||(summary.bySurface[surface]={requests:0,database:0,cache:0,openai:0,totalTokens:0,costUsd:0});
    target.requests+=1;
    if(row.source==='database')target.database+=1;
    else if(row.source==='cache')target.cache+=1;
    else if(row.source==='openai')target.openai+=1;
    target.totalTokens+=nonNegative(row.total_tokens);
    target.costUsd+=nonNegative(row.estimated_cost_usd);
  }
  summary.costUsd=Number(summary.costUsd.toFixed(6));
  for(const value of Object.values(summary.bySurface))value.costUsd=Number(value.costUsd.toFixed(6));
  summary.freeRate=summary.requests?Number((((summary.database+summary.cache)/summary.requests)*100).toFixed(1)):0;
  return summary;
}
export async function aiUsageSummary(){
  const now=new Date();
  const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
  const todayStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString();
  const rows=await usageRows(monthStart);
  return {
    month:aggregate(rows),
    today:aggregate(rows.filter(row=>String(row.created_at||'')>=todayStart)),
    since:monthStart
  };
}
