import create from '../browser/engine/openliero.mjs';
import {NetworkRound} from '../browser/netgame.ts';
const fresh=()=>create({locateFile:file=>Bun.file(new URL('../browser/engine/'+file,import.meta.url)).name});
const size=(packet:unknown)=>new TextEncoder().encode(JSON.stringify(packet)).length;
const duration=2100,roundId='00000000-0000-4000-8000-000000000000';
const results=[];
for(const [name,delay,burst]of [['no added delay',0,0],['86 ms RTT',3,0],['200 ms RTT',7,0],['400 ms RTT',14,0],['86 ms RTT + 143 ms delivery stalls',3,10]] as const){
 const [a,b]=await Promise.all([fresh(),fresh()]);for(const e of [a,b]){e._liero_options(0,99,20,0,0);e._liero_start(789,0);e._liero_begin_play();}
 let clock=0,hostBytes=0,guestBytes=0,hostStalls=0,guestStalls=0,hostPackets=0,guestPackets=0,guestChanges=0;let lastGuestInput:number[]|undefined;
 const messages:{at:number;target:'host'|'guest';packet:any}[]=[];const previous={host:0,guest:0},errors:string[]=[];
 const enqueue=(target:'host'|'guest',packet:any)=>{
  if(target==='host'){
   guestBytes+=size(packet);guestPackets++;
   if(packet.type==='input'){const input=packet.input;if(!lastGuestInput||input[0]!==lastGuestInput[0]||input[1]!==lastGuestInput[1]||input[2])guestChanges++;lastGuestInput=input;}
  }else{hostBytes+=size(packet);hostPackets++;}
  const at=Math.max(clock+delay+(burst&&clock%140===70?burst:0),previous[target]);previous[target]=at;messages.push({at,target,packet});
 };
 const host=new NetworkRound(a,{host:true,room:{owner:'host',self:'host',members:[{id:'host',seat:0},{id:'guest',seat:1}]},broadcast:p=>enqueue('guest',p)} as any,roundId,0);
 const guest=new NetworkRound(b,{host:false,room:{owner:'host',self:'guest'},send:(_to,p)=>enqueue('host',p)} as any,roundId,1);
 host.onError=guest.onError=message=>errors.push(message);
 for(clock=0;clock<duration;clock++){
  for(let i=0;i<messages.length;)if(messages[i].at<=clock){const m=messages.splice(i,1)[0];(m.target==='host'?host:guest).receive(m.target==='host'?'guest':'host',m.packet);}else i++;
  if(!host.advance([clock%140<70?1:2,96,0]))hostStalls++;
  if(!guest.advance([clock%100<50?2:1,32,0]))guestStalls++;
 }
 let historyBytes=0;for(let frame=0;frame<host.log.length;frame+=120)historyBytes+=size({type:'history',round:roundId,frame,frames:host.log.slice(frame,frame+120)});
 results.push({scenario:name,wallTicks:duration,hostTicks:host.frame,guestTicks:guest.frame,hostStalls,guestStalls,hostPackets,guestPackets,guestInputChanges:guestChanges,hostPayloadBytesPerSecond:Math.round(hostBytes/(duration/70)),guestPayloadBytesPerSecond:Math.round(guestBytes/(duration/70)),joinHistoryBytes:historyBytes,errors});
}
console.log(JSON.stringify({note:'Synthetic application-level reliable ordered delivery, 70 ticks/s, at most one advance per peer per wall tick. Messages arrive no earlier than the next iteration, including the no-added-delay case. Excludes WebRTC/IP overhead, D1, rendering, catch-up and initial map transfer. Not a real internet benchmark.',results},null,2));
if(results.some(result=>result.errors.length))process.exitCode=1;
