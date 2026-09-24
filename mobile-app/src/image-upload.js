const MAX_FILES=5;
const MAX_INPUT_BYTES=10*1024*1024;
const TARGET_BYTES=900*1024;
const MAX_DIMENSION=2200;

const readAsDataUrl=blob=>new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(reader.result);
  reader.onerror=()=>reject(reader.error||new Error('read_failed'));
  reader.readAsDataURL(blob);
});

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

const canvasBlob=(canvas,quality)=>new Promise((resolve,reject)=>{
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('compress_failed')),'image/webp',quality);
});

async function compressFile(file){
  if(!(file instanceof Blob)||!String(file.type||'').startsWith('image/'))throw new Error('unsupported');
  if(file.size>MAX_INPUT_BYTES)throw new Error('too_large');
  const passThrough=['image/jpeg','image/png','image/webp'].includes(file.type)&&file.size<=TARGET_BYTES;
  if(passThrough)return readAsDataUrl(file);

  const loaded=await loadImage(file);
  try{
    if(!loaded.width||!loaded.height)throw new Error('decode_failed');
    let width=loaded.width,height=loaded.height;
    const scale=Math.min(1,MAX_DIMENSION/Math.max(width,height));
    width=Math.max(1,Math.round(width*scale));
    height=Math.max(1,Math.round(height*scale));
    let quality=.88;

    for(let attempt=0;attempt<14;attempt++){
      const canvas=document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw new Error('compress_failed');
      ctx.drawImage(loaded.image,0,0,width,height);
      const blob=await canvasBlob(canvas,quality);
      canvas.width=1;canvas.height=1;
      if(blob.size<=TARGET_BYTES)return readAsDataUrl(blob);
      if(quality>.56)quality=Math.max(.56,quality-.08);
      else{
        width=Math.max(1,Math.round(width*.82));
        height=Math.max(1,Math.round(height*.82));
        quality=.78;
      }
    }
    throw new Error('compress_failed');
  }finally{
    loaded.close();
  }
}

export async function filesToCompressedSources(input,{maxFiles=MAX_FILES}={}){
  const files=[...(input?.files||[])];
  if(files.length>maxFiles)throw new Error('too_many');
  const sources=[];
  for(const file of files)sources.push(await compressFile(file));
  return sources;
}

export const imageUploadLimits={
  maxFiles:MAX_FILES,
  maxInputBytes:MAX_INPUT_BYTES,
  targetBytes:TARGET_BYTES
};
