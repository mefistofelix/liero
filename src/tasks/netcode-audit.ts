import create from '../browser/engine/openliero.mjs';
import {NetworkRound} from '../browser/netgame.ts';
import {encodePacket,decodePacket} from '../browser/net-packets.ts';

const fresh=()=>create({locateFile:file=>Bun.file(new URL('../browser/engine/'+file,import.meta.url)).name});
const duration=2100,roundId='00000000-0000-4000-8000-000000000000';
const results=[];
for(const [name,delay,burst,combat]of [['no added delay',0,0,false],['86 ms RTT',3,0,false],['200 ms RTT',7,0,false],['400 ms RTT',14,0,false],['86 ms RTT + 143 ms action delay',3,10,false],['200 ms RTT + continuous aim/fire/rope',7,0,true]] as const){
 const [a,b]=await Promise.all([fresh(),fresh()]);
 for(const e of [a,b]){e._liero_options(0,99,20,0,0);e._liero_start(789,0);e._liero_begin_play();}
 let clock=0,measuring=false,hostBytes=0,guestBytes=0,hostPackets=0,guestPackets=0,checkpointBytes=0;
 const messages:{at:number;target:'host'|'guest';packet:any}[]=[],errors:string[]=[],stepTimes:number[]=[];
 let host:NetworkRound,guest:NetworkRound;
 const enqueue=(target:'host'|'guest',packet:any)=>{
  const encoded=encodePacket(packet),size=typeof encoded==='string'?new TextEncoder().encode(encoded).length:encoded.length;
  const decoded=decodePacket(typeof encoded==='string'?encoded:encoded.slice().buffer);
  if(packet.type.startsWith('checkpoint-')){checkpointBytes+=size;guest.receive('host',decoded);return;}
  if(measuring){if(target==='host'){guestBytes+=size;guestPackets++;}else{hostBytes+=size;hostPackets++;}}
  messages.push({at:clock+delay+(burst&&packet.type==='event'&&clock%140===70?burst:0),target,packet:decoded});
 };
 host=new NetworkRound(a,{host:true,room:{owner:'host',self:'host',members:[{id:'host',seat:0},{id:'guest',seat:1}]},broadcast:p=>enqueue('guest',p),send:(_to,p)=>enqueue('guest',p)} as any,roundId,0);
 guest=new NetworkRound(b,{host:false,room:{owner:'host',self:'guest'},pings:new Map([['host',delay*2000/70]]),send:(_to,p)=>enqueue('host',p)} as any,roundId,1);
 host.onError=guest.onError=message=>errors.push(message);host.initialize();guest.initialize();
 await host.sendCheckpoint('guest');for(let i=0;i<100&&!guest.ready;i++)await Bun.sleep(1);
 if(!guest.ready)throw new Error('Checkpoint did not load');
 measuring=true;checkpointBytes=0;
 for(clock=0;clock<duration;clock++){
  // Action delivery is deliberately allowed to reorder; progress is supersedable.
  for(let i=messages.length-1;i>=0;i--)if(messages[i].at<=clock){const m=messages.splice(i,1)[0];(m.target==='host'?host:guest).receive(m.target==='host'?'guest':'host',m.packet);}
  host.advance([(clock%140<70?1:2)|(combat?8:0),combat?clock&127:96,combat&&clock%70===0?1:0]);
  const before=performance.now();guest.advance([(clock%100<50?2:1)|(combat?8|(clock%40<20?16|64:0):0),combat?(clock+64)&127:32,combat&&clock%80===0?-1:0]);stepTimes.push(performance.now()-before);
 }
 measuring=false;await host.sendCheckpoint('guest');
 stepTimes.sort((a,b)=>a-b);
 results.push({scenario:name,wallTicks:duration,hostTicks:host.frame,guestConfirmedTicks:guest.frame,guestPredictedTicks:guest.predictedFrame,hostPackets,guestPackets,
  hostPayloadBytesPerSecond:Math.round(hostBytes/(duration/70)),guestPayloadBytesPerSecond:Math.round(guestBytes/(duration/70)),lateJoinCheckpointBytes:checkpointBytes,
  guestStepP99Ms:Number(stepTimes[Math.floor(stepTimes.length*.99)].toFixed(3)),guestStepMaxMs:Number(stepTimes.at(-1)!.toFixed(3)),...guest.metrics,errors});
}
console.log(JSON.stringify({note:'Synthetic application-level delivery at 70 wall ticks/s; binary packets, including framing and compressed checkpoint payload. Excludes WebRTC/IP/DTLS overhead, D1, rendering, original map transfer and real congestion control. CPU timings are Bun on this machine, not a browser/device guarantee. No-added-delay packets arrive no earlier than the next iteration.',results},null,2));
if(results.some(r=>r.errors.length||r.resyncs))process.exitCode=1;
