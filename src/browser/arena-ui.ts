import {el,input,click,form,notice,closeMenus,openMenu,onMenu} from './ui.ts';
import type {RoomClient,Room} from './rooms.ts';
import type {EngineModule,LocalGame} from './engine.ts';
import type {WeaponLibrary} from './weapons-ui.ts';
import {countryFlag} from './flags.ts';
type Context={room:RoomClient;game:()=>LocalGame;engine:()=>EngineModule;weapons:()=>WeaponLibrary;names:()=>string[];playing:()=>boolean;seat:()=>number;sound:()=>boolean;setSound:(v:boolean)=>void;join:()=>Promise<void>;spectate:()=>Promise<void>;copy:()=>Promise<void>};
export class ArenaUI{
 private shown=true;private camera:number|'free'='free';private chatSeq=0;private roomId='';private state=new Int32Array(52);private lastPanel=0;private deathSeq=[0,0];private cycle=-1;private weapon=-1;private weaponUntil=0;
 constructor(private c:Context){
  for(let p=0;p<2;p++){const label=el('worm-label-'+p),name=document.createElement('span');name.id='worm-name-'+p;name.className='worm-name';label.append(name);for(const kind of ['health','reload']){const bar=document.createElement('span'),fill=document.createElement('i');bar.className='worm-bar worm-'+kind;fill.id='worm-'+kind+'-'+p;bar.append(fill);label.append(bar);}}
  click('players-toggle',()=>{this.shown=!this.shown;el('player-panel').hidden=!this.shown;el('players-toggle').setAttribute('aria-expanded',String(this.shown));});
  click('sound-toggle',()=>{c.setSound(!c.sound());this.audio();});this.audio();
  click('toolbar-invite',c.copy);click('join-play',c.join);
  click('chat-toggle',()=>this.chat());form('chat-compose',async()=>{const text=input('chat-text').value.trim();if(text){await c.room.call('chat','POST',{message:text});input('chat-text').value='';}this.chat(false);});
  input('chat-text').addEventListener('keydown',e=>{if(e.code==='Escape'){e.stopPropagation();this.chat(false);}});
  window.addEventListener('keydown',e=>{const target=e.target as HTMLElement;if(e.code==='KeyT'&&!target.closest('input,select,textarea,dialog')){e.preventDefault();this.chat(true);}});
  click('spectate',()=>{if(c.seat()>=0&&c.playing()){openMenu('spectate-confirm');return;}if(c.seat()>=0){c.spectate().catch(e=>notice(e.message));return;}this.nextCamera();});
  click('confirm-spectate',async()=>{await c.spectate();closeMenus();this.nextCamera(true);});
  onMenu('profile-menu',()=>this.audio());
 }
 audio(){el('sound-toggle').setAttribute('aria-pressed',String(!this.c.sound()));el('sound-toggle').setAttribute('aria-label',this.c.sound()?'Mute sound':'Enable sound');el('sound-toggle').title=this.c.sound()?'Mute sound':'Enable sound';}
 private chat(open=el('chat-compose').hidden){if(open&&!this.c.room.id){notice('Join a room to chat.');return;}el('chat-compose').hidden=!open;el('left-overlay').classList.toggle('chat-open',open);if(open){closeMenus();input('chat-text').focus();}else el('game').focus();}
 nextCamera(free=false){const seats=this.c.room.room?.members.filter(m=>m.seat>=0).map(m=>m.seat).sort()||[];const choices:(number|'free')[]=[...seats,'free'];this.camera=free?'free':choices[(choices.indexOf(this.camera)+1)%choices.length];this.c.game()?.setCamera(this.camera);el('spectate-label').textContent=this.camera==='free'?'Free camera':this.c.names()[this.camera]||'Spectate';}
 reset(){this.deathSeq=[0,0];this.cycle=-1;this.weapon=-1;this.weaponUntil=0;el('kill-feed').replaceChildren();for(const p of [0,1])el('worm-label-'+p).hidden=true;}
 room(r:Room,ping:(id:string)=>number|undefined){
  if(this.roomId!==r.id){this.roomId=r.id;this.chatSeq=0;el('chat-feed').replaceChildren();this.reset();this.camera='free';}
  for(const msg of r.chat){if(msg.seq<=this.chatSeq)continue;this.chatSeq=msg.seq;const line=document.createElement('p'),name=document.createElement('strong');name.textContent=msg.name;line.append(name,document.createTextNode(msg.message));el('chat-feed').append(line);}
  const feed=el('chat-feed'),messages=[...feed.children].filter(line=>!line.classList.contains('chat-exit'));
  for(const line of messages.slice(0,Math.max(0,messages.length-8))){line.classList.add('chat-exit');const remove=()=>{line.remove();feed.scrollTop=feed.scrollHeight;};line.addEventListener('animationend',remove,{once:true});setTimeout(remove,500);}
  feed.scrollTop=feed.scrollHeight;
  const list=el('overlay-players');list.replaceChildren();const members=[...r.members].sort((a,b)=>(a.seat<0?3:a.seat)-(b.seat<0?3:b.seat));
  for(const m of members){const row=document.createElement('div');row.className='member';const dot=document.createElement('span');dot.className='worm-dot';dot.style.background=m.color;const name=document.createElement('span');name.className='member-name';name.textContent=m.name+(m.id===r.self?' (you)':'');const role=document.createElement('span');role.className='role';role.textContent=m.seat<0?'Spectating':'P'+(m.seat+1);if(m.id===r.owner)role.title='Room host';const data=document.createElement('span');data.className='player-stats';if(m.seat>=0&&this.c.playing())data.textContent=`${this.state[16+m.seat]} Kills · ${this.state[44+m.seat]||0} Deaths`;const ms=ping(m.id),latency=document.createElement('span');latency.className='ping';latency.textContent=ms===undefined?'—':ms+' ms';row.append(countryFlag(m.country),dot,name,role,data,latency);list.append(row);}
  el('player-count').textContent=String(r.members.length);el('players-toggle').title=`${r.members.filter(m=>m.seat>=0).length} playing · ${r.members.filter(m=>m.seat<0).length} spectating`;
  el<HTMLButtonElement>('join-play').disabled=this.c.seat()>=0||r.members.filter(m=>m.seat>=0).length>=2;
  el('join-play').title='Join game';el('spectate-label').textContent=this.c.seat()>=0?'Spectate':this.camera==='free'?'Free camera':this.c.names()[this.camera]||'Spectate';
 }
 frame(state:Int32Array){
  this.state=state.slice();if(state[0]<this.cycle)this.reset();this.cycle=state[0];const c=this.c,seat=c.seat(),now=performance.now();
  if(!c.room.id&&now-this.lastPanel>500){this.lastPanel=now;this.room({id:'local',self:'local0',owner:'local0',phase:'playing',members:c.names().map((name,p)=>({id:'local'+p,name,color:p?'#3cac3c':'#6868fc',seat:p})),chat:[]} as Room,()=>0);}
  if(seat>=0){const type=state[27+seat*4];if(type!==this.weapon){if(this.weapon>=0)this.weaponUntil=now+850;this.weapon=type;}}
  const canvas=el<HTMLCanvasElement>('game'),rect=canvas.getBoundingClientRect(),stage=el('stage').getBoundingClientRect();
  for(let p=0;p<2;p++){
   const label=el('worm-label-'+p),base=24+p*4,x=state[base],y=state[base+1];const own=p===seat;
   label.hidden=!c.playing()||!state[base+2]||x<0||x>canvas.width||y<0||y>canvas.height;
   const name=el('worm-name-'+p),showWeapon=own&&now<this.weaponUntil;
   name.classList.toggle('own-weapon',showWeapon);name.textContent=showWeapon?(c.weapons()?.get(c.engine()._liero_weapon_id(state[base+3]))?.name||''):c.names()[p];
   const health=Math.max(0,Math.min(1,state[2+p*5]/Math.max(1,state[46+p*3]))),reload=Math.max(0,Math.min(1,1-state[47+p*3]/Math.max(1,state[48+p*3])));
   el('worm-health-'+p).style.transform=`scaleX(${health})`;el('worm-reload-'+p).style.transform=`scaleX(${reload})`;
   label.style.left=rect.left-stage.left+x*rect.width/canvas.width+'px';label.style.top=rect.top-stage.top+(y-9)*rect.height/canvas.height+'px';
   const at=32+p*4,seq=state[at];if(seq>this.deathSeq[p]){this.deathSeq[p]=seq;if(state[0]-state[at+3]>140)continue;const killer=state[at+1],weapon=c.weapons()?.get(c.engine()._liero_weapon_id(state[at+2]));const entry=document.createElement('div');entry.className='kill-entry fade-message';const name=document.createElement('span');name.textContent=c.names()[killer]||'Environment';const gun=document.createElement('span');gun.className='kill-weapon';gun.textContent=weapon?.name||'—';const victim=document.createElement('span');victim.textContent=c.names()[p];entry.append(name);if(weapon){const icon=document.createElement('img');icon.src=weapon.icon;icon.alt='';entry.append(icon);}entry.append(gun,victim);el('kill-feed').append(entry);setTimeout(()=>entry.remove(),9000);}
  }
 }
}
