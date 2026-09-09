// Binary hot path. Configuration and transfer metadata remain infrequent JSON.
export type Packet=Record<string,any>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function encodePacket(p:Packet):string|Uint8Array{
 const kind=p.type==='input-event'?1:p.type==='event'&&p.kind==='input'?2:p.type==='progress'?3:p.type==='checkpoint-chunk'?4:p.type==='map-chunk'?5:0;
 if(!kind)return JSON.stringify(p);
 if(!uuid.test(p.round))throw new Error('Invalid round identity');
 const b=new Uint8Array(kind===1?28:kind===2?33:kind===3?30:25+p.data.length),v=new DataView(b.buffer);b[0]=kind;
 const hex=p.round.replaceAll('-','');for(let i=0;i<16;i++)b[i+1]=parseInt(hex.slice(i*2,i*2+2),16);
 v.setUint32(17,kind>=4?p.token||0:p.frame,true);v.setUint32(21,kind===1?p.sequence:kind>=4?p.offset:p.serial,true);
 if(kind===1||kind===2){const offset=kind===1?25:30;if(kind===2){b[25]=p.seat;v.setUint32(26,p.sequence,true);}
  v.setUint16(offset,p.input[0]|p.input[1]<<9,true);v.setInt8(offset+2,p.input[2]);}
 if(kind===3){v.setUint32(25,p.hash||0,true);b[29]=p.ended?1:0;}
 if(kind>=4)b.set(p.data,25);
 return b;
}
export function decodePacket(data:string|ArrayBuffer):Packet{
 if(typeof data==='string'){if(data.length>60000)throw new Error('Packet too large');return JSON.parse(data);}
 const b=new Uint8Array(data),v=new DataView(data);if(b.length<25||b.length>60000)throw new Error('Invalid binary packet');
 const kind=b[0];if(![1,2,3,4,5].includes(kind)||(kind<4&&b.length!==({1:28,2:33,3:30}[kind]))||(kind>=4&&b.length>8217))throw new Error('Invalid binary packet');
 const h=Array.from(b.subarray(1,17),n=>n.toString(16).padStart(2,'0')).join(''),round=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
 const frame=v.getUint32(17,true),serial=v.getUint32(21,true);
 if(kind===4)return{type:'checkpoint-chunk',round,token:frame,offset:serial,data:b.slice(25)};
 if(kind===5)return{type:'map-chunk',round,offset:serial,data:b.slice(25)};
 if(kind===3){if(b[29]>1)throw new Error('Invalid progress');return{type:'progress',round,frame,serial,hash:v.getUint32(25,true),ended:!!b[29]};}
 const offset=kind===1?25:30,mask=v.getUint16(offset,true),input=[mask&511,mask>>>9,v.getInt8(offset+2)];
 if(Math.abs(input[2])>1||(kind===2&&b[25]>1))throw new Error('Invalid command');
 return kind===1?{type:'input-event',round,frame,sequence:serial,input}:{type:'event',kind:'input',round,frame,serial,seat:b[25],sequence:v.getUint32(26,true),input};
}
export function packetLane(p:Packet):0|1|2{return p.type==='progress'&&!p.ended?2:p.type==='event'||p.type==='input-event'?1:0;}
export const MAX_CHECKPOINT=2*1024*1024;
export async function compressCheckpoint(data:Uint8Array){return transform(data,new CompressionStream('deflate'));}
export async function decompressCheckpoint(data:Uint8Array){return transform(data,new DecompressionStream('deflate'));}
async function transform(data:Uint8Array,stream:CompressionStream|DecompressionStream){
 if(data.length>MAX_CHECKPOINT)throw new Error('Checkpoint too large');
 const reader=new Blob([data]).stream().pipeThrough(stream).getReader(),chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_CHECKPOINT)throw new Error('Checkpoint too large');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
