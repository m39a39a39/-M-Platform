(() => {
  const header=document.querySelector('.page-head');
  const stats=document.querySelector('.customer-stats');
  const nav=document.querySelector('.side-nav');
  if(!header||!stats||!nav)return;

  const sync=()=>{
    const publicOffersOpen=!!nav.querySelector('[data-view="market"].active');
    header.classList.toggle('hidden',publicOffersOpen);
    stats.classList.toggle('hidden',publicOffersOpen);
  };

  sync();
  new MutationObserver(sync).observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
})();
