const MAX_FILES=5;
const MAX_INPUT_BYTES=10*1024*1024;
const TARGET_BYTES=900*1024;
const MAX_DIMENSION=2200;
const SAFE_PASSTHROUGH_BYTES=2*1024*1024;

const readAsDataUrl=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error||new Error('read_failed'));
  reader.readAsDataURL(blob);
});

const dataUrlToBlob=dataUrl=>{
  const [head,body='']=String(dataUrl||'').split(',');
  const mime=(head.match(/^data:([^;]+)/)||[])[1]||'application/octet-stream';
  const binary=atob(body);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:mime});
};

async function loadImage(file){
  if(typeof createImageBitmap==='function'){
    try{
      const bitmap=await createImageBitmap(file);
      return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
    }catch{}
  }
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();
    image.decoding='async';
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error('decode_failed'));
      image.src=url;
    });
    return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>{}};
  }finally{
    URL.revokeObjectURL(url);
  }
}

const encodeCanvas=(canvas,type,quality)=>new Promise(resolve=>{
  let settled=false;
  const done=blob=>{if(settled)return;settled=true;resolve(blob||null);};
  const fallback=()=>{
    try{
      const data=canvas.toDataURL(type,quality);
      done(data&&data!=='data:,'?dataUrlToBlob(data):null);
    }catch{done(null);}
  };
  try{
    if(typeof canvas.toBlob==='function'){
      canvas.toBlob(blob=>blob?done(blob):fallback(),type,quality);
      setTimeout(fallback,3500);
      return;
    }
    fallback();
  }catch{fallback();}
});

const jpegCanvas=canvas=>{
  const flat=document.createElement('canvas');
  flat.width=canvas.width;flat.height=canvas.height;
  const ctx=flat.getContext('2d');
  if(!ctx)return null;
  ctx.fillStyle='#fff';
  ctx.fillRect(0,0,flat.width,flat.height);
  ctx.drawImage(canvas,0,0);
  return flat;
};

async function canvasBlob(canvas,quality){
  const candidates=[];
  const webp=await encodeCanvas(canvas,'image/webp',quality);
  if(webp?.size)candidates.push(webp);

  const flat=jpegCanvas(canvas);
  if(flat){
    const jpeg=await encodeCanvas(flat,'image/jpeg',Math.max(.45,quality));
    flat.width=1;flat.height=1;
    if(jpeg?.size)candidates.push(jpeg);
  }

  if(!candidates.length){
    const png=await encodeCanvas(canvas,'image/png',1);
    if(png?.size)candidates.push(png);
  }
  if(!candidates.length)throw new Error('compress_failed');
  return candidates.sort((a,b)=>a.size-b.size)[0];
}

async function compressFile(file,{targetBytes=TARGET_BYTES,maxDimension=MAX_DIMENSION}={}){
  if(!(file instanceof Blob)||!String(file.type||'').startsWith('image/'))throw new Error('unsupported');
  if(file.size>MAX_INPUT_BYTES)throw new Error('too_large');

  const safeTarget=Math.max(120*1024,Number(targetBytes)||TARGET_BYTES);
  const requestedDimension=Math.max(320,Math.min(MAX_DIMENSION,Number(maxDimension)||MAX_DIMENSION));
  const passThrough=['image/jpeg','image/png','image/webp'].includes(file.type)&&
    file.size<=Math.max(safeTarget,SAFE_PASSTHROUGH_BYTES)&&requestedDimension>=MAX_DIMENSION;
  if(passThrough)return readAsDataUrl(file);

  const loaded=await loadImage(file);
  try{
    if(!loaded.width||!loaded.height)throw new Error('decode_failed');
    let width=loaded.width,height=loaded.height;
    const scale=Math.min(1,requestedDimension/Math.max(width,height));
    width=Math.max(1,Math.round(width*scale));
    height=Math.max(1,Math.round(height*scale));
    let quality=.88;

    for(let attempt=0;attempt<18;attempt++){
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:true});
      if(!ctx)throw new Error('compress_failed');
      ctx.imageSmoothingEnabled=true;
      if('imageSmoothingQuality' in ctx)ctx.imageSmoothingQuality='high';
      ctx.drawImage(loaded.image,0,0,width,height);

      let blob;
      try{blob=await canvasBlob(canvas,quality);}
      finally{canvas.width=1;canvas.height=1;}

      if(blob.size<=safeTarget)return readAsDataUrl(blob);

      if(quality>.52)quality=Math.max(.52,quality-.08);
      else{
        width=Math.max(240,Math.round(width*.80));
        height=Math.max(240,Math.round(height*.80));
        quality=.76;
      }
    }

    // Last-resort iPhone/Safari path: a small JPEG is preferable to failing
    // the whole product flow. This still stays within the server image limit.
    const fallback=document.createElement('canvas');
    const ratio=Math.min(1,720/Math.max(loaded.width,loaded.height));
    fallback.width=Math.max(1,Math.round(loaded.width*ratio));
    fallback.height=Math.max(1,Math.round(loaded.height*ratio));
    const fallbackCtx=fallback.getContext('2d');
    if(!fallbackCtx)throw new Error('compress_failed');
    fallbackCtx.fillStyle='#fff';
    fallbackCtx.fillRect(0,0,fallback.width,fallback.height);
    fallbackCtx.drawImage(loaded.image,0,0,fallback.width,fallback.height);
    const jpeg=await encodeCanvas(fallback,'image/jpeg',.62);
    fallback.width=1;fallback.height=1;
    if(jpeg?.size&&jpeg.size<=Math.max(safeTarget,330*1024))return readAsDataUrl(jpeg);
    throw new Error('compress_failed');
  }finally{
    loaded.close();
  }
}

export async function filesToCompressedSources(input,{maxFiles=MAX_FILES,targetBytes=TARGET_BYTES,maxDimension=MAX_DIMENSION}={}){
  const files=[...(input?.files||[])];
  if(files.length>maxFiles)throw new Error('too_many');
  const sources=[];
  for(const file of files)sources.push(await compressFile(file,{targetBytes,maxDimension}));
  return sources;
}

export const imageUploadLimits={
  maxFiles:MAX_FILES,
  maxInputBytes:MAX_INPUT_BYTES,
  targetBytes:TARGET_BYTES
};
