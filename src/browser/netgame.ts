import type {EngineModule} from './engine.ts';
import type {RoomClient} from './rooms.ts';
import {weaponPool,type Rules} from './preferences.ts';
import {compressCheckpoint,decompressCheckpoint,MAX_CHECKPOINT,type Packet} from './net-packets.ts';
export const NETWORK_VERSION=6;
export type Input=[number,number,number];
type Event={type:'event';round:string;serial:number;frame:number;kind:'input'|'rules'|'loadout';seat?:number;sequence?:number;input?:Input;rules?:Rules;loadout?:number[]};
const INPUT_DELAY=2,MAX_PREDICTION=14,MAX_FUTURE=120,MAX_EVENTS=2048,ROUND_LIMIT=252000;
const neutral=():Input=>[0,96,0],pair=():Input[]=>[neutral(),neutral()];
const integer=(n:any,min=0,max=ROUND_LIMIT)=>Number.isInteger(n)&&n>=min&&n<=max;
const same=(a:Input,b:Input)=>a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2];
export const rulesKey=(rules:Rules)=>JSON.stringify([rules.mode,rules.lives,rules.loading,rules.bonuses,weaponPool(rules.allowedWeapons).sort((a,b)=>a-b)]);
export function applyLiveRules(engine:EngineModule,rules:Rules){const pool=weaponPool(rules.allowedWeapons);for(let id=1;id<=40;id++)engine._liero_allowed(id,pool.includes(id)?1:0);engine._liero_rules_live(rules.mode,rules.lives,rules.loading,rules.bonuses);}
export function applyLiveLoadout(engine:EngineModule,player:number,loadout:number[]){loadout.forEach((id,slot)=>engine._liero_loadout(player,slot,id));engine._liero_loadout_live(player);}
function validRules(r:any):r is Rules{return !!r&&[[r.mode,0,3],[r.lives,1,99],[r.loading,1,1000],[r.bonuses,0,20]].every(([n,min,max])=>integer(n,min,max))&&Array.isArray(r.allowedWeapons)&&r.allowedWeapons.length>0&&r.allowedWeapons.length<=40&&r.allowedWeapons.every((id:number)=>integer(id,1,40));}
const validLoadout=(v:any)=>Array.isArray(v)&&v.length===5&&v.every(id=>integer(id,1,40));
function validInput(i:any):i is Input{return Array.isArray(i)&&i.length===3&&integer(i[0],0,511)&&integer(i[1],0,127)&&integer(i[2],-1,1);}
function validEvent(e:any):e is Event{return e?.type==='event'&&integer(e.frame)&&integer(e.serial,1,10000000)&&(e.kind==='rules'?validRules(e.rules):integer(e.seat,0,1)&&(e.kind==='loadout'?validLoadout(e.loadout):e.kind==='input'&&validInput(e.input)&&integer(e.sequence,1,10000000)));}

