import {test,expect} from 'bun:test';
import create from '../browser/engine/openliero.mjs';
import {NetworkRound,type Input} from '../browser/netgame.ts';
import {encodePacket,decodePacket} from '../browser/net-packets.ts';
const id='ed50a5b8-736a-4f74-8059-c63dc7f1f4a9';
const fresh=()=>create({locateFile:file=>Bun.file(new URL('../browser/engine/'+file,import.meta.url)).name});
const wire=(p:any)=>{const encoded=encodePacket(p);return decodePacket(typeof encoded==='string'?encoded:encoded.slice().buffer);};
const waitReady=async(round:NetworkRound)=>{for(let i=0;i<100&&!round.ready;i++)await Bun.sleep(1);expect(round.ready).toBe(true);};
const confirmedHash=(e:any)=>{e._liero_net_save(1);expect(e._liero_net_restore(0)).toBe(1);const h=e._liero_net_hash();e._liero_net_restore(1);return h;};
async function rig(seats=[0,1],participants=3){
 const engines=await Promise.all([fresh(),fresh(),fresh()]);for(const e of engines){e._liero_options(0,99,20,3,0);e._liero_start(789,0);e._liero_participants(participants);e._liero_begin_play();}
 let clock=0,delay=0,impaired=false;const messages:{at:number;to:string;from:string;p:any}[]=[];const rounds=new Map<string,NetworkRound>();const errors:string[]=[];let bytes=0;
 const send=(to:string,from:string,p:any)=>{const data=wire(p);const encoded=encodePacket(p);bytes+=typeof encoded==='string'?new TextEncoder().encode(encoded).length:encoded.length;
  if(delay&&p.type!=='checkpoint-meta'&&p.type!=='checkpoint-chunk'){
   if(impaired&&p.type==='progress'&&clock%5===0)return;
   const extra=impaired&&p.type==='event'&&p.serial%11===0?9:0;messages.push({at:clock+delay+extra,to,from,p:data});
   if(impaired&&p.type==='event'&&p.serial%13===0)messages.push({at:clock+delay+extra+1,to,from,p:data});
  }else rounds.get(to)!.receive(from,data);
 };
 const members=[{id:'host',seat:seats[0]},{id:'guest',seat:seats[1]},{id:'viewer',seat:-1}];
 const host=new NetworkRound(engines[0],{host:true,room:{owner:'host',self:'host',members},broadcast:p=>{for(const to of rounds.keys())if(to!=='host')send(to,'host',p);},send:(to,p)=>send(to,'host',p)} as any,id,seats[0],participants);rounds.set('host',host);
 const guest=new NetworkRound(engines[1],{host:false,room:{owner:'host',self:'guest',members},pings:new Map([['host',86]]),send:(to,p)=>send(to,'guest',p)} as any,id,seats[1],participants);rounds.set('guest',guest);
 const viewer=new NetworkRound(engines[2],{host:false,room:{owner:'host',self:'viewer',members},send:(to,p)=>send(to,'viewer',p)} as any,id,-1,participants);
 [host,guest,viewer].forEach(r=>{r.onError=e=>errors.push(e);r.initialize();});
 await host.sendCheckpoint('guest');await waitReady(guest);
 return{host,guest,viewer,engines,errors,setDelay:(n:number,loss=false)=>{delay=n;impaired=loss;},bytes:()=>bytes,
  deliver:()=>{clock++;for(let i=messages.length-1;i>=0;i--)if(messages[i].at<=clock){const m=messages.splice(i,1)[0];rounds.get(m.to)!.receive(m.from,m.p);}},
  addViewer:async()=>{rounds.set('viewer',viewer);await host.sendCheckpoint('viewer');await waitReady(viewer);}};
}

test('event-only traffic keeps held input and late checkpoint joins reproduce the current world',async()=>{
 const r=await rig();const initialBytes=r.bytes();
 for(let f=0;f<700;f++){r.deliver();r.host.advance([0,96,0]);r.guest.advance([0,32,0]);}
 expect(r.host.frame).toBe(700);expect(r.guest.metrics.inputsSent).toBe(1);expect(r.bytes()-initialBytes).toBeLessThan(4000);
 expect(confirmedHash(r.engines[1])).toBe(r.engines[0]._liero_net_hash());
 await r.addViewer();expect(r.viewer.frame).toBe(700);expect(confirmedHash(r.engines[2])).toBe(r.engines[0]._liero_net_hash());expect(r.errors).toEqual([]);
});

