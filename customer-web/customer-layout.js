(() => {
  const stats=document.querySelector('.customer-stats');
  const nav=document.querySelector('.side-nav');
  if(!stats||!nav)return;

  const sync=()=>{
    const publicOffersOpen=!!nav.querySelector('[data-view="market"].active');
    stats.classList.toggle('hidden',publicOffersOpen);
  };

  sync();
  new MutationObserver(sync).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
