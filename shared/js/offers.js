document.addEventListener('m:ready', async () =>{
  const grid=document.getElementById('offersGrid'),user=M.session();
  if(user?.role==='client'){
    const offer=new URLSearchParams(location.search).get('offer');
    location.replace('customer.html'+(offer?'?offer='+encodeURIComponent(offer):'')+'#market');return;
  }
  function render(){const offers=M.state().publicOffers.filter(W.available);grid.innerHTML=offers.length?offers.map(o=>W.offerCard(o,null)).join(''):W.empty();}
  grid.onclick=e=>{const b=e.target.closest('.request-market');if(b)location.href='login.html?role=client&offer='+encodeURIComponent(b.dataset.id);};
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',render));
  render();
});
