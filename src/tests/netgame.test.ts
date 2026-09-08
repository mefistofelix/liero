import {test,expect} from 'bun:test';
import create from '../browser/engine/openliero.mjs';
import {NetworkRound} from '../browser/netgame.ts';
const fresh=()=>create({locateFile:file=>Bun.file(new URL('../browser/engine/'+file,import.meta.url)).name});
test('delayed peer inputs and late spectator history reproduce the host simulation',async()=>{
 const a=await fresh(),b=await fresh(),c=await fresh();for(const engine of [a,b,c])engine._liero_start(789,0);
 let clock=0;const messages:any[]=[];
 const host:any={host:true,room:{self:'host',owner:'host',members:[{id:'host',seat:0},{id:'guest',seat:1}]},broadcast:packet=>messages.push({at:clock+3,packet,to:'guest'}),send:(to,packet)=>{if(to==='spectator')spectator.receive('host',packet);}};
 const guest:any={host:false,room:{self:'guest',owner:'host'},send:(_to,packet)=>messages.push({at:clock+2,packet,to:'host'})};
 const ha=new NetworkRound(a,host,'round',0),gb=new NetworkRound(b,guest,'round',1),spectator=new NetworkRound(c,{host:false,room:{owner:'host'}} as any,'round',-1);
 const errors:string[]=[];ha.onError=gb.onError=spectator.onError=message=>errors.push(message);
 for(clock=0;clock<650;clock++){
  for(let i=messages.length-1;i>=0;i--)if(messages[i].at<=clock){const m=messages.splice(i,1)[0];(m.to==='host'?ha:gb).receive(m.to==='host'?'guest':'host',m.packet);}
  ha.advance([clock%40<20?8:2,clock&127,clock%80===0?1:0]);gb.advance([clock%50<25?16:1,(clock+64)&127,0]);
  if(clock%7===0)a._liero_render();if(clock%3===0)b._liero_render();
 }
 expect(ha.frame).toBeGreaterThan(600);expect(errors).toEqual([]);
 ha.history('spectator');while(spectator.frame<ha.frame)expect(spectator.advance([0,0,0])).toBe(true);
 expect(c._liero_hash()).toBe(a._liero_hash());expect(errors).toEqual([]);
});
test('a spectator host coordinates two remote players without sending local input',async()=>{
 const engines=await Promise.all([fresh(),fresh(),fresh()]);engines.forEach(e=>e._liero_start(92,0));const messages:any[]=[];
 const members=[{id:'host',seat:-1},{id:'p0',seat:0},{id:'p1',seat:1}];
 const room:any={host:true,room:{owner:'host',self:'host',members},broadcast:p=>messages.push(p)};
 const host=new NetworkRound(engines[0],room,'match',-1);
 const peers=[0,1].map(seat=>new NetworkRound(engines[seat+1],{host:false,room:{owner:'host'},send:(_to,p)=>host.receive('p'+seat,p)} as any,'match',seat));
 const errors:string[]=[];[host,...peers].forEach(p=>p.onError=e=>errors.push(e));
 for(let i=0;i<400;i++){peers.forEach((p,seat)=>p.advance([i%3?8:2,(i+seat*32)&127,0]));host.advance([0,0,0]);for(const packet of messages.splice(0))peers.forEach(p=>p.receive('host',packet));}
 for(let i=0;i<3;i++)peers.forEach(p=>p.advance([0,0,0]));
 expect(host.frame).toBeGreaterThan(390);expect(errors).toEqual([]);for(const e of engines.slice(1))expect(e._liero_hash()).toBe(engines[0]._liero_hash());
});
