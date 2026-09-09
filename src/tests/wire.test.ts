import {test,expect} from 'bun:test';
import {Wire} from '../browser/rooms.ts';
import {decodePacket} from '../browser/net-packets.ts';
const round='ed50a5b8-736a-4f74-8059-c63dc7f1f4a9';
test('WebRTC lanes encode commands, supersede progress and pace bulk data under backpressure',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'RTCPeerConnection'),sent:any[]=[],options:any[]=[];
 class Peer{
  channels:any[]=[];connectionState='new';onconnectionstatechange?:()=>void;
  createDataChannel(label:string,config:any){options.push({label,...config});const c:any={readyState:'connecting',bufferedAmount:65536,send:(data:string|Uint8Array)=>{c.bufferedAmount+=data.length;sent.push({lane:config.id,packet:decodePacket(typeof data==='string'?data:data.slice().buffer)});}};this.channels.push(c);return c;}
  close(){this.connectionState='closed';this.onconnectionstatechange?.();for(const c of this.channels)c.onclose?.();}
 }
 Object.defineProperty(globalThis,'RTCPeerConnection',{value:Peer,configurable:true});
 let closed=0,opened=0;const received:any[]=[];
 try{
  const wire=new Wire(async()=>{},p=>received.push(p),()=>opened++,()=>closed++);
  expect(options).toEqual([{label:'control',negotiated:true,id:0,ordered:true},{label:'actions',negotiated:true,id:1,ordered:false},{label:'progress',negotiated:true,id:2,ordered:false,maxRetransmits:0}]);
  for(const c of wire.channels){(c as any).readyState='open';c.onopen!(new Event('open'));}expect(opened).toBe(1);
  for(let i=0;i<6;i++)wire.send({type:'checkpoint-chunk',round,token:1,offset:i*8192,data:new Uint8Array(8192)});
  wire.send({type:'progress',round,frame:7,serial:0,hash:0,ended:false});wire.send({type:'progress',round,frame:14,serial:0,hash:0,ended:false});
  const input={type:'input-event',round,frame:15,sequence:1,input:[16,96,1]};wire.send(input);expect(sent).toHaveLength(0);
  for(const c of wire.channels)(c as any).bufferedAmount=0;wire.flush();
  expect(sent[0]).toEqual({lane:1,packet:input});expect(sent[1].packet.frame).toBe(14);expect(sent.filter(p=>p.lane===0)).toHaveLength(2);
  const encoded=new TextEncoder().encode(JSON.stringify({type:'chat-delivery',message:{message:'Hi'}}));
  wire.channels[0].onmessage!({data:new TextDecoder().decode(encoded)} as any);expect(received[0].type).toBe('chat-delivery');
  wire.send({type:'progress',round,frame:70,serial:3,hash:123,ended:true});
  for(let i=0;i<4;i++){for(const c of wire.channels)(c as any).bufferedAmount=0;wire.flush();}
  expect(sent.find(p=>p.packet.ended)?.lane).toBe(0);wire.close();expect(closed).toBe(1);wire.close();expect(closed).toBe(1);
 }finally{if(previous)Object.defineProperty(globalThis,'RTCPeerConnection',previous);else delete (globalThis as any).RTCPeerConnection;}
});
