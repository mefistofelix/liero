import type {Preferences} from './preferences.ts';
import {localCountry} from './flags.ts';
export type Member={id:string;name:string;color:string;seat:number;country?:string};
export type Room={id:string;name:string;region:string;country:string;private:boolean;phase:string;count:number;capacity:number;players?:number;settings:any;self:string;owner:string;members:Member[];chat:{seq:number;name:string;message:string;created_at:number}[]};
const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
export async function api(path:string,method='GET',body?:unknown,invite='',identity=token){
 const response=await fetch(`/api${path}`,{method,headers:{Authorization:`Bearer ${identity}`,...(body?{'Content-Type':'application/json'}:{}),...(invite?{'X-Room-Invite':invite}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});
 const value=await response.json();if(!response.ok)throw new Error(value.error||`Request failed (${response.status}).`);return value;
}
type Packet=Record<string,any>;
class Wire{
 pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
 channel?:RTCDataChannel;pending:RTCIceCandidateInit[]=[];queue:string[]=[];
 constructor(private signal:(data:Packet)=>Promise<void>,private message:(data:Packet)=>void,private ready:()=>void,private closed:()=>void){
  this.pc.onicecandidate=e=>{if(e.candidate)this.signal({type:'candidate',candidate:e.candidate.toJSON()}).catch(()=>this.close());};
  this.pc.ondatachannel=e=>this.attach(e.channel);
  this.pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(this.pc.connectionState))this.closed();};
 }
 attach(channel:RTCDataChannel){this.channel=channel;channel.bufferedAmountLowThreshold=64*1024;channel.onbufferedamountlow=()=>this.flush();channel.onopen=()=>{this.flush();this.ready();};channel.onclose=()=>{this.pc.close();this.closed();};channel.onmessage=e=>{try{if(typeof e.data!=='string'||e.data.length>60000)return;this.message(JSON.parse(e.data));}catch{this.close();}};}
 async offer(probe=false){this.attach(this.pc.createDataChannel('liero',{ordered:true}));await this.pc.setLocalDescription(await this.pc.createOffer());await this.signal({type:probe?'probe-offer':'offer',sdp:this.pc.localDescription!.sdp});}
 async receive(data:Packet){
  if(data.type==='candidate'){if(this.pc.remoteDescription)await this.pc.addIceCandidate(data.candidate);else this.pending.push(data.candidate);return;}
  await this.pc.setRemoteDescription({type:data.type==='answer'?'answer':'offer',sdp:data.sdp});
  for(const c of this.pending)await this.pc.addIceCandidate(c);this.pending=[];
  if(data.type!=='answer'){await this.pc.setLocalDescription(await this.pc.createAnswer());await this.signal({type:'answer',sdp:this.pc.localDescription!.sdp});}
 }
 send(packet:Packet){const data=JSON.stringify(packet);if(data.length>60000)throw new Error('Packet too large');if(this.queue.length>2000){this.close();return;}this.queue.push(data);this.flush();}
 flush(){while(this.channel?.readyState==='open'&&this.channel.bufferedAmount<128*1024&&this.queue.length)this.channel.send(this.queue.shift()!);}
 close(){this.queue=[];this.pc.close();}
}
export class RoomClient{
 room?:Room;invite='';id='';wires=new Map<string,Wire>();pings=new Map<string,number>();
 private timer=0;private cursor=0;private stopped=true;private connecting=new Set<string>();private pingTimes=new Map<string,number>();private pollCount=0;
 onState=(room:Room)=>{};onPacket=(from:string,packet:Packet)=>{};onReady=(id:string)=>{};onLost=(id:string)=>{};onError=(error:Error)=>{};
 get host(){return !!this.room&&this.room.self===this.room.owner;}
 get seat(){return this.room?.members.find(m=>m.id===this.room?.self)?.seat??-1;}
 async create(p:Preferences,auto=false){const result=await api('/rooms','POST',{name:p.roomName,playerName:p.name,color:p.color,private:p.privateRoom,country:await localCountry(),settings:{...p.rules,rotation:p.rotation},auto});await this.enter(result.id,result.invite||'');}
 async join(id:string,invite:string,p:Preferences){await api(`/rooms/${id}/join`,'POST',{name:p.name,color:p.color,country:await localCountry()},invite);await this.enter(id,invite);}
 private async enter(id:string,invite:string){this.id=id;this.invite=invite;this.cursor=0;this.stopped=false;await this.poll();}
 async call(action:string,method='GET',body?:unknown){return api(`/rooms/${this.id}${action?`/${action}`:''}`,method,body,this.invite);}
 private wire(id:string){
  const wire=new Wire(data=>this.call('signals','POST',{to:id,data}),packet=>{
   if(packet.type==='ping'){wire.send({type:'pong',at:packet.at});return;}
   if(packet.type==='pong'){const at=this.pingTimes.get(id);if(at===packet.at){this.pings.set(id,Math.round(performance.now()-at));this.pingTimes.delete(id);}return;}
   this.onPacket(id,packet);
  },()=>{this.onReady(id);this.ping(id,wire);},()=>{this.wires.delete(id);this.connecting.delete(id);this.pings.delete(id);this.onLost(id);});
  this.wires.set(id,wire);return wire;
 }
 private ping(id:string,wire:Wire){const at=performance.now();this.pingTimes.set(id,at);wire.send({type:'ping',at});}
 private async poll(){
  if(this.stopped)return;
  try{
   const room:Room=await this.call('state');if(this.stopped)return;this.room=room;
   const inbox=await this.call(`signals?after=${this.cursor}`);if(this.stopped)return;
   for(const signal of inbox.signals){this.cursor=Math.max(this.cursor,signal.seq);const data=JSON.parse(signal.body);let wire=this.wires.get(signal.sender);
    if(!wire&&['offer','probe-offer','candidate'].includes(data.type)&&this.host)wire=this.wire(signal.sender);
    if(wire)await wire.receive(data);
   }
   if(!this.host&&!this.wires.has(room.owner)&&!this.connecting.has(room.owner)){
    this.connecting.add(room.owner);await this.wire(room.owner).offer();
   }
   if(++this.pollCount%3===0)for(const [id,wire]of this.wires)this.ping(id,wire);
   this.onState(room);
  }catch(error){if(!this.stopped)this.onError(error as Error);}
  if(!this.stopped)this.timer=window.setTimeout(()=>this.poll(),1000);
 }
 send(id:string,packet:Packet){this.wires.get(id)?.send(packet);}
 broadcast(packet:Packet){for(const m of this.room?.members||[])if(m.id!==this.room?.self)this.send(m.id,packet);}
 async leave(){this.stopped=true;clearTimeout(this.timer);const id=this.id;this.id='';if(id)await api(`/rooms/${id}`,'DELETE',undefined,this.invite).catch(()=>{});for(const wire of this.wires.values())wire.close();this.wires.clear();this.connecting.clear();this.pings.clear();this.room=undefined;}
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
