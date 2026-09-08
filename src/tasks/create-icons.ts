// Reproducible pixel-art app icons. Native Bun only.
const crc=(bytes:Uint8Array)=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;};
const u32=(n:number)=>new Uint8Array([n>>>24,n>>>16,n>>>8,n]);
const join=(...arrays:Uint8Array[])=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length;}return out;};
const chunk=(type:string,data:Uint8Array)=>{const bytes=join(new TextEncoder().encode(type),data);return join(u32(data.length),bytes,u32(crc(bytes)));};
for(const size of [192,512]){
 const scan=new Uint8Array((size*4+1)*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=x*64/size,py=y*64/size;let color=[24,34,35];
  if((px>=15&&px<49&&py>=39&&py<46)||(px>=22&&px<49&&py>=32&&py<46)||(px>=29&&px<55&&py>=25&&py<38)||(px>=36&&px<50&&py>=18&&py<32))color=[201,243,107];
  if(px>=39&&px<44&&py>=22&&py<28)color=[24,34,35];
  scan.set([...color,255],y*(size*4+1)+1+x*4);
 }
 let a=1,b=0;for(const byte of scan){a=(a+byte)%65521;b=(b+a)%65521;}
 const zlib=join(new Uint8Array([0x78,0x9c]),Bun.deflateSync(scan),u32(((b<<16)|a)>>>0));
 const png=join(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',join(u32(size),u32(size),new Uint8Array([8,6,0,0,0]))),chunk('IDAT',zlib),chunk('IEND',new Uint8Array()));
 await Bun.write(new URL(`../browser/icon-${size}.png`,import.meta.url),png);
}
