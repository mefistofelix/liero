import {loadEngine,LocalGame,type EngineModule} from './engine.ts';
import {readPreferences,savePreferences,weaponPool,permittedLoadout,type Rules} from './preferences.ts';
import {MapLibrary} from './maps-ui.ts';
import {WeaponLibrary} from './weapons-ui.ts';
import {RoomClient,api,probeRoom,type Room} from './rooms.ts';
import {NetworkRound} from './netgame.ts';
import {validateLevel,levelBytes,type Level} from './maps.ts';
import {GameRecorder,listRecordings,deleteRecording,type Recording} from './recordings.ts';
import {roomWeapons} from './room-weapons.ts';
import {controlsUI} from './controls-ui.ts';
import {ArenaUI} from './arena-ui.ts';
import {countryFlag} from './flags.ts';
import {compareRooms,includeRoom,type RoomSort} from './room-list.ts';
import {el,input,select,button,notice,report,click,form,onMenu,openMenu,closeMenus,menuHandler} from './ui.ts';

const prefs=readPreferences(),canvas=el<HTMLCanvasElement>('game'),room=new RoomClient(),recorder=new GameRecorder();
const modeNames=['Kill ’em all','Game of tag','Holdazone','Scales of justice'];
let module:EngineModule,game:LocalGame,maps:MapLibrary,weapons:WeaponLibrary,playing=false,localTwo=false,follow=0;
let stats=new Int32Array(20),activeLoadouts=prefs.loadouts.map(a=>[...a]),playerNames=[prefs.name,'Bot'];
let round:NetworkRound|undefined,setup:any,staging:any,peerLoadouts=new Map<string,number[]>(),peerPings:Record<string,number>={};
let nextMapId:string|undefined;
let templeData:Uint8Array;
let mapData:Uint8Array|null=null,roundTimeout=0,busy=false,roomListVersion=0,quickMatching=false;
const save=()=>{try{savePreferences(prefs);}catch{notice('Browser storage is unavailable. Preferences could not be saved.');}};
const arena=new ArenaUI({room,game:()=>game,engine:()=>module,weapons:()=>weapons,names:()=>playerNames,playing:()=>playing,seat:()=>room.id?room.seat:playing?0:-1,sound:()=>prefs.sound,setSound:enabled=>{prefs.sound=enabled;save();game?.setSound(enabled);},join:async()=>{if(!room.id){await autoConnect();return;}await room.call('seat','POST',{play:true});closeMenus();notice('Player slot reserved. You can play while waiting for others.');},spectate:async()=>{if(room.id){await room.call('seat','POST',{play:false});if(round){round.ended=true;game.stop();playing=false;}}else{game.stop();playing=false;game.preview();}el('hud').hidden=true;},copy:()=>copyInvite()});
const saveWeapons=()=>{save();if(room.id&&!room.host)room.send(room.room!.owner,{type:'loadout',loadout:prefs.loadouts[0]});};
controlsUI(prefs,save,()=>game?.setControls(prefs.controls));
const guard=async(fn:()=>Promise<void>)=>{if(busy)return;busy=true;try{await fn();}finally{busy=false;}};
input('player-name').value=prefs.name;input('player-color').value=prefs.color;input('room-name').value=prefs.roomName;input('private-room').checked=prefs.privateRoom;input('keyboard-only').checked=prefs.keyboardOnly;
select('game-mode').value=String(prefs.rules.mode);input('rule-lives').value=String(prefs.rules.lives);input('rule-loading').value=String(prefs.rules.loading);input('rule-bonuses').value=String(prefs.rules.bonuses);
menuHandler(open=>{if(!open&&playing)canvas.focus();});
function applyRules(rules:Rules,loadouts:number[][],colors:string[],data:Uint8Array|null){
 const pool=weaponPool(rules.allowedWeapons);loadouts=loadouts.map(list=>permittedLoadout(list,pool));for(let id=1;id<=40;id++)module._liero_allowed(id,pool.includes(id)?1:0);
 if(data)module.FS.writeFile('/import.lev',validateLevel(data));
 module._liero_options(rules.mode,rules.lives,rules.loading,rules.bonuses,data?1:0);
 for(let p=0;p<2;p++){for(let s=0;s<5;s++)module._liero_loadout(p,s,loadouts[p][s]);const color=/^#[0-9a-f]{6}$/i.test(colors[p])?colors[p]:'#6868fc';module._liero_color(p,parseInt(color.slice(1,3),16)>>2,parseInt(color.slice(3,5),16)>>2,parseInt(color.slice(5,7),16)>>2);}
 activeLoadouts=loadouts.map(a=>[...a]);
}
function showGame(){arena.reset();playing=true;el('overlay').hidden=true;el('hud').hidden=localTwo||!!round?.spectator;el('spectator-tools').hidden=!round?.spectator;el<HTMLButtonElement>('record-start').disabled=!recorder.supported();if(!round||el<HTMLDialogElement>('rooms-menu').open)closeMenus();}
function endGame(){playing=false;arena.reset();el('hud').hidden=true;el('spectator-tools').hidden=true;if(room.id){notice('Round complete. Waiting for the next round.');el('round-status').textContent='Round complete. The next round uses the next map in the rotation.';}else{el('overlay').hidden=false;el('welcome-status').textContent='Round complete. Play again on the next map.';}}
async function startLocal(two=false){await guard(async()=>{if(!module)return;if(room.id)await leaveRoom();clearTimeout(roundTimeout);roundTimeout=0;round=undefined;setup=undefined;const next=await maps.next();mapData=next.data;localTwo=two;follow=0;playerNames=[prefs.name,two?'Player 2':'Bot'];applyRules(prefs.rules,prefs.loadouts,[prefs.color,'#3cac3c'],mapData);el('map-name').textContent=next.level.name;game.start(two,prefs.keyboardOnly);showGame();});}
click('quick-bot',()=>startLocal());click('play-bot',()=>startLocal());click('play-local',()=>startLocal(true));
input('keyboard-only').onchange=()=>{prefs.keyboardOnly=input('keyboard-only').checked;save();};
input('room-name').onchange=()=>{prefs.roomName=input('room-name').value.trim()||'My room';save();};
input('private-room').onchange=()=>{prefs.privateRoom=input('private-room').checked;save();};
form('profile-form',()=>{prefs.name=input('player-name').value.trim();prefs.color=input('player-color').value;if(!prefs.name)throw new Error('Enter a player name.');save();notice('Profile saved for your next room or local game.');});
form('settings-form',async()=>{prefs.rules={...prefs.rules,mode:Number(select('game-mode').value),lives:Number(input('rule-lives').value),loading:Number(input('rule-loading').value),bonuses:Number(input('rule-bonuses').value)};save();game?.setSound(prefs.sound);if(room.id){if(!room.host)throw new Error('Only the host can change room rules.');await saveRoomSettings();}notice('Settings saved. Round rules apply at the next start.');});
click('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();openMenu('rooms-menu');}if(e.code==='Tab'&&document.activeElement===canvas){e.preventDefault();openMenu('leaderboard-menu');}});

let roomSort:RoomSort={key:'count',ascending:false},renderRoomList=()=>{};
for(const key of ['name','count','ping','mode'] as const)click('sort-rooms-'+key,()=>{roomSort={key,ascending:roomSort.key===key?!roomSort.ascending:key!=='count'};renderRoomList();});
for(const id of ['rooms-empty','rooms-full'])input(id).onchange=()=>renderRoomList();
async function refreshRooms(){
 el('room-browser').hidden=false;el('room-lobby').hidden=true;el('rooms-heading').textContent='Room explorer';const version=++roomListVersion;el('room-list-status').textContent='Measuring room ping…';
 const {rooms}=await api('/rooms');if(version!==roomListVersion)return;const list=el('room-list');list.replaceChildren();
 const entries:{room:Room;row:HTMLTableRowElement;ping:HTMLElement;ms:number}[]=[];
 const sort=()=>{entries.sort((a,b)=>compareRooms(a,b,roomSort));list.replaceChildren();let shown=0;for(const entry of entries)if(includeRoom(entry.room,input('rooms-empty').checked,input('rooms-full').checked)){list.append(entry.row);shown++;}for(const key of ['name','count','ping','mode'])el('sort-rooms-'+key).parentElement!.setAttribute('aria-sort',roomSort.key===key?(roomSort.ascending?'ascending':'descending'):'none');el('room-list-status').textContent=rooms.length?shown+' / '+rooms.length+' rooms · all countries':'No public rooms yet. Create a room or find the closest room.';};renderRoomList=sort;
 for(const r of rooms as Room[]){const row=document.createElement('tr');const cell=(text:string)=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};cell(r.name).prepend(countryFlag(r.country));cell(r.count+'/'+r.capacity);const ping=cell('—');ping.title='Direct WebRTC round-trip time to host';const rule=cell(modeNames[r.settings.mode]);const subtitle=document.createElement('small');subtitle.textContent=r.settings.rotation.length+' maps · '+r.phase;rule.append(subtitle);cell('').append(button('Watch / join',()=>joinRoom(r.id,'')));list.append(row);entries.push({room:r,row,ping,ms:Infinity});}
 const jobs=[...entries];sort();let next=0;
 const measure=async(entry:typeof entries[number])=>{try{const ms=entry.room.id===room.id&&room.host?0:await probeRoom(entry.room.id);if(version!==roomListVersion)return;entry.ms=ms;entry.ping.textContent=ms+' ms';sort();}catch{if(version===roomListVersion){entry.ping.title='Host ping unavailable';entry.ping.replaceChildren(button('Retry ping',()=>measure(entry)));}}};
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(version===roomListVersion){const entry=jobs[next++];if(!entry)break;await measure(entry);}}));
 if(version===roomListVersion)sort();
}
function roomTab(tab='explore'){for(const name of ['explore','create','local']){el(name+'-panel').hidden=name!==tab;el(name+'-tab').setAttribute('aria-selected',String(name===tab));}}
click('explore-tab',()=>roomTab());click('create-tab',()=>roomTab('create'));click('local-tab',()=>roomTab('local'));
onMenu('rooms-menu',()=>{roomTab();return refreshRooms();});click('refresh-rooms',refreshRooms);
async function createRoom(auto=false){await guard(async()=>{if(room.id)await leaveRoom();if(!prefs.rotation.length)throw new Error('Enable at least one map.');prefs.roomName=input('room-name').value.trim()||'My room';prefs.privateRoom=input('private-room').checked;save();game?.stop();playing=false;round=undefined;setup=undefined;quickMatching=auto;await room.create({...prefs,privateRoom:auto?false:prefs.privateRoom},false);el('overlay').hidden=true;closeMenus();waitingPreview();});}
async function joinRoom(id:string,invite:string,automatic=false){await guard(async()=>{if(!module)throw new Error('Wait for the game to finish loading.');if(room.id)await leaveRoom();game.stop();playing=false;round=undefined;setup=undefined;await room.join(id,invite,prefs);el('overlay').hidden=true;closeMenus();waitingPreview();});}
click('create-room',()=>createRoom());click('quick-match',()=>autoConnect());
function waitingPreview(){if(!module||!templeData||playing)return;module.FS.writeFile('/import.lev',templeData);module._liero_options(0,15,100,0,1);game.preview();el('map-name').textContent='TEMPLE.LEV';el('hud').hidden=true;arena.nextCamera(true);}
async function autoConnect(){
 el('welcome-status').textContent='Finding the closest public room…';el('connection').textContent='Finding the closest public room…';
 const {rooms}=await api('/rooms'),candidates:Room[]=rooms.filter((r:Room)=>r.count<r.capacity&&r.id!==room.id),measured:{room:Room;ping:number}[]=[];let next=0;
 await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{for(;;){const r=candidates[next++];if(!r)break;try{measured.push({room:r,ping:await probeRoom(r.id)});}catch{}}}));
 measured.sort((a,b)=>a.ping-b.ping);for(const candidate of measured){try{await joinRoom(candidate.room.id,'',true);return;}catch{}}
 await createRoom(true);
}
onMenu('room-settings-menu',()=>{const r=room.room,editable=!r||room.host,rules=r?.settings||prefs.rules;select('game-mode').value=String(rules.mode);input('rule-lives').value=String(rules.lives);input('rule-loading').value=String(rules.loading);input('rule-bonuses').value=String(rules.bonuses);el('settings-form').querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select').forEach(control=>control.disabled=!editable);el('room-settings-access').textContent=r?r.name+' · '+(editable?'You can edit this room.':'View only · only the host can change room rules.'):'Defaults for your next room or local game.';});
async function leaveRoom(){nextMapId=undefined;maps?.setRoom(undefined);weapons?.setAvailability(weaponPool(prefs.rules.allowedWeapons));clearTimeout(roundTimeout);roundTimeout=0;recorder.stop();game?.stop();playing=false;round=undefined;setup=undefined;staging=undefined;quickMatching=false;peerLoadouts.clear();peerPings={};await room.leave();history.replaceState(null,'',location.pathname);el('room-browser').hidden=false;el('room-lobby').hidden=true;el('rooms-heading').textContent='Room explorer';el('connection').textContent='Local';el('overlay').hidden=false;el('hud').hidden=true;el('spectator-tools').hidden=true;}
click('leave-room',leaveRoom);
const inviteURL=()=>location.origin+'/#room='+room.id+(room.room?.private?'&invite='+room.invite:'');
async function copyInvite(){if(!room.id){notice('Join a room first.');return;}const url=inviteURL();input('invite-link').value=url;input('invite-link').hidden=false;try{await navigator.clipboard.writeText(url);notice('Invite link copied.');}catch{input('invite-link').select();openMenu('rooms-menu');el('room-browser').prepend(input('invite-link'));notice('Select and copy this invite link.');}}
click('copy-invite',copyInvite);
form('chat-form',async()=>{const message=input('chat-message').value.trim();if(!message)return;await room.call('chat','POST',{message});input('chat-message').value='';});
click('take-seat',async()=>{await room.call('seat','POST',{play:room.seat<0});closeMenus();notice('Your player slot has been updated for the next round.');});
async function saveRoomSettings(){if(room.host)await room.call('settings','PUT',{name:prefs.roomName,private:prefs.privateRoom,settings:{...prefs.rules,rotation:prefs.rotation}});}
function pingFor(id:string){if(id===room.room?.owner)return 0;return room.host?room.pings.get(id):peerPings[id];}
function renderRoom(r:Room){
 if(!r)return;maps?.setRoom(room.host?undefined:r.settings.rotation);weapons?.setAvailability(weaponPool(r.settings.allowedWeapons));arena.room(r,pingFor);el('room-description').replaceChildren(countryFlag(r.country),document.createTextNode(' '+(r.private?'Private':'Public')+' · '+r.count+'/'+r.capacity));
 const members=el('members');members.replaceChildren();for(const m of r.members){const row=document.createElement('div');row.className='member';const dot=document.createElement('span');dot.className='worm-dot';dot.style.background=m.color;const name=document.createElement('span');name.className='member-name';name.textContent=m.name+(m.id===r.self?' (you)':'');const role=document.createElement('span');role.className='role';role.textContent=m.seat>=0?'Player '+(m.seat+1)+(m.id===r.owner?' / host':''):'Spectator'+(m.id===r.owner?' / host':'');const ping=document.createElement('span');ping.className='ping';const ms=pingFor(m.id);ping.textContent=ms===undefined?'—':ms+' ms';row.append(countryFlag(m.country),dot,name,role,ping);members.append(row);}
 const log=el('chat-history'),last=log.dataset.last||'';const next=String(r.chat.at(-1)?.seq||'');if(last!==next){const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<35;log.replaceChildren();for(const msg of r.chat){const p=document.createElement('p'),name=document.createElement('strong');name.textContent=msg.name;p.append(name,document.createTextNode(msg.message));log.append(p);}log.dataset.last=next;if(bottom)log.scrollTop=log.scrollHeight;}
 el<HTMLButtonElement>('start-round').hidden=!room.host;const players=r.members.filter(m=>m.seat>=0),ready=players.length>0&&players.every(m=>m.id===r.self||peerLoadouts.has(m.id));el<HTMLButtonElement>('start-round').disabled=!ready||!!round&&!round.ended;
 el<HTMLButtonElement>('take-seat').hidden=false;el<HTMLButtonElement>('take-seat').disabled=room.seat<0&&players.length>=2;el('take-seat').textContent=room.seat<0?'Join game':'Switch to spectator';
 el('round-status').textContent=r.phase==='playing'?'Round in progress. Spectators can follow either player or use free camera.':ready?'Starting the game…':'Press Play to start, even on your own.';
 el('room-rules').textContent=modeNames[r.settings.mode]+'\nLives: '+r.settings.lives+'\nLoading: '+r.settings.loading+'%\nBonuses: '+r.settings.bonuses+'\nRotation: '+r.settings.rotation.length+' maps';
 const ping=room.host?0:room.pings.get(r.owner);el('connection').replaceChildren(countryFlag(r.country),document.createTextNode(' '+r.name+' · '+(ping===undefined?'Connecting…':ping+' ms')+(r.phase==='lobby'?' · Waiting for players':'')));
 if(room.host){const pings=Object.fromEntries([...room.pings]);room.broadcast({type:'pings',pings});}
 if(room.host&&!busy){
  const changed=setup?.playerIds&&[0,1].some(p=>(players.find(m=>m.seat===p)?.id??null)!==setup.playerIds[p]);
  if(ready&&((changed)||((!round||round.ended)&&!roundTimeout)))startOnline(changed?setup?.map?.id:undefined,!!round).catch(report);
  else if(round&&changed&&!ready){round.ended=true;game.stop();playing=false;room.call('phase','PUT',{phase:'lobby'}).catch(report);room.broadcast({type:'ended',round:round.id});round=undefined;setup=undefined;waitingPreview();}
 }
}
room.onState=renderRoom;room.onError=error=>{el('connection').textContent='Room unavailable';el('round-status').textContent=error.message;};
room.onReady=id=>{if(!room.host)room.send(id,{type:'ready',version:1,loadout:prefs.loadouts[0]});};
room.onLost=id=>{if(round&&!round.ended&&(id===room.room?.owner||(room.room?.members.find(m=>m.id===id)?.seat??-1)>=0)){round.ended=true;game.stop();playing=false;notice('Player connection lost. Return to the room to restart.');if(room.host)room.call('phase','PUT',{phase:'lobby'}).catch(report);}};
function validLoadout(v:any){return Array.isArray(v)&&v.length===5&&v.every(n=>Number.isInteger(n)&&n>=1&&n<=40);}
function sendSetup(id:string){
 if(!setup)return;
 room.send(id,{type:'start-meta',setup});
 if(mapData){let binary='';for(const value of mapData)binary+=String.fromCharCode(value);const encoded=btoa(binary);for(let i=0;i<encoded.length;i+=48000)room.send(id,{type:'map-chunk',round:setup.id,offset:i,data:encoded.slice(i,i+48000)});}
 room.send(id,{type:'start',round:setup.id});round?.history(id);
}
function launchNetwork(value:any,data:Uint8Array|null){
 applyRules(value.rules,value.loadouts,value.colors,data);setup=value;mapData=data;localTwo=false;follow=room.seat===1?1:0;playerNames=value.players;el('map-name').textContent=value.map.name;
 if(round)round.ended=true;
 if(value.preview){round=undefined;playing=false;arena.reset();game.preview(value.seed);el('hud').hidden=true;el('spectator-tools').hidden=true;arena.nextCamera(true);return;}
 round=new NetworkRound(module,room,value.id,room.seat,value.participants??3);round.onError=message=>{game.stop();playing=false;notice(message);openMenu('rooms-menu');};round.onEnd=()=>{if(room.host){room.call('phase','PUT',{phase:'lobby'}).catch(report);roomTimeoutNext();}};
 game.start(false,false,value.seed,round);game.setSound(prefs.sound);select('camera').options[0].textContent='Follow '+playerNames[0];select('camera').options[1].textContent='Follow '+playerNames[1];select('camera').value=String(follow);showGame();if(round.spectator)arena.nextCamera(true);
}
function roomTimeoutNext(){clearTimeout(roundTimeout);roundTimeout=0;roundTimeout=window.setTimeout(()=>{roundTimeout=0;if(room.host&&room.id&&room.room?.members.filter(m=>m.seat>=0).length>0)startOnline().catch(report);},5000);}
async function startOnline(mapId?:string,restart=false){await guard(async()=>{
 if(!room.host||!room.room)throw new Error('Only the host can start a round.');if(round&&!round.ended&&!restart)throw new Error('A round is already running.');
 const players=[0,1].map(p=>room.room!.members.find(m=>m.seat===p));if(!players.some(Boolean)||players.some(m=>m&&m.id!==room.room!.self&&!peerLoadouts.has(m.id)))throw new Error('Wait for the players to connect.');
 await saveRoomSettings();const chosen=mapId??nextMapId,next=chosen?await maps.pick(chosen):await maps.next();nextMapId=undefined;clearTimeout(roundTimeout);roundTimeout=0;const loadouts=players.map(m=>!m||m.id===room.room!.self?[...prefs.loadouts[0]]:[...peerLoadouts.get(m.id)!]);
 const value={version:1,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0],rules:{...prefs.rules},loadouts:loadouts.map(list=>permittedLoadout(list,weaponPool(prefs.rules.allowedWeapons))),colors:players.map(m=>m?.color||'#3cac3c'),players:players.map(m=>m?.name||''),playerIds:players.map(m=>m?.id??null),participants:players.reduce((mask,m,p)=>mask|(m?1<<p:0),0),map:{id:next.level.id,name:next.level.name,bytes:next.data?.length||0}};
 await room.call('phase','PUT',{phase:'playing'});launchNetwork(value,next.data);for(const m of room.room.members)if(m.id!==room.room.self)sendSetup(m.id);
});}
async function switchRoomMap(level:Level){
 if(!room.host||!room.room)throw new Error('Only the host can change the map.');
 const players=room.room.members.filter(m=>m.seat>=0);
 if(players.length>0&&players.every(m=>m.id===room.room!.self||peerLoadouts.has(m.id))){await startOnline(level.id,true);closeMenus();notice('Started '+level.name+' for everyone.');return;}
 await guard(async()=>{const data=await levelBytes(level);await saveRoomSettings();clearTimeout(roundTimeout);roundTimeout=0;await room.call('phase','PUT',{phase:'lobby'});nextMapId=level.id;
 const value={version:1,preview:true,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0],rules:{...prefs.rules},loadouts:prefs.loadouts.map(a=>[...a]),colors:[prefs.color,'#3cac3c'],players:[prefs.name,'Player 2'],map:{name:level.name,bytes:data?.length||0}};
 launchNetwork(value,data);for(const member of room.room!.members)if(member.id!==room.room!.self)sendSetup(member.id);notice('Changed to '+level.name+'. Press Play to start.');});
}
click('start-round',async()=>{await startOnline();closeMenus();});
room.onPacket=(from,packet)=>{
 try{
  if(packet.type==='loadout'&&room.host&&validLoadout(packet.loadout)&&room.room?.members.some(m=>m.id===from)){peerLoadouts.set(from,packet.loadout);return;}
  if(packet.type==='ready'&&room.host){if(packet.version!==1||!validLoadout(packet.loadout))return;peerLoadouts.set(from,packet.loadout);if(setup&&(!round||!round.ended))sendSetup(from);return;}
  if(packet.type==='pings'&&!room.host&&from===room.room?.owner){peerPings=packet.pings||{};return;}
  if(packet.type==='ended'&&from===room.room?.owner&&packet.round===round?.id){round!.ended=true;game.stop();endGame();return;}
  if(from===room.room?.owner&&!room.host){
   if(packet.type==='start-meta'){const v=packet.setup;if(v?.version!==1||![1,2,3].includes(v.participants??3)||typeof v.id!=='string'||!Number.isInteger(v.seed)||!Array.isArray(v.loadouts)||!v.loadouts.every(validLoadout)||v.loadouts.length!==2||!Array.isArray(v.players)||v.players.length!==2||!Array.isArray(v.colors)||v.colors.length!==2||![0,1,2,3].includes(v.rules?.mode)||!Number.isInteger(v.map?.bytes)||v.map.bytes<0||v.map.bytes>1048576)throw new Error('Invalid round setup.');staging={value:v,chunks:[],size:0};return;}
   if(packet.type==='map-chunk'&&staging?.value.id===packet.round){if(packet.offset!==staging.size||typeof packet.data!=='string'||packet.data.length>48000||staging.size+packet.data.length>1398104)throw new Error('Invalid map transfer.');staging.chunks.push(packet.data);staging.size+=packet.data.length;return;}
   if(packet.type==='start'&&staging?.value.id===packet.round){const bytes=staging.value.map.bytes?Uint8Array.from(atob(staging.chunks.join('')),c=>c.charCodeAt(0)):null;if((bytes?.length||0)!==staging.value.map.bytes)throw new Error('Incomplete map transfer.');launchNetwork(staging.value,bytes);staging=undefined;return;}
  }
  round?.receive(from,packet);
 }catch(error){report(error);}
};
select('camera').onchange=()=>{const v=select('camera').value;follow=v==='free'?follow:Number(v);game.setCamera(v==='free'?'free':Number(v));};
function renderStats(state:Int32Array){
 stats=state.slice();arena.frame(state);const player=round?.spectator?follow:round?.seat===1?1:0,index=2+player*5;
 el('health').textContent=Math.max(0,state[index])+' HP';el('lives').textContent=state[index+1]+' lives';
 const weapon=weapons.get(module._liero_weapon_id(state[14])||1);el('weapon-name').textContent=weapon.name;el<HTMLImageElement>('weapon-icon').src=weapon.icon;el('ammo').textContent=state[13]>0?'Reloading':state[12]+' ammo';
 if(el<HTMLDialogElement>('leaderboard-menu').open)renderScores();
}
function renderScores(){const scores=el('scores');scores.replaceChildren();for(let p=0;p<2;p++){const row=document.createElement('tr'),member=room.room?.members.find(m=>m.seat===p),ping=member?pingFor(member.id):undefined;if(room.id&&!member)continue;for(const value of [playerNames[p],stats[16+p],stats[44+p]||0,stats[3+p*5],Math.max(0,stats[2+p*5]),ping===undefined?'—':ping+' ms']){const td=document.createElement('td');td.textContent=String(value);row.append(td);}scores.append(row);}}
onMenu('leaderboard-menu',renderScores);

