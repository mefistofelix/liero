import type {EngineModule} from './engine.ts';
import type {RoomClient} from './rooms.ts';
export type Input=[number,number,number];
export type Frame=[number,number,number,number,number,number,number];
const neutral:Input=[0,96,0],DELAY=6;
export class NetworkRound{
 frame=0;ended=false;log:Frame[]=[];private local=new Map<number,Input>();private remote=new Map<number,Input>();private commits=new Map<number,Frame>();private sent=-1;
 onEnd=()=>{};onError=(message:string)=>{};
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
    const data=frames[n],f=start+n;if(f<this.frame||f>252000||!Array.isArray(data)||data.length!==7||!validInput(data.slice(0,3))||!validInput(data.slice(3,6)))continue;
    this.commits.set(f,data);
   }
  }
 }
 advance(input:Input):boolean{
  if(this.ended)return false;
  if(!this.spectator){
   const future=this.frame+DELAY;
   if(future>this.sent){this.sent=future;(this.room.host&&this.seat===1?this.remote:this.local).set(future,input);if(!this.room.host)this.room.send(this.room.room!.owner,{type:'input',round:this.id,frame:future,input});}
  }
  let data:Frame;
  if(this.room.host){
   const a=this.participants&1?this.local.get(this.frame):neutral,b=this.participants&2?this.remote.get(this.frame):neutral;if(!a||!b)return false;
   data=[...a,...b,0];
  }else{const commit=this.commits.get(this.frame);if(!commit)return false;data=commit;}
  const alive=this.engine._liero_step(...data.slice(0,6) as [number,number,number,number,number,number]);
  if(this.frame%70===0){const hash=this.engine._liero_hash()>>>0;if(this.room.host)data[6]=hash;else if(data[6]!==hash){this.ended=true;this.onError('Game state diverged. Return to the room and start a new round.');return false;}}
  if(this.room.host){this.log.push(data);this.room.broadcast({type:'frame',round:this.id,frame:this.frame,data});}
  this.local.delete(this.frame);this.remote.delete(this.frame);this.commits.delete(this.frame);this.frame++;
  if(!alive||this.frame>=252000){this.ended=true;this.onEnd();}
  return true;
 }
 catchUp(){if(this.spectator){let count=0;while(this.commits.size>3&&count++<200&&!this.ended)if(!this.advance(neutral))break;}}
 history(to:string){for(let f=0;f<this.log.length;f+=120)this.room.send(to,{type:'history',round:this.id,frame:f,frames:this.log.slice(f,f+120)});}
}
function validInput(i:any):i is Input{return Array.isArray(i)&&i.length===3&&i.every(Number.isInteger)&&i[0]>=0&&i[0]<=255&&i[1]>=0&&i[1]<=127&&Math.abs(i[2])<=1;}
