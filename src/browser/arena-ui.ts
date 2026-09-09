import {orderPlayers,playerStatus} from './player-list.ts';
import {chatText} from './chat-text.ts';
import {el,input,setDisabled,click,form,notice,closeMenus,openMenu,onMenu} from './ui.ts';
import type {RoomClient,Room} from './rooms.ts';
import type {EngineModule,LocalGame} from './engine.ts';
import type {WeaponLibrary} from './weapons-ui.ts';
import {countryFlag} from './flags.ts';
type Context={room:RoomClient;game:()=>LocalGame;engine:()=>EngineModule;weapons:()=>WeaponLibrary;names:()=>string[];playing:()=>boolean;stopping:()=>boolean;color:()=>string;color2:()=>string;seat:()=>number;sound:()=>boolean;setSound:(v:boolean)=>void;join:()=>Promise<void>;spectate:()=>Promise<void>;copy:()=>Promise<void>};
export class ArenaUI{
 private lastWeapon=[-1,-1];private weaponUntil=[0,0];private shown=true;private camera:number|'free'='free';private chatSeq=0;private roomId='';private state=new Int32Array(52);private lastPanel=0;private deathSeq=[0,0];private cycle=-1;private chatSeen=new Set<string>();private memberIds=new Set<string>();private pendingChat:{text:string;line:HTMLElement}[]=[];private chatAudio?:AudioContext;
 constructor(private c:Context){
  for(let p=0;p<2;p++){const label=el('worm-label-'+p),name=document.createElement('span');name.id='worm-name-'+p;name.className='worm-name';const weapon=document.createElement('span');weapon.id='worm-weapon-'+p;weapon.className='own-weapon';weapon.hidden=true;label.append(weapon,name);for(const kind of ['health','reload']){const bar=document.createElement('span'),fill=document.createElement('i');bar.className='worm-bar worm-'+kind;fill.id='worm-'+kind+'-'+p;bar.append(fill);label.append(bar);}}
  click('players-toggle',()=>{this.shown=!this.shown;el('player-panel').hidden=!this.shown;el('players-toggle').setAttribute('aria-expanded',String(this.shown));});
  click('sound-toggle',()=>{c.setSound(!c.sound());this.audio();});this.audio();
  click('toolbar-invite',c.copy);click('join-play',c.join);
  click('chat-toggle',()=>this.chat());form('chat-compose',async()=>{const text=input('chat-text').value.trim();if(!text)return;input('chat-text').value='';this.chat(false);await this.sendChat(text);});
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>this.unlockChatAudio());
  input('chat-text').addEventListener('keydown',e=>{if(e.code==='Escape'){e.stopPropagation();this.chat(false);}});
  window.addEventListener('keydown',e=>{const target=e.target as HTMLElement;if(e.code==='Enter'&&c.room.id&&!target.closest('input,select,textarea,dialog,button,a')&&!document.querySelector('dialog[open]')){e.preventDefault();this.chat(true);}});
  click('spectate',()=>{if(c.seat()>=0&&c.playing()){openMenu('spectate-confirm');return;}if(c.seat()>=0){c.spectate().catch(e=>notice(e.message));return;}this.nextCamera();});
  click('confirm-spectate',async()=>{await c.spectate();closeMenus();this.nextCamera(true);});
  onMenu('profile-menu',()=>this.audio());
 }
 audio(){el('sound-toggle').setAttribute('aria-pressed',String(!this.c.sound()));el('sound-toggle').setAttribute('aria-label',this.c.sound()?'Mute sound':'Enable sound');el('sound-toggle').title=this.c.sound()?'Mute sound':'Enable sound';}
 private chat(open=el('chat-compose').hidden){if(open&&!this.c.room.id){notice('Join a room to chat.');return;}el('chat-compose').hidden=!open;el('left-overlay').classList.toggle('chat-open',open);if(open){closeMenus();input('chat-text').focus();}else el('game').focus();}
 nextCamera(free=false){const seats=this.c.room.room?.members.filter(m=>m.seat>=0).map(m=>m.seat).sort()||[];const choices:(number|'free')[]=[...seats,'free'];this.camera=free?'free':choices[(choices.indexOf(this.camera)+1)%choices.length];this.c.game()?.setCamera(this.camera);el('spectate-label').textContent=this.camera==='free'?'Free camera':this.c.names()[this.camera]||'Spectate';}
 reset(){this.lastWeapon=[-1,-1];this.weaponUntil=[0,0];this.deathSeq=[0,0];this.cycle=-1;for(const p of [0,1])el('worm-label-'+p).hidden=true;}
 room(r:Room,ping:(id:string)=>number|undefined){
  const newRoom=this.roomId!==r.id;if(newRoom){this.roomId=r.id;this.chatSeq=0;this.chatSeen.clear();this.pendingChat=[];el('chat-feed').replaceChildren();el('kill-feed').replaceChildren();this.reset();this.camera='free';}
  if(!newRoom&&r.id!=='local'&&r.members.some(member=>!this.memberIds.has(member.id)))this.beep();
  this.memberIds=new Set(r.members.map(member=>member.id));
  for(const msg of r.chat)this.receiveChat(msg,!newRoom);
  const list=el('overlay-players');list.replaceChildren();const members=orderPlayers(r.members,seat=>this.c.playing()?this.state[16+seat]||0:0);
  for(const m of members){
   const row=document.createElement('tr'),cell=document.createElement('td'),identity=document.createElement('div');identity.className='player-identity';
   const dot=document.createElement('span');dot.className='worm-dot';dot.style.background=m.color;
   const name=document.createElement('span');name.className='member-name';name.textContent=m.name+(m.id===r.self?' (you)':'');if(m.id===r.owner)name.title='Room host';
   identity.append(countryFlag(m.country),dot,name);cell.append(identity);row.append(cell,playerStatus(m.seat>=0));
   const ms=ping(m.id),active=m.seat>=0&&this.c.playing();
   for(const value of [active?this.state[16+m.seat]:'—',active?this.state[44+m.seat]||0:'—',ms===undefined?'—':ms+' ms']){const td=document.createElement('td');td.textContent=String(value);row.append(td);}list.append(row);
  }
  el('player-count').textContent=String(r.members.length);el('players-toggle').title=`${r.members.filter(m=>m.seat>=0).length} playing · ${r.members.filter(m=>m.seat<0).length} spectating`;
  this.playButton();el('spectate-label').textContent=this.c.seat()>=0?'Spectate':this.camera==='free'?'Free camera':this.c.names()[this.camera]||'Spectate';
 }
 private unlockChatAudio(){if(!this.c.sound())return;try{this.chatAudio??=new AudioContext();if(this.chatAudio.state==='suspended')void this.chatAudio.resume();}catch{}}
 private beep(){if(!this.c.sound())return;this.unlockChatAudio();const ctx=this.chatAudio;if(!ctx||ctx.state!=='running')return;const tone=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;tone.type='square';tone.frequency.setValueAtTime(880,now);gain.gain.setValueAtTime(.035,now);gain.gain.exponentialRampToValueAtTime(.001,now+.065);tone.connect(gain);gain.connect(ctx.destination);tone.start(now);tone.stop(now+.07);tone.onended=()=>{tone.disconnect();gain.disconnect();};}
 private chatLine(name:string,text:string){const line=document.createElement('p'),label=document.createElement('strong');label.textContent=name;line.append(label,chatText(text));el('chat-feed').append(line);this.trimChat();return line;}
 private trimChat(){const feed=el('chat-feed'),messages=[...feed.children].filter(line=>!line.classList.contains('chat-exit'));for(const line of messages.slice(0,Math.max(0,messages.length-8))){line.classList.add('chat-exit');setTimeout(()=>line.remove(),500);}feed.scrollTop=feed.scrollHeight;}
 receiveChat(msg:Room['chat'][number],sound=true){
  if(!msg||!Number.isSafeInteger(msg.seq)||msg.seq<1||typeof msg.player!=='string'||typeof msg.name!=='string'||typeof msg.message!=='string'||msg.message.length>500)return;
  const key=msg.player+':'+msg.seq;if(this.chatSeen.has(key))return;this.chatSeen.add(key);if(this.chatSeen.size>1000)this.chatSeen.delete(this.chatSeen.values().next().value!);
  const pending=msg.player===this.c.room.room?.self?this.pendingChat.findIndex(p=>p.text===msg.message):-1;
  if(pending>=0){this.pendingChat.splice(pending,1)[0].line.classList.remove('chat-pending');return;}
  this.chatLine(msg.name,msg.message);if(sound)this.beep();
 }
 async sendChat(text:string){
  const room=this.c.room,current=room.room;if(!current)return;const name=current.members.find(m=>m.id===current.self)?.name||'Player';
  const line=this.chatLine(name,text),pending={text,line};line.classList.add('chat-pending');this.pendingChat.push(pending);this.beep();
  try{const response=await room.call('chat','POST',{message:text});this.receiveChat(response.message);if(room.host)room.broadcast({type:'chat-delivery',message:response.message});else room.send(current.owner,{type:'chat-posted',message:response.message});}
  catch(error){this.pendingChat=this.pendingChat.filter(p=>p!==pending);line.classList.remove('chat-pending');line.classList.add('chat-failed');line.append(document.createTextNode(' (not sent)'));throw error;}
 }
 playButton(){
  const active=this.c.playing()&&this.c.seat()>=0,b=el<HTMLButtonElement>('join-play');
  setDisabled(b,this.c.stopping()||(!active&&this.c.room.seat<0&&(this.c.room.room?.members.filter(m=>m.seat>=0).length||0)>=2));
  const label=active?'Stop playing':'Join game';b.title=active?'Stop playing (suicide)':label;b.setAttribute('aria-label',label);
  b.querySelector('path')!.setAttribute('d',active?'M6 6h12v12H6Z':'m8 4 12 8-12 8Z');
 }
 frame(state:Int32Array){
  this.state=state.slice();if(state[0]<this.cycle)this.reset();this.cycle=state[0];const c=this.c,seat=c.seat(),now=performance.now();
  if(!c.room.id&&c.playing()&&now-this.lastPanel>500){this.lastPanel=now;this.room({id:'local',self:'local0',owner:'local0',phase:'playing',members:c.names().map((name,p)=>({id:'local'+p,name,color:p?c.color2():c.color(),seat:p})),chat:[]} as Room,()=>0);}
  const canvas=el<HTMLCanvasElement>('game'),rect=canvas.getBoundingClientRect(),stage=el('stage').getBoundingClientRect();
  for(let p=0;p<2;p++){
   const label=el('worm-label-'+p),base=24+p*4,x=state[base],y=state[base+1];const own=p===seat;
   label.hidden=!c.playing()||!state[base+2]||x<0||x>canvas.width||y<0||y>canvas.height;
   el('worm-name-'+p).textContent=c.names()[p];
   const selected=state[base+3],weaponLabel=el('worm-weapon-'+p);
   if(selected!==this.lastWeapon[p]){if(own&&this.lastWeapon[p]>=0&&state[base+2])this.weaponUntil[p]=now+1500;this.lastWeapon[p]=selected;}
   weaponLabel.hidden=!own||now>=this.weaponUntil[p];
   if(!weaponLabel.hidden)weaponLabel.textContent=c.weapons()?.get(c.engine()._liero_weapon_id(selected))?.name||'';
   const health=Math.max(0,Math.min(1,state[2+p*5]/Math.max(1,state[46+p*3]))),reload=Math.max(0,Math.min(1,1-state[47+p*3]/Math.max(1,state[48+p*3])));
   el('worm-health-'+p).style.transform=`scaleX(${health})`;el('worm-reload-'+p).style.transform=`scaleX(${reload})`;
   label.style.left=rect.left-stage.left+x*rect.width/canvas.width+'px';label.style.top=rect.top-stage.top+(y-9)*rect.height/canvas.height+'px';
   const at=32+p*4,seq=state[at];if(seq>this.deathSeq[p]){this.deathSeq[p]=seq;if(state[0]-state[at+3]>140)continue;const killer=state[at+1],weapon=c.weapons()?.get(c.engine()._liero_weapon_id(state[at+2]));const entry=document.createElement('div');entry.className='kill-entry fade-message';const name=document.createElement('span');name.textContent=c.names()[killer]||'Environment';const gun=document.createElement('span');gun.className='kill-weapon';gun.textContent=weapon?.name||'—';const victim=document.createElement('span');victim.textContent=c.names()[p];if(killer!==p&&killer>=0)entry.append(name);else entry.setAttribute('aria-label',c.names()[p]+' committed suicide');if(weapon){const icon=document.createElement('img');icon.src=weapon.icon;icon.alt='';entry.append(icon);}entry.append(gun,victim);el('kill-feed').append(entry);setTimeout(()=>entry.remove(),9000);}
  }
 }
}
