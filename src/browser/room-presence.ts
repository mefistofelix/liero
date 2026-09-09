// A fresh identity per entry isolates late requests from a subsequent visit.
// A browser lock distinguishes a live separate tab from an abandoned page.
type PresenceLease={isActive:(identity:string)=>Promise<boolean>;hold:(identity:string)=>Promise<()=>void>};
export function browserPresenceLease():PresenceLease|undefined{
 if(typeof navigator==='undefined'||!navigator.locks)return;
 const name=async(identity:string)=>'liero-presence-'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity))),v=>v.toString(16).padStart(2,'0')).join('');
 return {
  isActive:async identity=>{const key=await name(identity);return (await navigator.locks.query()).held?.some(lock=>lock.name===key)??false;},
  hold:async identity=>{const key=await name(identity);return new Promise<()=>void>((resolve,reject)=>{void navigator.locks.request(key,()=>new Promise<void>(release=>resolve(release))).catch(reject);});}
 };
}
export class RoomPresence {
 private identity='';private leaving?:Promise<void>;private recovering=false;private release?:()=>void;
 private readonly key='liero-room-presence';
 constructor(private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>|undefined, recover:boolean,private quit:(identity:string)=>Promise<unknown>,private lease?:PresenceLease){
  try{const previous=storage?.getItem(this.key);if((recover||lease)&&previous&&/^[a-f0-9]{64}$/.test(previous)){this.identity=previous;this.recovering=true;}else storage?.removeItem(this.key);}catch{}
 }
 async begin(){await this.leave();this.identity=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');try{this.storage?.setItem(this.key,this.identity);}catch{}this.release=await this.lease?.hold(this.identity);return this.identity;}
 leave():Promise<void>{
  if(this.leaving)return this.leaving;const identity=this.identity;if(!identity)return Promise.resolve();
  this.release?.();this.release=undefined;
  const quit=async()=>{if(this.recovering&&await this.lease?.isActive(identity))return;this.recovering=false;await this.quit(identity);};
  this.leaving=quit().then(()=>{if(this.identity===identity)this.identity='';try{if(this.storage?.getItem(this.key)===identity)this.storage.removeItem(this.key);}catch{}}).finally(()=>{this.leaving=undefined;});
  return this.leaving;
 }
}
