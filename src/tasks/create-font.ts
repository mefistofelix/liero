// Convert original Liero bitmap glyphs to a web-loadable TrueType font.
// Every lit pixel becomes a square contour; no replacement typeface is used.
import create from '../browser/engine/openliero.mjs';
const engine=await create({locateFile:(f:string)=>Bun.file('src/browser/engine/'+f).name});
const ptr=engine._liero_font(),bitmap=engine.HEAPU8.slice(ptr,ptr+256*57);
class Bytes{a:number[]=[];u16(n:number){this.a.push(n>>8&255,n&255);return this;}u32(n:number){return this.u16(n>>>16).u16(n);}raw(a:ArrayLike<number>){this.a.push(...Array.from(a));return this;}zeros(n:number){return this.raw(new Uint8Array(n));}out(){return new Uint8Array(this.a);}}
const tables=new Map<string,Uint8Array>(),glyphs=new Bytes(),loca=new Bytes(),metrics=new Bytes();
const codes=[0,...Array.from({length:95},(_,i)=>i+32)];let maxPoints=0,maxContours=0;
for(const code of codes){
 loca.u32(glyphs.a.length);const cells:{x:number;y:number}[]=[];const width=bitmap[code*57]||4;
 // Bitmap rows 0..4 are capitals, row 5 contains descenders. Place the
 // capital baseline at zero so the visible text is centered in the em box.
 for(let y=0;y<8;y++)for(let x=0;x<7;x++)if(x<width&&bitmap[code*57+1+y*7+x])cells.push({x:x*128,y:(4-y)*128});
 const g=new Bytes().u16(cells.length).u16(0).u16(cells.length?Math.min(...cells.map(p=>p.y)):0).u16(cells.length?Math.max(...cells.map(p=>p.x+128)):0).u16(cells.length?Math.max(...cells.map(p=>p.y+128)):0);cells.forEach((_,i)=>g.u16(i*4+3));g.u16(0);
 const points=cells.flatMap(({x,y})=>[[x,y],[x,y+128],[x+128,y+128],[x+128,y]]);
 points.forEach(()=>g.raw([1]));for(let axis=0;axis<2;axis++){let prev=0;for(const point of points){g.u16(point[axis]-prev);prev=point[axis];}}
 glyphs.raw(g.out());while(glyphs.a.length%4)glyphs.raw([0]);metrics.u16(width*128).u16(0);maxPoints=Math.max(maxPoints,points.length);maxContours=Math.max(maxContours,cells.length);
}
loca.u32(glyphs.a.length);tables.set('glyf',glyphs.out());tables.set('loca',loca.out());tables.set('hmtx',metrics.out());
tables.set('head',new Bytes().u32(0x10000).u32(0x10000).u32(0).u32(0x5f0f3cf5).u16(3).u16(1024).zeros(16).u16(0).u16(-128).u16(896).u16(768).u16(0).u16(8).u16(2).u16(1).u16(0).out());
tables.set('hhea',new Bytes().u32(0x10000).u16(768).u16(-128).u16(0).u16(896).u16(0).u16(0).u16(896).u16(1).u16(0).u16(0).zeros(8).u16(0).u16(codes.length).out());
tables.set('maxp',new Bytes().u32(0x10000).u16(codes.length).u16(maxPoints).u16(maxContours).u16(0).u16(0).u16(2).zeros(18).out());
tables.set('post',new Bytes().u32(0x30000).u32(0).u16(-128).u16(64).u32(0).zeros(16).out());
const mapping=new Map<number,number>(codes.slice(1).map((c,i)=>[c,i+1]));for(const [c,base]of [[0x2018,39],[0x2019,39],[0x201c,34],[0x201d,34],[0x2013,45],[0x2014,45],[0x2026,46],[0xa0,32]])mapping.set(c,mapping.get(base)!);
const entries=[...mapping].sort((a,b)=>a[0]-b[0]);entries.push([65535,0]);const n=entries.length,pow=2**Math.floor(Math.log2(n));const format=new Bytes().u16(4).u16(16+n*8).u16(0).u16(n*2).u16(pow*2).u16(Math.log2(pow)).u16(n*2-pow*2);
entries.forEach(([c])=>format.u16(c));format.u16(0);entries.forEach(([c])=>format.u16(c));entries.forEach(([c,g])=>format.u16(g-c));entries.forEach(()=>format.u16(0));
tables.set('cmap',new Bytes().u16(0).u16(1).u16(3).u16(1).u32(12).raw(format.out()).out());
const names=[[1,'Liero'],[2,'Regular'],[3,'Liero Bitmap 1'],[4,'Liero'],[5,'Version 1.0'],[6,'Liero']] as const;const nameData=new Bytes(),name=new Bytes().u16(0).u16(names.length).u16(6+names.length*12);
for(const [id,text]of names){const offset=nameData.a.length;for(const c of text)nameData.u16(c.charCodeAt(0));name.u16(3).u16(1).u16(0x409).u16(id).u16(text.length*2).u16(offset);}tables.set('name',name.raw(nameData.out()).out());
tables.set('OS/2',new Bytes().u16(0).u16(640).u16(400).u16(5).u16(0).u16(650).u16(650).u16(0).u16(75).u16(650).u16(650).u16(0).u16(350).u16(64).u16(320).u16(0).zeros(10).u32(1).zeros(12).raw([76,73,69,82]).u16(64).u16(32).u16(0x2026).u16(768).u16(-128).u16(0).u16(768).u16(128).out());
const sum=(a:Uint8Array)=>{let n=0;for(let i=0;i<a.length;i+=4)n=(n+(((a[i]||0)*0x1000000+(a[i+1]||0)*65536+(a[i+2]||0)*256+(a[i+3]||0))>>>0))>>>0;return n;};
const sorted=[...tables].sort(([a],[b])=>a.localeCompare(b)),count=sorted.length,p=2**Math.floor(Math.log2(count)),header=new Bytes().u32(0x10000).u16(count).u16(p*16).u16(Math.log2(p)).u16(count*16-p*16),body=new Bytes();let offset=12+count*16,headOffset=0;
for(const [tag,data]of sorted){header.raw(new TextEncoder().encode(tag)).u32(sum(data)).u32(offset).u32(data.length);if(tag==='head')headOffset=offset;body.raw(data);while(body.a.length%4)body.raw([0]);offset=12+count*16+body.a.length;}
const font=header.raw(body.out()).out();new DataView(font.buffer).setUint32(headOffset+8,(0xb1b0afba-sum(font))>>>0);await Bun.write('src/browser/liero.ttf',font);console.log('Liero font:',font.length,'bytes');