// Host-ordered actions, a confirmed world and a bounded predicted view, following
// WebLiero's architecture. Every actual tick is still the native C++ step.
export class NetworkRound{
 frame=0;predictedFrame=0;ended=false;ready=false;
 onEnd=()=>{};onError=(message:string)=>{};
 readonly metrics={inputsSent:0,eventsAccepted:0,predictedTicks:0,replayedTicks:0,checkpoints:0,resyncs:0};
 private initialized=false;private clock=0;private serial=0;private contiguous=0;
 private held=pair();private predictedHeld=pair();private lastInput=neutral();private sequence=0;
 private acceptedSequence=[0,0];private assignedTick=[-1,-1];private proposals=[new Map<number,Packet>(),new Map<number,Packet>()];
 private events=new Map<number,Event>();private received=new Set<number>();private pending=new Map<number,Event>();
 private progresses=new Map<number,Packet>();private dirty=true;private predicted=false;
 private checkpointToken=0;private loadedToken=0;private incoming?:Packet;private sending=new Set<string>();
 private resyncAt=-Infinity;private syncRequested=false;private resyncFailures=0;private resyncTimes=new Map<string,number>();
 private stopRequested=false;private stopSent=false;private stopDone?:()=>void;
 constructor(private engine:EngineModule,private room:RoomClient,readonly id:string,readonly seat:number,readonly participants=3){}
 get spectator(){return this.seat<0;}
 get needsInput(){return this.ready&&!this.spectator&&!this.ended;}
 get bufferedEvents(){return this.events.size+this.pending.size+this.received.size;}
 initialize(){if(this.initialized)return;this.initialized=true;this.engine._liero_net_enable();this.ready=this.room.host;if(this.ready)this.saveConfirmed();}
 private fail(message:string){this.ended=true;this.stopDone?.();this.onError(message);}
 private saveConfirmed(){if(!this.engine._liero_net_save(0))throw new Error('Cannot save the game state.');}
 private restoreConfirmed(){this.engine._liero_net_prediction(0);if(!this.engine._liero_net_restore(0))throw new Error('Cannot restore the game state.');this.predicted=false;}
 private finish(){if(this.ended)return;this.ended=true;this.stopDone?.();this.onEnd();}
 queueRules(rules:Rules){if(this.room.host)this.accept({kind:'rules',rules:{...rules,allowedWeapons:weaponPool(rules.allowedWeapons)},frame:this.frame});}
 queueLoadout(seat:number,loadout:number[]){if(this.room.host&&integer(seat,0,1)&&validLoadout(loadout))this.accept({kind:'loadout',seat,loadout:[...loadout],frame:this.frame});}
 requestStop(){
  if(this.spectator||this.ended)return Promise.resolve();this.stopRequested=true;
  return new Promise<void>(resolve=>{const timer=setTimeout(()=>{this.stopDone=undefined;resolve();},3000);this.stopDone=()=>{clearTimeout(timer);this.stopDone=undefined;resolve();};});
 }
 private accept(value:Partial<Event>){
  if(this.events.size>=MAX_EVENTS){this.fail('Too many pending game actions.');return;}
  const event={...value,type:'event',round:this.id,serial:++this.serial} as Event;
  this.events.set(event.serial,event);this.metrics.eventsAccepted++;this.room.broadcast(event);
 }
 private proposal(seat:number,p:Packet){
  if(!validInput(p.input)||!integer(p.sequence,1,10000000)||p.sequence<=this.acceptedSequence[seat]||p.sequence>this.acceptedSequence[seat]+MAX_FUTURE||!integer(p.frame,0,Math.min(ROUND_LIMIT,this.frame+MAX_FUTURE)))return;
  const queue=this.proposals[seat];if(!queue.has(p.sequence))queue.set(p.sequence,p);
  while(queue.has(this.acceptedSequence[seat]+1)){
   const next=queue.get(++this.acceptedSequence[seat])!;queue.delete(this.acceptedSequence[seat]);
   const frame=Math.max(this.frame,next.frame,this.assignedTick[seat]+1);if(frame>this.frame+MAX_FUTURE){this.fail('Input queue exceeded its time limit.');return;}
   this.assignedTick[seat]=frame;this.accept({kind:'input',frame,seat,sequence:next.sequence,input:[...next.input] as Input});
  }
 }
 receive(from:string,p:Packet){
  if(p.round!==this.id||this.ended)return;
  if(this.room.host){
   if(p.type==='input-event'){const seat=this.room.room?.members.find(m=>m.id===from)?.seat;if(integer(seat,0,1)&&(this.participants&(1<<seat!)))this.proposal(seat!,p);}
   if(p.type==='resync'&&this.room.room?.members.some(m=>m.id===from)){const now=performance.now();if(now-(this.resyncTimes.get(from)??-Infinity)>1000){this.resyncTimes.set(from,now);void this.sendCheckpoint(from).catch(e=>this.onError(e.message));}}
   return;
  }
  if(from!==this.room.room?.owner)return;
  if(p.type==='event'){
   if(!validEvent(p)||p.serial<=this.contiguous||this.received.has(p.serial))return;
   if(this.events.size>=MAX_EVENTS||p.serial>this.contiguous+MAX_EVENTS){this.requestResync();return;}
   this.events.set(p.serial,p);this.received.add(p.serial);
   while(this.received.delete(this.contiguous+1))this.contiguous++;
   const own=p.kind==='input'&&p.seat===this.seat?this.pending.get(p.sequence!):undefined;
   if(p.frame<this.predictedFrame&&(!own||own.frame!==p.frame||!same(own.input!,p.input!)))this.dirty=true;
   if(own)this.pending.delete(p.sequence!);
  }else if(p.type==='progress'){
   if(!integer(p.frame)||!integer(p.serial,0,10000000)||!integer(p.hash,0,0xffffffff)||p.frame<this.frame)return;
   if(this.progresses.size>=MAX_EVENTS){this.requestResync();return;}
   this.progresses.set(p.frame,p);
   const oneWay=Math.min(MAX_PREDICTION,Math.ceil((this.room.pings?.get(from)||0)*70/2000));
   this.clock=Math.max(this.clock,Math.min(this.frame+MAX_PREDICTION,p.frame+oneWay));
  }else if(p.type==='checkpoint-meta'){
   if(!integer(p.token,1,0xffffffff)||p.token<=this.loadedToken||!integer(p.frame)||!integer(p.serial,0,10000000)||!integer(p.bytes,1,MAX_CHECKPOINT)||!Array.isArray(p.held)||p.held.length!==2||!p.held.every(validInput)||!Array.isArray(p.events)||p.events.length>MAX_EVENTS||!p.events.every((e:any)=>validEvent(e)&&e.round===this.id&&e.frame>=p.frame&&e.serial<=p.serial)||!Array.isArray(p.ack)||p.ack.length!==2||!p.ack.every((n:any)=>integer(n,0,10000000)))return;
   this.incoming={...p,chunks:[],size:0,at:performance.now()};
  }else if(p.type==='checkpoint-chunk'){
   const meta=this.incoming;if(!meta||meta.token!==p.token||meta.done)return;
   if(!(p.data instanceof Uint8Array)||p.offset!==meta.size||p.data.length>8192||!p.data.length||meta.size+p.data.length>meta.bytes){this.incoming=undefined;this.requestResync();return;}
   meta.chunks.push(p.data);meta.size+=p.data.length;meta.at=performance.now();
   if(meta.size===meta.bytes){meta.done=true;void this.loadCheckpoint(meta).catch(()=>{if(this.incoming===meta)this.incoming=undefined;this.requestResync();});}
  }
 }
 private async loadCheckpoint(meta:Packet){
  const compressed=new Uint8Array(meta.bytes);let offset=0;for(const part of meta.chunks){compressed.set(part,offset);offset+=part.length;}
  const bytes=await decompressCheckpoint(compressed);if(this.ended||this.incoming!==meta)return;if(meta.frame<this.frame)throw new Error('Outdated checkpoint');
  this.initialize();this.engine._liero_net_prediction(0);
  const ptr=this.engine._liero_net_buffer();this.engine.HEAPU8.set(bytes,ptr);if(!this.engine._liero_net_load(bytes.length))throw new Error('Invalid game checkpoint');
  this.frame=meta.frame;this.clock=meta.frame;this.held=meta.held.map((i:Input)=>[i[0]&255,i[1],0]);
  for(const [serial,e]of this.events)if(serial<=meta.serial||e.frame<meta.frame)this.events.delete(serial);
  for(const e of meta.events)this.events.set(e.serial,e);
  this.contiguous=Math.max(meta.serial,this.contiguous);for(const serial of this.received)if(serial<=this.contiguous)this.received.delete(serial);
  while(this.received.delete(this.contiguous+1))this.contiguous++;
  for(const frame of this.progresses.keys())if(frame<this.frame)this.progresses.delete(frame);
  if(this.seat>=0){for(const seq of this.pending.keys())if(seq<=meta.ack[this.seat])this.pending.delete(seq);this.sequence=Math.max(this.sequence,meta.ack[this.seat]);}
  this.saveConfirmed();this.ready=true;this.predicted=false;this.dirty=true;this.loadedToken=meta.token;this.incoming=undefined;this.syncRequested=false;this.resyncFailures=0;
  this.lastInput=[-1,-1,0];this.metrics.checkpoints++;
 }
 private requestResync(){
  if(this.room.host||this.ended)return;
  const now=performance.now();if(now-this.resyncAt<1000)return;this.resyncAt=now;this.syncRequested=true;this.metrics.resyncs++;
  if(++this.resyncFailures>6){this.fail('Unable to synchronize this game. Rejoin the room.');return;}
  this.room.send(this.room.room!.owner,{type:'resync',round:this.id});
 }
 private run(frame:number,held:Input[],events:Event[]){
  const inputs=held.map(i=>[...i] as Input);
  for(const e of events){
   if(e.kind==='rules')applyLiveRules(this.engine,e.rules!);
   else if(e.kind==='loadout')applyLiveLoadout(this.engine,e.seat!,e.loadout!);
   else{const i=e.input!;held[e.seat!]=[i[0]&255,i[1],0];inputs[e.seat!]=[...i];}
  }
  for(let seat=0;seat<2;seat++)if(!(this.participants&(1<<seat)))inputs[seat]=neutral();
  return this.engine._liero_step(...[...inputs[0],...inputs[1]] as [number,number,number,number,number,number]);
 }
 private at(frame:number,prediction=false){
  const events=[...this.events.values()].filter(e=>e.frame===frame);
  if(prediction)for(const e of this.pending.values())if(e.frame===frame)events.push(e);
  return events.sort((a,b)=>a.serial-b.serial);
 }
 private confirm(){
  const progress=[...this.progresses.values()].filter(p=>p.serial<=this.contiguous&&p.frame>=this.frame).sort((a,b)=>a.frame-b.frame);
  if(!progress.length)return;
  const goal=progress.at(-1)!;if(goal.frame-this.frame>140){this.requestResync();return;}
  this.restoreConfirmed();
  for(const p of progress){
   while(this.frame<p.frame){const events=this.at(this.frame);this.run(this.frame,this.held,events);for(const e of events){this.events.delete(e.serial);if(e.kind==='input'&&e.seat===this.seat&&(e.input![0]&256))this.stopDone?.();}this.frame++;}
   if(p.hash&&(this.engine._liero_net_hash()>>>0)!==p.hash){this.requestResync();this.saveConfirmed();return;}
   this.progresses.delete(p.frame);
  }
  this.saveConfirmed();this.dirty=true;if(goal.ended)this.finish();
 }
 private sample(input:Input){
  if(this.spectator)return;
  if(this.stopRequested&&!this.stopSent){input=[256,input[1],0];this.stopSent=true;}
  if(input[0]===this.lastInput[0]&&input[1]===this.lastInput[1]&&!input[2]&&!(input[0]&256))return;
  this.lastInput=[input[0]&255,input[1],0];const sequence=++this.sequence;
  const p={type:'input-event',round:this.id,frame:Math.min(ROUND_LIMIT,(this.room.host?this.frame:this.clock)+INPUT_DELAY),sequence,input:[...input] as Input};
  if(this.room.host)this.proposal(this.seat,p);
  else{const event={...p,type:'event',kind:'input',seat:this.seat,serial:10000000+sequence} as Event;this.pending.set(sequence,event);this.room.send(this.room.room!.owner,p);this.metrics.inputsSent++;if(event.frame<this.predictedFrame)this.dirty=true;}
 }
 private progress(ended=false){this.room.broadcast({type:'progress',round:this.id,frame:this.frame,serial:this.serial,hash:this.frame%70===0||ended?this.engine._liero_net_hash()>>>0:0,ended});}
 advance(input:Input):boolean{
  if(this.ended)return false;
  try{
   this.initialize();if(this.incoming&&performance.now()-this.incoming.at>10000){this.incoming=undefined;this.requestResync();}
   if(!this.ready){if(!this.incoming&&this.clock++>140)this.requestResync();return true;}
   if(!this.room.host){if(!this.syncRequested)this.confirm();else this.requestResync();if(this.ended)return false;}
   this.sample(input);
   if(this.room.host){
    const events=this.at(this.frame),alive=this.run(this.frame,this.held,events);
    for(const e of events){this.events.delete(e.serial);if(e.kind==='input'&&e.seat===this.seat&&(e.input![0]&256))this.stopDone?.();}
    this.frame++;this.predictedFrame=this.frame;
    const ended=!alive||this.frame>=ROUND_LIMIT;if(this.frame%7===0||ended)this.progress(ended);if(ended)this.finish();
   }else{
    this.clock=Math.min(Math.max(this.clock,this.frame)+1,this.frame+MAX_PREDICTION);
    if(this.pending.size>=MAX_EVENTS){this.requestResync();return true;}
    if(this.dirty||!this.predicted){const previous=this.predictedFrame;this.restoreConfirmed();this.predictedHeld=this.held.map(i=>[...i]);this.predictedFrame=this.frame;this.engine._liero_net_prediction(1);this.predicted=true;this.dirty=false;this.metrics.replayedTicks+=Math.max(0,Math.min(previous,this.clock)-this.frame);}
    while(this.predictedFrame<this.clock){this.run(this.predictedFrame,this.predictedHeld,this.at(this.predictedFrame,true));this.predictedFrame++;this.metrics.predictedTicks++;}
   }
   return true;
  }catch(error){this.fail(error instanceof Error?error.message:'Game synchronization failed.');return false;}
 }
 async sendCheckpoint(to:string){
  if(!this.room.host||this.ended||this.sending.has(to))return;this.initialize();this.sending.add(to);
  try{
   const length=this.engine._liero_net_save(1);if(!length)throw new Error('Cannot save the game state.');
   const bytes=this.engine.HEAPU8.slice(this.engine._liero_net_data(1),this.engine._liero_net_data(1)+length);
   const meta={type:'checkpoint-meta',round:this.id,token:++this.checkpointToken,frame:this.frame,serial:this.serial,held:this.held.map(i=>[...i]),ack:[...this.acceptedSequence],events:[...this.events.values()]};
   const compressed=await compressCheckpoint(bytes);if(this.ended)return;
   this.room.send(to,{...meta,bytes:compressed.length});
   for(let offset=0;offset<compressed.length;offset+=8192)this.room.send(to,{type:'checkpoint-chunk',round:this.id,token:meta.token,offset,data:compressed.slice(offset,offset+8192)});
  }finally{this.sending.delete(to);}
 }
}
