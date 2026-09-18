let active=false;
let images=[];
let index=0;
let scale=1;
let translateX=0;
let translateY=0;
let startX=0;
let startY=0;
let startDistance=0;
let startScale=1;
let pointers=new Map();

const $=id=>document.getElementById(id);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));

function applyTransform(){
  const img=$('imageViewerImage');if(!img)return;
  img.style.transform=`translate3d(${translateX}px,${translateY}px,0) scale(${scale})`;
}
function resetTransform(){scale=1;translateX=0;translateY=0;applyTransform();}
function usableSource(img){return img?.currentSrc||img?.src||'';}
function render(){
  const img=$('imageViewerImage'),counter=$('imageViewerCounter'),prev=$('imageViewerPrev'),next=$('imageViewerNext');
  if(!img||!images.length)return;
  img.src=images[index];
  counter.textContent=`${index+1} / ${images.length}`;
  prev.classList.toggle('hidden',images.length<2);
  next.classList.toggle('hidden',images.length<2);
  resetTransform();
}
export function openImageViewer(clicked){
  const group=clicked.closest('[data-viewer-gallery]')||clicked.parentElement;
  const candidates=[...(group?.querySelectorAll?.('img[data-image-viewer]')||[clicked])];
  images=candidates.map(usableSource).filter(Boolean);
  const src=usableSource(clicked);
  if(!images.length&&src)images=[src];
  index=Math.max(0,images.indexOf(src));
  if(!images.length)return;
  active=true;
  $('imageViewer')?.classList.remove('hidden');
  document.body.classList.add('image-viewer-open');
  render();
}
export function closeImageViewer(){
  if(!active)return;
  active=false;images=[];pointers.clear();
  $('imageViewer')?.classList.add('hidden');
  document.body.classList.remove('image-viewer-open');
  const img=$('imageViewerImage');if(img){img.removeAttribute('src');resetTransform();}
}
function step(delta){
  if(images.length<2)return;
  index=(index+delta+images.length)%images.length;
  render();
}
function distance(){
  const pts=[...pointers.values()];
  if(pts.length<2)return 0;
  return Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
}
function bind(){
  document.addEventListener('click',e=>{
    const image=e.target.closest?.('img[data-image-viewer]');
    if(image){
      e.preventDefault();e.stopPropagation();openImageViewer(image);return;
    }
    if(e.target.closest?.('[data-image-viewer-close]')){e.preventDefault();closeImageViewer();return;}
    if(e.target.closest?.('[data-image-viewer-prev]')){e.preventDefault();step(-1);return;}
    if(e.target.closest?.('[data-image-viewer-next]')){e.preventDefault();step(1);return;}
  },true);
  document.addEventListener('keydown',e=>{
    if(!active)return;
    if(e.key==='Escape')closeImageViewer();
    else if(e.key==='ArrowLeft')step(document.documentElement.dir==='rtl'?1:-1);
    else if(e.key==='ArrowRight')step(document.documentElement.dir==='rtl'?-1:1);
  });
  const stage=$('imageViewerStage');
  if(!stage)return;
  stage.addEventListener('pointerdown',e=>{
    if(!active)return;
    stage.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){startX=e.clientX;startY=e.clientY;}
    if(pointers.size===2){startDistance=distance();startScale=scale;}
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      const d=distance();
      if(startDistance>0){scale=clamp(startScale*(d/startDistance),1,4);applyTransform();}
    }
  });
  const endPointer=e=>{
    const point=pointers.get(e.pointerId);
    if(!point)return;
    if(pointers.size===1&&scale===1){
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.2)step(dx<0?1:-1);
    }
    pointers.delete(e.pointerId);
    if(pointers.size<2)startDistance=0;
  };
  stage.addEventListener('pointerup',endPointer);
  stage.addEventListener('pointercancel',endPointer);
  stage.addEventListener('dblclick',()=>{
    scale=scale>1?1:2;translateX=0;translateY=0;applyTransform();
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