test('delayed, reordered and duplicate actions reconcile with live rules and one-shot inputs',async()=>{
 const r=await rig();r.setDelay(7,true);
 for(let f=0;f<994;f++){
  r.deliver();
  if(f===220)r.host.queueRules({mode:0,lives:99,loading:40,bonuses:2});
  if(f===350)r.host.queueLoadout(1,[35,36,9,25,19]);
  if(f===450)r.host.queueRules({mode:0,lives:99,loading:200,bonuses:2,allowedWeapons:[35]});
  r.host.advance([f%40<20?8:2,f&127,f%80===0?1:0]);r.guest.advance([f%50<25?16:65,(f+64)&127,f%70<2?-1:0]);
  if(f===600)await r.addViewer();if(f>600)r.viewer.advance([0,96,0]);
  if(f%7===0)r.engines[0]._liero_render();if(f%3===0)r.engines[1]._liero_render();
 }
 for(let f=0;f<40;f++){r.deliver();r.guest.advance([0,96,0]);r.viewer.advance([0,96,0]);}
 expect(r.host.frame).toBe(994);expect(r.guest.frame).toBe(994);expect(r.viewer.frame).toBe(994);
 expect(r.errors).toEqual([]);expect(r.guest.metrics.resyncs).toBe(0);expect(r.guest.metrics.replayedTicks).toBeGreaterThan(0);
 for(const e of r.engines.slice(1))expect(confirmedHash(e)).toBe(r.engines[0]._liero_net_hash());
 expect(r.host.bufferedEvents).toBeLessThan(150);expect(r.guest.bufferedEvents).toBeLessThan(200);
});

test('a spectator host advances solo play without waiting for a missing or stalled player packet',async()=>{
 for(const seat of [0,1]){
  const r=await rig([-1,seat],1<<seat);r.setDelay(14);
  for(let f=0;f<420;f++){r.deliver();r.host.advance([0,96,0]);if(f<150||f>220)r.guest.advance([f%60<30?8:2,32,0]);}
  for(let f=0;f<20;f++){r.deliver();r.guest.advance([0,32,0]);}
  expect(r.host.frame).toBe(420);expect(r.errors).toEqual([]);expect(r.guest.metrics.resyncs).toBe(0);
  expect(confirmedHash(r.engines[1])).toBe(r.engines[0]._liero_net_hash());
 }
});

test('real confirmed-state corruption triggers checkpoint recovery instead of ending the round',async()=>{
 const r=await rig();for(let f=0;f<70;f++){r.host.advance([8,96,0]);r.guest.advance([0,32,0]);}
 // Corrupt the confirmed baseline using an extra native step, preserving the
 // round's timeline so the next complete checksum must detect it.
 r.engines[1]._liero_net_restore(0);r.engines[1]._liero_step(8,32,0,16,96,0);r.engines[1]._liero_net_save(0);
 for(let f=70;f<140;f++){r.host.advance([8,96,0]);r.guest.advance([0,32,0]);}
 for(let i=0;i<100&&r.guest.metrics.checkpoints<2;i++)await Bun.sleep(1);
 expect(r.guest.metrics.resyncs).toBe(1);expect(r.guest.metrics.checkpoints).toBe(2);expect(r.guest.ended).toBe(false);expect(r.errors).toEqual([]);
 expect(confirmedHash(r.engines[1])).toBe(r.engines[0]._liero_net_hash());
});

test('Stop is a single synchronized suicide and resolves on confirmation',async()=>{
 const r=await rig();r.setDelay(3);let stopped=false;void r.guest.requestStop().then(()=>stopped=true);
 for(let f=0;f<350;f++){r.deliver();r.host.advance([0,96,0]);r.guest.advance([0,32,0]);}
 await Promise.resolve();expect(stopped).toBe(true);expect(r.errors).toEqual([]);
 const ptr=r.engines[0]._liero_info()>>2;expect(r.engines[0].HEAP32[ptr+45]).toBe(1);expect(r.guest.metrics.resyncs).toBe(0);
});
