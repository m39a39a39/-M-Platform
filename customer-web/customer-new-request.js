document.addEventListener('m:ready',()=>{
  const params=new URLSearchParams(location.search);
  if(params.get('action')!=='newRequest'||M.session()?.role!=='client')return;
  M.openDialog('requestDialog');
  params.delete('action');
  const query=params.toString();
  history.replaceState(null,'',location.pathname+(query?'?'+query:'')+(location.hash||''));
});
