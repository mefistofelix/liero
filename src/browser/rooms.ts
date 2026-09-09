import type {Preferences} from './preferences.ts';
import {RoomPresence,browserPresenceLease} from './room-presence.ts';
import {localCountry} from './flags.ts';
import {encodePacket,decodePacket,packetLane} from './net-packets.ts';
export type Member={id:string;name:string;color:string;seat:number;country?:string};
export type Room={id:string;hostEpoch?:number;name:string;region:string;country:string;private:boolean;phase:string;count:number;capacity:number;players?:number;settings:any;self:string;owner:string;members:Member[];chat:{seq:number;player:string;name:string;message:string;created_at:number}[]};
const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function api(path:string,method='GET',body?:unknown,invite='',identity=token){
 const response=await fetch(`/api${path}`,{method,headers:{Authorization:`Bearer ${identity}`,...(body?{'Content-Type':'application/json'}:{}),...(invite?{'X-Room-Invite':invite}:{})},body:body?JSON.stringify(body):undefined,keepalive:method==='DELETE',signal:AbortSignal.timeout(12000)});
 const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error||`Request failed (${response.status}).`),{status:response.status});return value;
}
type Packet=Record<string,any>;
export class Wire{
 pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 channels:RTCDataChannel[]=[];pending:RTCIceCandidateInit[]=[];
 private queues:(string|Uint8Array)[][]=[[],[],[]];private queuedBytes=0;private timer?:ReturnType<typeof setTimeout>;private opened=false;private dead=false;
 constructor(private signal:(data:Packet)=>Promise<void>,private message:(data:Packet)=>void,private ready:()=>void,private closed:()=>void){
  this.pc.onicecandidate=e=>{if(e.candidate)this.signal({type:'candidate',candidate:e.candidate.toJSON()}).catch(()=>this.close());};
  this.attach(this.pc.createDataChannel('control',{negotiated:true,id:0,ordered:true}),0);
  this.attach(this.pc.createDataChannel('actions',{negotiated:true,id:1,ordered:false}),1);
  this.attach(this.pc.createDataChannel('progress',{negotiated:true,id:2,ordered:false,maxRetransmits:0}),2);
  this.pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(this.pc.connectionState))this.close();};
 }
 attach(channel:RTCDataChannel,lane:number){this.channels[lane]=channel;channel.binaryType='arraybuffer';channel.bufferedAmountLowThreshold=16*1024;channel.onbufferedamountlow=()=>this.flush();channel.onopen=()=>{this.flush();if(!this.opened&&this.channels.length===3&&this.channels.every(c=>c.readyState==='open')){this.opened=true;this.ready();}};channel.onclose=()=>this.close();channel.onmessage=e=>{try{if(typeof e.data!=='string'&&!(e.data instanceof ArrayBuffer))return;this.message(decodePacket(e.data));}catch{this.close();}};}
 async offer(probe=false){await this.pc.setLocalDescription(await this.pc.createOffer());await this.signal({type:probe?'probe-offer':'offer',sdp:this.pc.localDescription!.sdp});}
 async receive(data:Packet){
  if(data.type==='candidate'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(data.candidate);else this.pending.push(data.candidate);return;}
  await this.pc.setRemoteDescription({type:data.type==='answer'?'answer':'offer',sdp:data.sdp});
  for(const c of this.pending)await this.pc.addIceCandidate(c);this.pending=[];
  if(data.type!=='answer'){await this.pc.setLocalDescription(await this.pc.createAnswer());await this.signal({type:'answer',sdp:this.pc.localDescription!.sdp});}
 }
 send(packet:Packet){
  if(this.dead)return;const data=encodePacket(packet),lane=packetLane(packet);if(data.length>60000)throw new Error('Packet too large');
  if(lane===2){for(const previous of this.queues[2])this.queuedBytes-=previous.length;this.queues[2]=[];}
  if(this.queuedBytes+data.length>8*1024*1024){this.close();return;}
  this.queues[lane].push(data);this.queuedBytes+=data.length;this.flush();
 }
 flush(){
  if(this.dead)return;clearTimeout(this.timer);this.timer=undefined;
  // Channels share congestion control. Prioritize actions and pace bulk control
  // data instead of filling SCTP with an entire checkpoint in one call.
  for(const lane of [1,2,0]){const channel=this.channels[lane];let budget=lane===0?16384:32768;
   while(channel?.readyState==='open'&&channel.bufferedAmount<32768&&this.queues[lane].length&&budget>0){const data=this.queues[lane].shift()!;this.queuedBytes-=data.length;budget-=data.length;channel.send(data as any);}}
  if(this.queuedBytes)this.timer=setTimeout(()=>this.flush(),16);
 }
 close(){if(this.dead)return;this.dead=true;clearTimeout(this.timer);this.queues=[[],[],[]];this.queuedBytes=0;this.pc.close();this.closed();}
}
export class RoomClient{
 room?:Room;invite='';id='';wires=new Map<string,Wire>();pings=new Map<string,number>();
 private epoch=0;private identity='';
 private presence=new RoomPresence((()=>{try{return sessionStorage;}catch{return undefined;}})(),['reload','back_forward'].includes((performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)?.type),identity=>api('/rooms','DELETE',undefined,'',identity),browserPresenceLease());
 recover(){return this.presence.leave();}
 private timer=0;private cursor=0;private stopped=true;private connecting=new Set<string>();private pingTimes=new Map<string,number>();private pollCount=0;
 onHostChanged=(previous:string,next:string)=>{};onState=(room:Room)=>{};onPacket=(from:string,packet:Packet)=>{};onReady=(id:string)=>{};onLost=(id:string)=>{};onError=(error:Error)=>{};
 get host(){return !!this.room&&this.room.self===this.room.owner;}
 get seat(){return this.room?.members.find(m=>m.id===this.room?.self)?.seat??-1;}
 async create(p:Preferences,auto=false){
  const epoch=++this.epoch;this.identity=await this.presence.begin();if(epoch!==this.epoch){await this.presence.leave();return;}
  const result=await api('/rooms','POST',{name:p.roomName,playerName:p.name,color:p.color,private:p.privateRoom,country:await localCountry(),settings:{...p.rules,rotation:p.rotation},auto},'',this.identity);
  if(epoch!==this.epoch){await this.presence.leave();return;}await this.enter(result.id,result.invite||'');
 }
 async join(id:string,invite:string,p:Preferences){
  if(id===this.id&&!this.stopped)return;
  const epoch=++this.epoch;this.identity=await this.presence.begin();if(epoch!==this.epoch){await this.presence.leave();return;}
  await api('/rooms/'+id+'/join','POST',{name:p.name,color:p.color,country:await localCountry()},invite,this.identity);
  if(epoch!==this.epoch){await this.presence.leave();return;}await this.enter(id,invite);
 }
 private async enter(id:string,invite:string){this.id=id;this.invite=invite;this.cursor=0;this.stopped=false;await this.poll();}
 async call(action:string,method='GET',body?:unknown){if(!this.id||this.stopped)throw new Error('Join a room first.');return api('/rooms/'+this.id+(action?'/'+action:''),method,body,this.invite,this.identity);}
 async refresh(){const epoch=this.epoch;if(!this.id)return;const state:Room=await this.call('state');if(epoch!==this.epoch||this.stopped)return;if(this.acceptState(state))this.onState(state);}
 private acceptState(state:Room){
  const previous=this.room;if(previous?.id===state.id&&(previous.hostEpoch||0)>(state.hostEpoch||0))return false;this.room=state;
  if(previous&&previous.owner!==state.owner){
   const wires=[...this.wires.values()];this.wires.clear();this.connecting.clear();this.pings.clear();this.pingTimes.clear();for(const wire of wires)wire.close();
   this.onHostChanged(previous.owner,state.owner);
  }
  for(const member of previous?.members||[])if(!state.members.some(m=>m.id===member.id)){const wire=this.wires.get(member.id);this.wires.delete(member.id);this.connecting.delete(member.id);this.pings.delete(member.id);wire?.close();}
  return true;
 }
 private wire(id:string){
  const epoch=this.epoch,current=()=>epoch===this.epoch&&!this.stopped&&this.wires.get(id)===wire;
  const wire=new Wire(data=>current()?this.call('signals','POST',{to:id,data}):Promise.resolve(),packet=>{
   if(!current())return;
   if(packet.type==='leaving'){void this.refresh().catch(error=>{if(current())this.onError(error);});return;}
   if(packet.type==='ping'){wire.send({type:'pong',at:packet.at});return;}
   if(packet.type==='pong'){const at=this.pingTimes.get(id);if(at===packet.at){this.pings.set(id,Math.round(performance.now()-at));this.pingTimes.delete(id);}return;}
   this.onPacket(id,packet);
  },()=>{if(current()){this.onReady(id);this.ping(id,wire);}},()=>{if(current()&&this.wires.get(id)===wire){this.wires.delete(id);this.connecting.delete(id);this.pings.delete(id);this.onLost(id);}});
  this.wires.set(id,wire);return wire;
 }
 private ping(id:string,wire:Wire){const at=performance.now();this.pingTimes.set(id,at);wire.send({type:'ping',at});}
 private async poll(){
  const epoch=this.epoch,current=()=>epoch===this.epoch&&!this.stopped;if(!current())return;
  try{
   let room:Room=await this.call('state');if(!current())return;if(!this.acceptState(room))room=this.room!;
   const inbox=await this.call(`signals?after=${this.cursor}`);if(!current())return;
   for(const signal of inbox.signals){this.cursor=Math.max(this.cursor,signal.seq);const data=JSON.parse(signal.body);let wire=this.wires.get(signal.sender);
    if(!wire&&['offer','probe-offer','candidate'].includes(data.type)&&this.host)wire=this.wire(signal.sender);
    if(wire)await wire.receive(data);if(!current())return;
   }
   if(!this.host&&!this.wires.has(room.owner)&&!this.connecting.has(room.owner)){
    this.connecting.add(room.owner);await this.wire(room.owner).offer();if(!current())return;
   }
   if(++this.pollCount%3===0){for(const [id,wire]of this.wires)this.ping(id,wire);if(this.host)void this.call('pings','PUT',{pings:Object.fromEntries([...this.pings].filter(([id,ms])=>this.room?.members.some(member=>member.id===id)&&Number.isInteger(ms)&&ms>=0&&ms<=60000))}).catch(()=>{});}
   this.onState(room);
  }catch(error){if(current())this.onError(error as Error);}
  if(current())this.timer=window.setTimeout(()=>this.poll(),1000);
 }
 send(id:string,packet:Packet){this.wires.get(id)?.send(packet);}
 broadcast(packet:Packet){for(const m of this.room?.members||[])if(m.id!==this.room?.self)this.send(m.id,packet);}
 async leave(){
  this.stopped=true;++this.epoch;clearTimeout(this.timer);this.id='';this.room=undefined;
  const wires=[...this.wires.values()];this.wires.clear();this.connecting.clear();this.pings.clear();this.pingTimes.clear();
  try{await this.presence.leave();for(const wire of wires)wire.send({type:'leaving'});}finally{for(const wire of wires)wire.close();}
 }

}
export async function probeRoom(id:string):Promise<number>{
 let cursor=0,stopped=false,timer=0,timeout=0;
 const identity=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
 return new Promise((resolve,reject)=>{
  const end=(ms?:number)=>{if(stopped)return;stopped=true;clearTimeout(timer);clearTimeout(timeout);wire.close();ms===undefined?reject(new Error('Ping unavailable')):resolve(ms);};
  let sent=0;
  const wire=new Wire(data=>api(`/rooms/${id}/signals`,'POST',{data},'',identity),packet=>{if(packet.type==='pong'&&packet.at===sent)end(Math.round(performance.now()-sent));},()=>{sent=performance.now();wire.send({type:'ping',at:sent});},()=>end());
  const poll=async()=>{if(stopped)return;try{const result=await api(`/rooms/${id}/signals?after=${cursor}`,'GET',undefined,'',identity);for(const signal of result.signals){cursor=Math.max(cursor,signal.seq);await wire.receive(JSON.parse(signal.body));}}catch{end();}if(!stopped)timer=window.setTimeout(poll,600);};
  timeout=window.setTimeout(()=>end(),12000);wire.offer(true).then(poll).catch(()=>end());
 });
}
