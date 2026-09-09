import type {EngineModule} from './engine.ts';
import type {RoomClient} from './rooms.ts';
import {weaponPool,type Rules} from './preferences.ts';
export const NETWORK_VERSION=5;
export type Input=[number,number,number];
export type Frame=[number,number,number,number,number,number,number,(Rules|null)?,(number[][])?];
export const rulesKey=(rules:Rules)=>JSON.stringify([rules.mode,rules.lives,rules.loading,rules.bonuses,weaponPool(rules.allowedWeapons).sort((a,b)=>a-b)]);
export function applyLiveRules(engine:EngineModule,rules:Rules){const pool=weaponPool(rules.allowedWeapons);for(let id=1;id<=40;id++)engine._liero_allowed(id,pool.includes(id)?1:0);engine._liero_rules_live(rules.mode,rules.lives,rules.loading,rules.bonuses);}
function validRules(r:any):r is Rules{return !!r&&[[r.mode,0,3],[r.lives,1,99],[r.loading,1,1000],[r.bonuses,0,20]].every(([n,min,max])=>Number.isInteger(n)&&n>=min&&n<=max)&&Array.isArray(r.allowedWeapons)&&r.allowedWeapons.length>0&&r.allowedWeapons.length<=40&&r.allowedWeapons.every((id:number)=>Number.isInteger(id)&&id>=1&&id<=40);}
export function applyLiveLoadout(engine:EngineModule,player:number,loadout:number[]){loadout.forEach((id,slot)=>engine._liero_loadout(player,slot,id));engine._liero_loadout_live(player);}
const validLoadouts=(value:any)=>Array.isArray(value)&&value.length===2&&value.every(list=>Array.isArray(list)&&(list.length===0||list.length===5&&list.every(id=>Number.isInteger(id)&&id>=1&&id<=40)));
const neutral:Input=[0,96,0],DELAY=6;
export class NetworkRound{
 frame=0;ended=false;log:Frame[]=[];private local=new Map<number,Input>();private remote=new Map<number,Input>();private commits=new Map<number,Frame>();private sent=-1;
 onEnd=()=>{};onError=(message:string)=>{};
 private pendingRules?:Rules;private pendingLoadouts:number[][]=[[],[]];
 queueLoadout(seat:number,loadout:number[]){if(this.room.host&&(seat===0||seat===1)&&loadout.length===5&&loadout.every(id=>Number.isInteger(id)&&id>=1&&id<=40))this.pendingLoadouts[seat]=[...loadout];}
 queueRules(rules:Rules){if(this.room.host)this.pendingRules={mode:rules.mode,lives:rules.lives,loading:rules.loading,bonuses:rules.bonuses,allowedWeapons:weaponPool(rules.allowedWeapons)};}
 private stopRequested=false;private stopSent=false;private stopDone?:()=>void;
 requestStop(){
  if(this.spectator||this.ended)return Promise.resolve();
  this.stopRequested=true;
  return new Promise<void>(resolve=>{const timer=setTimeout(()=>{this.stopDone=undefined;resolve();},3000);this.stopDone=()=>{clearTimeout(timer);this.stopDone=undefined;resolve();};});
 }
 constructor(private engine:EngineModule,private room:RoomClient,readonly id:string,readonly seat:number,readonly participants=3){for(let f=0;f<DELAY;f++){this.local.set(f,[...neutral]);this.remote.set(f,[...neutral]);}this.sent=DELAY-1;}
 get spectator(){return this.seat<0;}
 get needsInput(){return !this.spectator&&this.frame+DELAY>this.sent;}
 receive(from:string,packet:Record<string,any>){
  if(packet.round!==this.id||this.ended)return;
  if(packet.type==='input'&&this.room.host){
   const seat=this.room.room?.members.find(m=>m.id===from)?.seat;if(seat!==0&&seat!==1)return;
   const f=packet.frame,i=packet.input;if(!Number.isInteger(f)||f<this.frame||f>this.frame+180||!validInput(i))return;
   const inputs=seat===0?this.local:this.remote;if(!inputs.has(f))inputs.set(f,i);
  }
  if((packet.type==='frame'||packet.type==='history')&&!this.room.host&&from===this.room.room?.owner){
   const frames=packet.type==='frame'?[packet.data]:packet.frames,start=packet.frame;
   if(!Number.isInteger(start)||!Array.isArray(frames)||frames.length>120)return;
   for(let n=0;n<frames.length;n++){
    const data=frames[n],f=start+n;if(f<this.frame||f>252000||!Array.isArray(data)||![7,8,9].includes(data.length)||(data.length>=8&&data[7]!==null&&!validRules(data[7]))||(data.length===9&&!validLoadouts(data[8]))||!validInput(data.slice(0,3))||!validInput(data.slice(3,6)))continue;
    this.commits.set(f,data);
   }
  }
 }
 advance(input:Input):boolean{
  if(this.ended)return false;
  if(!this.spectator){
   const future=this.frame+DELAY;
   if(future>this.sent&&this.stopRequested&&!this.stopSent){input=[256,input[1],0];this.stopSent=true;}
   if(future>this.sent){this.sent=future;(this.room.host&&this.seat===1?this.remote:this.local).set(future,input);if(!this.room.host)this.room.send(this.room.room!.owner,{type:'input',round:this.id,frame:future,input});}
  }
  let data:Frame;
  if(this.room.host){
   const a=this.participants&1?this.local.get(this.frame):neutral,b=this.participants&2?this.remote.get(this.frame):neutral;if(!a||!b)return false;
   data=[...a,...b,0];
   if(this.pendingRules){data[7]=this.pendingRules;this.pendingRules=undefined;}
   if(this.pendingLoadouts.some(list=>list.length)){data[7]??=null;data[8]=this.pendingLoadouts;this.pendingLoadouts=[[],[]];}
  }else{const commit=this.commits.get(this.frame);if(!commit)return false;data=commit;}
  if(data[7])applyLiveRules(this.engine,data[7]);
  if(data[8])data[8].forEach((list,seat)=>{if(list.length)applyLiveLoadout(this.engine,seat,list);});
  const alive=this.engine._liero_step(...data.slice(0,6) as [number,number,number,number,number,number]);
  if(this.frame%70===0){const hash=this.engine._liero_hash()>>>0;if(this.room.host)data[6]=hash;else if(data[6]!==hash){this.ended=true;this.onError('Game state diverged. Return to the room and start a new round.');return false;}}
  if(this.room.host){this.log.push(data);this.room.broadcast({type:'frame',round:this.id,frame:this.frame,data});}
  this.local.delete(this.frame);this.remote.delete(this.frame);this.commits.delete(this.frame);this.frame++;
  if(this.seat>=0&&(data[this.seat*3]&256))this.stopDone?.();
  if(!alive||this.frame>=252000){this.ended=true;this.onEnd();}
  return true;
 }
 catchUp(){if(this.spectator){let count=0;while(this.commits.size>3&&count++<200&&!this.ended)if(!this.advance(neutral))break;}}
 history(to:string){for(let f=0;f<this.log.length;f+=120)this.room.send(to,{type:'history',round:this.id,frame:f,frames:this.log.slice(f,f+120)});}
}
function validInput(i:any):i is Input{return Array.isArray(i)&&i.length===3&&i.every(Number.isInteger)&&i[0]>=0&&i[0]<=511&&i[1]>=0&&i[1]<=127&&Math.abs(i[2])<=1;}
