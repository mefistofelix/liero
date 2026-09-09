// Reproducible conversions of the existing favicon for PWA and Apple icons. Native Bun only.
const crc=(bytes:Uint8Array)=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let k=0;k<8;k++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return (c^0xffffffff)>>>0;};
const u32=(n:number)=>new Uint8Array([n>>>24,n>>>16,n>>>8,n]);
const join=(...arrays:Uint8Array[])=>{const out=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let p=0;for(const a of arrays){out.set(a,p);p+=a.length;}return out;};
const chunk=(type:string,data:Uint8Array)=>{const bytes=join(new TextEncoder().encode(type),data);return join(u32(data.length),bytes,u32(crc(bytes)));};
// Use the bundled WebLiero favicon as the single source, including its transparency.
const ico=new Uint8Array(await Bun.file(new URL('../browser/favicon.ico',import.meta.url)).arrayBuffer()),view=new DataView(ico.buffer);
const offset=view.getUint32(18,true),width=ico[6]||256,height=ico[7]||256,bits=view.getUint16(offset+14,true),header=view.getUint32(offset,true);
if(view.getUint16(2,true)!==1||bits!==4||header!==40||view.getUint32(offset+16,true)!==0)throw new Error('Expected the bundled uncompressed 4-bit WebLiero favicon.');
const palette=offset+header,pixels=palette+16*4,stride=Math.ceil(width*bits/32)*4,mask=pixels+stride*height,maskStride=Math.ceil(width/32)*4;
for(const size of [180,192,512]){
 const scan=new Uint8Array((size*4+1)*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const px=Math.floor(x*width/size),py=height-1-Math.floor(y*height/size),packed=ico[pixels+py*stride+(px>>1)],index=px%2?packed&15:packed>>4,c=palette+index*4;
  const transparent=ico[mask+py*maskStride+(px>>3)]&(128>>(px&7));
  scan.set([ico[c+2],ico[c+1],ico[c],transparent?0:255],y*(size*4+1)+1+x*4);
 }
 let a=1,b=0;for(const byte of scan){a=(a+byte)%65521;b=(b+a)%65521;}
 const zlib=join(new Uint8Array([0x78,0x9c]),Bun.deflateSync(scan),u32(((b<<16)|a)>>>0));
 const png=join(new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',join(u32(size),u32(size),new Uint8Array([8,6,0,0,0]))),chunk('IDAT',zlib),chunk('IEND',new Uint8Array()));
 await Bun.write(new URL(`../browser/icon-${size}.png`,import.meta.url),png);
}
