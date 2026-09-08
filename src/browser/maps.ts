export type Level={id:string;name:string;flags?:number;url?:string;data?:Uint8Array;preview?:string;sha256?:string};
export const builtins:Level[]=[{id:'random',name:'Original random terrain'},{id:'temple',name:'TEMPLE.LEV',url:'/maps/temple.lev'}];
export async function catalogLevels():Promise<Level[]>{const response=await fetch('/maps/catalog.json');if(!response.ok)throw new Error('Map catalog unavailable.');return (await response.json()).map((level:any)=>({...level,url:level.asset,preview:level.thumbnail}));}
const SIZE=504*350;
let dbPromise:Promise<IDBDatabase>;
const pending=new Map<string,Promise<Uint8Array|null>>();
function database(){return dbPromise??=new Promise((resolve,reject)=>{const request=indexedDB.open('liero.maps',1);request.onupgradeneeded=()=>request.result.createObjectStore('levels',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function store<T>(mode:IDBTransactionMode,action:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('levels',mode),request=action(tx.objectStore('levels'));tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
export const savedLevels=()=>store<Level[]>('readonly',s=>s.getAll()).then(levels=>levels.filter(l=>l.id.startsWith('import:')));
export function validateLevel(bytes:Uint8Array){
 if(bytes.length<SIZE||bytes.length>1048576)throw new Error('Invalid LEV: expected 504 × 350 indexed pixels (maximum file size 1 MB).');
 const signature=new TextDecoder().decode(bytes.subarray(SIZE,SIZE+10));
 if(signature==='POWERLEVEL'&&bytes.length<SIZE+778)throw new Error('Incomplete Powerlevel palette.');
 return bytes;
}
export async function levelBytes(level:Level):Promise<Uint8Array|null>{
 if(level.id==='random')return null;
 if(level.data)return level.data;
 if(pending.has(level.id))return pending.get(level.id)!;
 const promise=loadBytes(level).finally(()=>pending.delete(level.id));pending.set(level.id,promise);return promise;
}
async function loadBytes(level:Level){
 const cached=await store<Level|undefined>('readonly',s=>s.get(level.id)).catch(()=>undefined);
 if(cached?.data){try{const bytes=validateLevel(new Uint8Array(cached.data));if(level.sha256){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');if(hash!==level.sha256)throw new Error('Cached map differs from the bundled revision');}return level.data=bytes;}catch{await store('readwrite',s=>s.delete(level.id)).catch(()=>{});}}
 if(!level.url)throw new Error('Map missing from this device.');
 const response=await fetch(level.url,{signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw new Error(response.status===429?'Map source busy · retry in a minute':`Map unavailable (${response.status})`);
 const bytes=validateLevel(new Uint8Array(await response.arrayBuffer()));
 level.data=bytes;await store('readwrite',s=>s.put({...level,data:bytes})).catch(()=>{});return bytes;
}
export function paletteFor(bytes:Uint8Array,original:Uint8Array){
 const palette=original.slice();
 if(new TextDecoder().decode(bytes.subarray(SIZE,SIZE+10))==='POWERLEVEL'){
  for(let i=0;i<256;i++)for(let c=0;c<3;c++)palette[i*4+c]=(bytes[SIZE+10+i*3+c]&63)<<2;
 }
 return palette;
}
export function thumbnail(bytes:Uint8Array,original:Uint8Array){
 const palette=paletteFor(bytes,original),canvas=document.createElement('canvas');canvas.width=504;canvas.height=350;
 const context=canvas.getContext('2d')!,pixels=context.createImageData(504,350);
 for(let i=0;i<SIZE;i++)pixels.data.set(palette.subarray(bytes[i]*4,bytes[i]*4+4),i*4);
 context.putImageData(pixels,0,0);
 const small=document.createElement('canvas');small.width=168;small.height=117;small.getContext('2d')!.drawImage(canvas,0,0,168,117);return small.toDataURL('image/png');
}
export async function importLevel(file:File,palette:Uint8Array):Promise<Level>{
 if(file.size>20*1024*1024)throw new Error('The file size limit is 20 MB.');
 let data:Uint8Array;
 if(/\.lev$/i.test(file.name))data=validateLevel(new Uint8Array(await file.arrayBuffer()));
 else{
  if(!/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name))throw new Error('Supported formats: LEV, PNG, JPG, WebP, GIF, BMP and AVIF.');
  const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('This browser cannot decode this image.');});
  if(bitmap.width*bitmap.height>40_000_000){bitmap.close();throw new Error('Image too large (maximum 40 megapixels).');}
  const canvas=document.createElement('canvas');canvas.width=504;canvas.height=350;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  const scale=Math.min(504/bitmap.width,350/bitmap.height),w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);
  ctx.drawImage(bitmap,Math.floor((504-w)/2),Math.floor((350-h)/2),w,h);bitmap.close();
  const pixels=ctx.getImageData(0,0,504,350).data;data=new Uint8Array(SIZE);const cache=new Map<number,number>();
  for(let i=0;i<SIZE;i++){
   if(pixels[i*4+3]<128){data[i]=0;continue;}
   const r=pixels[i*4],g=pixels[i*4+1],b=pixels[i*4+2],rgb=r*65536+g*256+b;
   let index=cache.get(rgb);if(index===undefined){let best=Infinity;index=0;for(let j=0;j<256;j++){const d=(r-palette[j*4])**2+(g-palette[j*4+1])**2+(b-palette[j*4+2])**2;if(d<best){best=d;index=j;}}cache.set(rgb,index);}
   data[i]=index;
  }
 }
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
 const level={id:`import:${hash}`,name:file.name.slice(0,100),data,preview:thumbnail(data,palette)};
 await store('readwrite',s=>s.put(level));return level;
}
