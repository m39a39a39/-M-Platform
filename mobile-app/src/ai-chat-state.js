export function latestAssistantQuickReplies(messages=[],humanMode=false){
  if(humanMode)return [];
  const latest=[...(Array.isArray(messages)?messages:[])].reverse().find(row=>row?.role==='assistant');
  if(!latest)return [];
  const products=latest?.metadata?.products;
  const rows=latest?.metadata?.quickReplies;
  if(!Array.isArray(products)||!products.length||!Array.isArray(rows)||!rows.length)return [];
  return rows.slice(0,4);
}