const archiveURLs:string[]=[];
async function renderArchive(extra?:Recording){
 archiveURLs.splice(0).forEach(url=>URL.revokeObjectURL(url));const list=el('recordings-list');list.replaceChildren();const recordings=await listRecordings();if(extra&&!recordings.some(r=>r.id===extra.id))recordings.push(extra);recordings.sort((a,b)=>b.date-a.date);
 for(const r of recordings){const row=document.createElement('article');row.className='recording';const video=document.createElement('video'),url=URL.createObjectURL(r.blob);archiveURLs.push(url);video.src=url;video.controls=true;video.preload='metadata';const info=document.createElement('div'),title=document.createElement('h3');title.textContent=r.name;const detail=document.createElement('p');detail.className='small';detail.textContent=new Date(r.date).toLocaleString('en-GB')+' · '+Math.round(r.duration/1000)+' s · '+(r.blob.size/1024/1024).toFixed(1)+' MB';const actions=document.createElement('div');actions.className='actions';const download=document.createElement('a');download.href=url;download.download='liero-'+new Date(r.date).toISOString().replace(/[:.]/g,'-')+'.mp4';download.textContent='Download MP4';actions.append(download,button('Delete',async()=>{await deleteRecording(r.id);await renderArchive();},'danger'));info.append(title,detail,actions);row.append(video,info);list.append(row);}
 if(!recordings.length)list.textContent='No recordings yet.';
}
onMenu('recordings-menu',()=>{el<HTMLButtonElement>('record-start').disabled=!playing||recorder.active||!recorder.supported();if(!recorder.supported())el('record-status').textContent='MP4 recording is not supported by this browser. Try a browser with MP4 MediaRecorder support.';return renderArchive();});
click('record-start',()=>{if(!playing)throw new Error('Start or watch a game first.');recorder.start(canvas,module.audioStream,room.room?.name||'Local game');el('recording-indicator').hidden=false;el<HTMLButtonElement>('record-start').disabled=true;el<HTMLButtonElement>('record-stop').disabled=false;closeMenus();});
click('record-stop',()=>recorder.stop());recorder.onError=error=>{el('recording-indicator').hidden=true;el<HTMLButtonElement>('record-start').disabled=!playing;el<HTMLButtonElement>('record-stop').disabled=true;report(error);};recorder.onSaved=(recording,persisted)=>{el('recording-indicator').hidden=true;el<HTMLButtonElement>('record-start').disabled=!playing;el<HTMLButtonElement>('record-stop').disabled=true;notice(persisted?'Recording saved to the local archive.':'Archive storage is full. Download this recording before closing the page.');renderArchive(recording).catch(report);};
let installPrompt:any;window.addEventListener('beforeinstallprompt',(event:any)=>{event.preventDefault();installPrompt=event;el('install-app').hidden=false;});click('install-app',async()=>{await installPrompt?.prompt();installPrompt=undefined;el('install-app').hidden=true;});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(console.error);
window.addEventListener('pagehide',()=>{recorder.stop();game?.dispose();});
window.addEventListener('beforeunload',event=>{if(recorder.active){event.preventDefault();event.returnValue='';}});
loadEngine().then(async engine=>{
 module=engine;weapons=new WeaponLibrary(module,prefs,saveWeapons);const ptr=module._liero_palette();roomWeapons(room,prefs,weapons,save,saveRoomSettings);maps=new MapLibrary(prefs,()=>{save();if(room.host)saveRoomSettings().catch(report);},module.HEAPU8.slice(ptr,ptr+1024),{canSwitch:()=>room.host,switchMap:switchRoomMap});await maps.init();templeData=(await maps.pick('temple')).data!;game=new LocalGame(module,canvas,endGame,renderStats);game.setControls(prefs.controls);game.setSound(prefs.sound);
 document.querySelectorAll<HTMLButtonElement>('.requires-engine').forEach(b=>b.disabled=false);el('welcome-status').textContent='Aim, dig and swing. The whole arena is yours.';
 waitingPreview();el('overlay').hidden=true;el('connection').textContent='Choose a room or start a local game';
 const params=new URLSearchParams(location.hash.slice(1)),id=params.get('room');try{if(id)await joinRoom(id,params.get('invite')||'');else openMenu('rooms-menu');}catch(error){openMenu('rooms-menu');notice(error instanceof Error?error.message:String(error));}
}).catch(error=>{el('welcome-status').textContent='The game could not load. Reload to try again.';report(error);});
