import {playerName} from './player-name.ts';
import {chatText} from './chat-text.ts';
import {loadEngine,LocalGame,type EngineModule} from './engine.ts';
import {readPreferences,savePreferences,weaponPool,type Rules} from './preferences.ts';
import {MapLibrary} from './maps-ui.ts';
import {WeaponLibrary} from './weapons-ui.ts';
import {RoomClient,api,probeRoom,type Room} from './rooms.ts';
import {NetworkRound,NETWORK_VERSION,rulesKey,applyLiveRules,applyLiveLoadout} from './netgame.ts';
import {validateLevel,levelBytes,type Level} from './maps.ts';
import {GameRecorder,listRecordings,deleteRecording,type Recording} from './recordings.ts';
import {roomWeapons} from './room-weapons.ts';
import {controlsUI} from './controls-ui.ts';
import {ArenaUI} from './arena-ui.ts';
import {countryFlag} from './flags.ts';
import {compareRooms,includeRoom,type RoomSort} from './room-list.ts';
import {el,input,select,button,setDisabled,notice,report,click,form,onMenu,onMenuClose,openMenu,closeMenus,menuHandler} from './ui.ts';

const prefs=readPreferences(),canvas=el<HTMLCanvasElement>('game'),room=new RoomClient(),recorder=new GameRecorder();
const modeNames=['Kill ’em all','Game of tag','Holdazone','Scales of justice'];
let module:EngineModule,game:LocalGame,maps:MapLibrary,weapons:WeaponLibrary,playing=false,localTwo=false,follow=0;
let stats=new Int32Array(20),activeLoadouts=prefs.loadouts.map(a=>[...a]),playerNames=[prefs.name,'Bot'];
let round:NetworkRound|undefined,setup:any,staging:any,peerLoadouts=new Map<string,number[]>(),peerPings:Record<string,number>={};
let handoffMap:{level:Level;data:Uint8Array|null;seed:number}|undefined;
let nextMapId:string|undefined;let startingRound:Promise<void>|undefined;
let stopping=false,lastRulesKey='',profilePlayer=0,profileTimer=0;let profileSaving=false,profileDirty=false;
let templeData:Uint8Array;
let mapData:Uint8Array|null=null,roundTimeout=0,busy=false,roomListVersion=0,quickMatching=false;
const save=()=>{try{savePreferences(prefs);}catch{notice('Browser storage is unavailable. Preferences could not be saved.');}};
const arena=new ArenaUI({room,game:()=>game,engine:()=>module,weapons:()=>weapons,names:()=>playerNames,playing:()=>playing,seat:()=>room.id?room.seat:playing?0:-1,sound:()=>prefs.sound,setSound:enabled=>{prefs.sound=enabled;save();game?.setSound(enabled);},stopping:()=>stopping,color:()=>prefs.color,color2:()=>localTwo?prefs.player2.color:'#3cac3c',join:togglePlay,spectate:async()=>{if(playing&&(room.id?room.seat>=0:true))await game.stopPlayer();if(room.id){await room.call('seat','POST',{play:false});await room.refresh();if(round){round.ended=true;game.stop();playing=false;}}else{game.stop();playing=false;game.preview();}el('hud').hidden=true;},copy:()=>copyInvite()});
const saveWeapons=(player:number)=>{save();if(room.id){if(player!==0)return;if(room.host){if(room.seat>=0)round?.queueLoadout(room.seat,prefs.loadouts[0]);}else room.send(room.room!.owner,{type:'loadout',loadout:prefs.loadouts[0]});}else if(playing&&(player===0||localTwo))applyLiveLoadout(module,player,prefs.loadouts[player]);};
controlsUI(prefs,save,()=>game?.setControls(prefs.controls),()=>profilePlayer===1?1:localTwo&&prefs.keyboardOnly?0:'mouse');
const guard=async(fn:()=>Promise<void>)=>{if(busy)return;busy=true;try{await fn();}finally{busy=false;}};
input('player-name').value=prefs.name;input('player-color').value=prefs.color;input('room-name').value=prefs.roomName;input('private-room').checked=prefs.privateRoom;input('keyboard-only').checked=prefs.keyboardOnly;
select('game-mode').value=String(prefs.rules.mode);input('rule-lives').value=String(prefs.rules.lives);input('rule-loading').value=String(prefs.rules.loading);input('rule-bonuses').value=String(prefs.rules.bonuses);
menuHandler(open=>{if(!open&&playing)canvas.focus();});
function applyRules(rules:Rules,loadouts:number[][],colors:string[],data:Uint8Array|null){
 const pool=weaponPool(rules.allowedWeapons);for(let id=1;id<=40;id++)module._liero_allowed(id,pool.includes(id)?1:0);
 if(data)module.FS.writeFile('/import.lev',validateLevel(data));
 module._liero_options(rules.mode,rules.lives,rules.loading,rules.bonuses,data?1:0);
 for(let p=0;p<2;p++){for(let s=0;s<5;s++)module._liero_loadout(p,s,loadouts[p][s]);const color=/^#[0-9a-f]{6}$/i.test(colors[p])?colors[p]:'#6868fc';module._liero_color(p,parseInt(color.slice(1,3),16)>>2,parseInt(color.slice(3,5),16)>>2,parseInt(color.slice(5,7),16)>>2);}
 activeLoadouts=loadouts.map(a=>[...a]);
}
function profileButtons(){const two=localTwo&&!room.id;el('profile2-toggle').hidden=!two;el('profile-toggle').title=two?'Player 1 profile':'Your profile';el('profile-toggle').setAttribute('aria-label',two?'Player 1 profile':'Your profile');}
function updateHud(){el('hud').hidden=!prefs.showHud||!playing||localTwo||!!round?.spectator;const toggle=el('hud-toggle');toggle.setAttribute('aria-pressed',String(prefs.showHud));toggle.title=prefs.showHud?'Hide game stats':'Show game stats';toggle.setAttribute('aria-label',toggle.title);}
click('hud-toggle',()=>{prefs.showHud=!prefs.showHud;save();updateHud();});updateHud();
function showGame(){profileButtons();arena.reset();playing=true;updateHud();el('spectator-tools').hidden=!round?.spectator;setDisabled(el<HTMLButtonElement>('record-start'),!recorder.supported());if(!round||el<HTMLDialogElement>('rooms-menu').open)closeMenus();arena.playButton();}
function endGame(){playing=false;arena.reset();el('hud').hidden=true;el('spectator-tools').hidden=true;if(room.id){notice('Round complete. Waiting for the next round.');el('round-status').textContent='Round complete. The next round uses the next map in the rotation.';}else{openMenu('rooms-menu');notice('Round complete. Choose your next game.');}}
async function startLocal(two=false){await guard(async()=>{if(!module)return;if(room.id)await leaveRoom();clearTimeout(roundTimeout);roundTimeout=0;round=undefined;setup=undefined;const next=await maps.next();mapData=next.data;localTwo=two;follow=0;playerNames=[prefs.name,two?prefs.player2.name:'Bot'];applyRules(prefs.rules,prefs.loadouts,[prefs.color,two?prefs.player2.color:'#3cac3c'],mapData);el('map-name').textContent=next.level.name;game.start(two,prefs.keyboardOnly);showGame();});}
click('play-bot',()=>startLocal());click('play-local',()=>startLocal(true));
input('keyboard-only').onchange=()=>{prefs.keyboardOnly=input('keyboard-only').checked;save();};
input('room-name').onchange=()=>{prefs.roomName=input('room-name').value.trim()||'My room';save();};
input('private-room').onchange=()=>{prefs.privateRoom=input('private-room').checked;save();};
function openProfile(player:number){if(el<HTMLDialogElement>('profile-menu').open){const same=profilePlayer===player;closeMenus();if(same)return;}profilePlayer=player;weapons?.setPlayer(player);const value=player===0?prefs:prefs.player2;input('player-name').value=value.name;input('player-color').value=value.color;el('profile-heading').textContent=localTwo&&!room.id?'Player '+(player+1)+' profile':'Profile';openMenu('profile-menu');}
click('profile-toggle',()=>openProfile(0));click('profile2-toggle',()=>openProfile(1));
async function sendProfile(){
 clearTimeout(profileTimer);if(profileSaving||!profileDirty||!room.id)return;profileSaving=true;
 try{while(profileDirty&&room.id){profileDirty=false;await room.call('profile','PUT',{name:prefs.name,color:prefs.color});await room.refresh();}}
 catch(error){profileDirty=true;report(error);}finally{profileSaving=false;}
}
function updateProfile(){
 const value=profilePlayer===0?prefs:prefs.player2,name=playerName(input('player-name').value,'');if(name)value.name=name;value.color=input('player-color').value;save();
 if(room.id&&profilePlayer===0){const member=room.room?.members.find(m=>m.id===room.room?.self);if(member){member.name=value.name;member.color=value.color;if(member.seat>=0)setAppearance(member.seat,value.name,value.color);}profileDirty=true;}
 else if(!room.id)setAppearance(profilePlayer,value.name,value.color);
}
onMenuClose('profile-menu',()=>{updateProfile();void sendProfile();});
form('profile-form',()=>{updateProfile();return sendProfile();});
function setAppearance(p:number,name:string,color:string){
 playerNames[p]=playerName(name);module?._liero_color(p,parseInt(color.slice(1,3),16)>>2,parseInt(color.slice(3,5),16)>>2,parseInt(color.slice(5,7),16)>>2);
 game?.refreshAppearance();
}
async function togglePlay(){
 if(stopping)return;
 if(playing&&(room.id?room.seat>=0:true)){
  stopping=true;arena.playButton();closeMenus();
  try{await game.stopPlayer();if(room.id){await room.call('seat','POST',{play:false});await room.refresh();arena.nextCamera(true);}else{game.stop();playing=false;el('hud').hidden=true;}}
  finally{stopping=false;arena.playButton();}
  return;
 }
 if(!room.id){if(!game){openMenu('rooms-menu');return;}await startLocal(localTwo);return;}
 await room.call('seat','POST',{play:true});if(!room.host)room.send(room.room!.owner,{type:'seat-changed'});closeMenus();await room.refresh();if(room.host&&startingRound)await startingRound;arena.playButton();
}
form('settings-form',async()=>{prefs.rules={...prefs.rules,mode:Number(select('game-mode').value),lives:Number(input('rule-lives').value),loading:Number(input('rule-loading').value),bonuses:Number(input('rule-bonuses').value)};save();game?.setSound(prefs.sound);if(room.id){if(!room.host)throw new Error('Only the host can change room rules.');await saveRoomSettings();}if(!room.id&&playing)applyLiveRules(module,prefs.rules);notice('Settings saved and applied.');});
click('fullscreen',async()=>{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();});
window.addEventListener('keydown',e=>{if(e.code==='Escape'&&!document.querySelector('dialog[open]')){e.preventDefault();openMenu('rooms-menu');}if(e.code==='Tab'&&document.activeElement===canvas){e.preventDefault();openMenu('leaderboard-menu');}});

let roomSort:RoomSort={key:'count',ascending:false},renderRoomList=()=>{};
for(const key of ['name','count','ping','mode'] as const)click('sort-rooms-'+key,()=>{roomSort={key,ascending:roomSort.key===key?!roomSort.ascending:key!=='count'};renderRoomList();});
for(const id of ['rooms-empty','rooms-full'])input(id).onchange=()=>renderRoomList();
let pruneRoomList=(ids:Set<string>)=>{};let checkingDirectory=false;
async function refreshRooms(){
 el('room-browser').hidden=false;el('room-lobby').hidden=true;el('rooms-heading').textContent='Room Browser';const version=++roomListVersion;el('room-list-status').textContent='Measuring room ping…';
 const {rooms}=await api('/rooms');if(version!==roomListVersion)return;const list=el('room-list');list.replaceChildren();
 const entries:{room:Room;row:HTMLTableRowElement;ping:HTMLElement;ms:number}[]=[];
 const sort=()=>{entries.sort((a,b)=>compareRooms(a,b,roomSort));list.replaceChildren();let shown=0;for(const entry of entries)if(includeRoom(entry.room,input('rooms-empty').checked,input('rooms-full').checked)){list.append(entry.row);shown++;}for(const key of ['name','count','ping','mode'])el('sort-rooms-'+key).parentElement!.setAttribute('aria-sort',roomSort.key===key?(roomSort.ascending?'ascending':'descending'):'none');el('room-list-status').textContent=rooms.length?shown+' / '+rooms.length+' rooms · all countries':'No public rooms yet. Create a room or find the closest room.';};renderRoomList=sort;
 for(const r of rooms as Room[]){const row=document.createElement('tr');const cell=(text:string)=>{const td=document.createElement('td');td.textContent=text;row.append(td);return td;};cell(r.name).prepend(countryFlag(r.country));cell(r.count+'/'+r.capacity);const ping=cell('—');ping.title='Direct WebRTC round-trip time to host';const rule=cell(modeNames[r.settings.mode]);const subtitle=document.createElement('small');subtitle.textContent=r.settings.rotation.length+' maps · '+r.phase;rule.append(subtitle);const join=button('Watch / join',()=>joinRoom(r.id,''),'requires-engine');join.disabled=!game;cell('').append(join);list.append(row);entries.push({room:r,row,ping,ms:Infinity});}
 pruneRoomList=ids=>{if(version!==roomListVersion)return;for(let i=entries.length-1;i>=0;i--)if(!ids.has(entries[i].room.id))entries.splice(i,1);for(let i=rooms.length-1;i>=0;i--)if(!ids.has(rooms[i].id))rooms.splice(i,1);sort();};
 const jobs=[...entries];sort();let next=0;
 const measure=async(entry:typeof entries[number])=>{try{const ms=entry.room.id===room.id&&room.host?0:await probeRoom(entry.room.id);if(version!==roomListVersion)return;entry.ms=ms;entry.ping.textContent=ms+' ms';sort();}catch{if(version===roomListVersion){entry.ping.title='Host ping unavailable';entry.ping.replaceChildren(button('Retry ping',()=>measure(entry)));}}};
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(version===roomListVersion){const entry=jobs[next++];if(!entry)break;await measure(entry);}}));
 if(version===roomListVersion)sort();
}
function roomTab(tab='explore'){for(const name of ['explore','create','local']){el(name+'-panel').hidden=name!==tab;el(name+'-tab').setAttribute('aria-selected',String(name===tab));}}
click('explore-tab',()=>roomTab());click('create-tab',()=>roomTab('create'));click('local-tab',()=>roomTab('local'));
onMenu('rooms-menu',()=>{roomTab();return refreshRooms();});click('refresh-rooms',refreshRooms);
window.setInterval(async()=>{
 if(checkingDirectory||document.hidden||!el<HTMLDialogElement>('rooms-menu').open||el('explore-panel').hidden)return;
 checkingDirectory=true;const version=roomListVersion;
 try{const {rooms}=await api('/rooms');if(version===roomListVersion)pruneRoomList(new Set(rooms.map((r:Room)=>r.id)));}catch{}finally{checkingDirectory=false;}
},15000);
async function createRoom(auto=false){await guard(async()=>{if(room.id)await leaveRoom();if(!prefs.rotation.length)throw new Error('Enable at least one map.');prefs.roomName=input('room-name').value.trim()||'My room';prefs.privateRoom=input('private-room').checked;save();game?.stop();playing=false;round=undefined;setup=undefined;quickMatching=auto;localTwo=false;profileButtons();await room.create({...prefs,privateRoom:auto?false:prefs.privateRoom},false);closeMenus();waitingPreview();});}
async function joinRoom(id:string,invite:string,automatic=false){await guard(async()=>{if(!game)throw new Error('Wait for the game to finish loading.');if(id===room.id){closeMenus();return;}if(room.id)await leaveRoom();game.stop();playing=false;round=undefined;setup=undefined;localTwo=false;profileButtons();await room.join(id,invite,prefs);closeMenus();waitingPreview();});}
click('create-room',()=>createRoom());click('quick-match',()=>autoConnect());
function waitingPreview(){if(!module||!templeData||playing)return;module.FS.writeFile('/import.lev',templeData);module._liero_options(0,15,100,0,1);game.preview();el('map-name').textContent='TEMPLE.LEV';el('hud').hidden=true;arena.nextCamera(true);}
async function autoConnect(){
 el('connection').textContent='Finding the closest public room…';
 const {rooms}=await api('/rooms'),candidates:Room[]=rooms.filter((r:Room)=>r.count<r.capacity&&r.id!==room.id),measured:{room:Room;ping:number}[]=[];let next=0;
 await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{for(;;){const r=candidates[next++];if(!r)break;try{measured.push({room:r,ping:await probeRoom(r.id)});}catch{}}}));
 measured.sort((a,b)=>a.ping-b.ping);for(const candidate of measured){try{await joinRoom(candidate.room.id,'',true);return;}catch{}}
 await createRoom(true);
}
onMenu('room-settings-menu',()=>{const r=room.room,editable=!r||room.host,rules=r?.settings||prefs.rules;select('game-mode').value=String(rules.mode);input('rule-lives').value=String(rules.lives);input('rule-loading').value=String(rules.loading);input('rule-bonuses').value=String(rules.bonuses);el('settings-form').querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('input,button,select').forEach(control=>setDisabled(control,!editable));el('room-settings-access').textContent=r?r.name+' · '+(editable?'You can edit this room.':'View only · only the host can change room rules.'):'Defaults for your next room or local game.';});
async function leaveRoom(){handoffMap=undefined;nextMapId=undefined;maps?.setRoom(undefined);weapons?.setAvailability(weaponPool(prefs.rules.allowedWeapons));clearTimeout(roundTimeout);roundTimeout=0;recorder.stop();game?.stop();playing=false;round=undefined;setup=undefined;staging=undefined;quickMatching=false;peerLoadouts.clear();peerPings={};await room.leave();history.replaceState(null,'',location.pathname);el('room-browser').hidden=false;el('room-lobby').hidden=true;el('rooms-heading').textContent='Room Browser';el('connection').textContent='Local';el('hud').hidden=true;el('spectator-tools').hidden=true;arena.reset();el('overlay-players').replaceChildren();el('player-count').textContent='0';}
click('leave-room',async()=>{await leaveRoom();if(!el<HTMLDialogElement>('rooms-menu').open)openMenu('rooms-menu');else await refreshRooms();});
const inviteURL=()=>location.origin+'/#room='+room.id+(room.room?.private?'&invite='+room.invite:'');
async function copyInvite(){if(!room.id){notice('Join a room first.');return;}const url=inviteURL();input('invite-link').value=url;input('invite-link').hidden=false;try{await navigator.clipboard.writeText(url);notice('Invite link copied.');}catch{input('invite-link').select();openMenu('rooms-menu');el('room-browser').prepend(input('invite-link'));notice('Select and copy this invite link.');}}
click('copy-invite',copyInvite);
form('chat-form',async()=>{const message=input('chat-message').value.trim();if(!message)return;input('chat-message').value='';await arena.sendChat(message);});
click('take-seat',async()=>{await room.call('seat','POST',{play:room.seat<0});closeMenus();notice('Your player slot has been updated for the next round.');});
async function saveRoomSettings(){if(room.host){await room.call('settings','PUT',{name:prefs.roomName,private:prefs.privateRoom,settings:{...prefs.rules,rotation:prefs.rotation.length?prefs.rotation:room.room!.settings.rotation}});await room.refresh();}}
function pingFor(id:string){if(id===room.room?.owner)return 0;return room.host?room.pings.get(id):peerPings[id];}
function renderRoom(r:Room){
 if(!r)return;if(room.host&&round&&!round.ended&&rulesKey(r.settings)!==lastRulesKey){round.queueRules(r.settings);lastRulesKey=rulesKey(r.settings);}for(const m of r.members)if(m.seat>=0){setAppearance(m.seat,m.name,m.color);if(setup?.playerIds?.[m.seat]===m.id){setup.players[m.seat]=m.name;setup.colors[m.seat]=m.color;}}maps?.setRoom(room.host?undefined:r.settings.rotation);weapons?.setAvailability(weaponPool(r.settings.allowedWeapons));arena.room(r,pingFor);el('room-description').replaceChildren(countryFlag(r.country),document.createTextNode(' '+(r.private?'Private':'Public')+' · '+r.count+'/'+r.capacity));
 const members=el('members');members.replaceChildren();for(const m of r.members){const row=document.createElement('div');row.className='member';const dot=document.createElement('span');dot.className='worm-dot';dot.style.background=m.color;const name=document.createElement('span');name.className='member-name';name.textContent=playerName(m.name)+(m.id===r.self?' (you)':'');const role=document.createElement('span');role.className='role';role.textContent=m.seat>=0?'Player '+(m.seat+1)+(m.id===r.owner?' / host':''):'Spectator'+(m.id===r.owner?' / host':'');const ping=document.createElement('span');ping.className='ping';const ms=pingFor(m.id);ping.textContent=ms===undefined?'—':ms+' ms';row.append(countryFlag(m.country),dot,name,role,ping);members.append(row);}
 const log=el('chat-history'),last=log.dataset.last||'';const next=String(r.chat.at(-1)?.seq||'');if(last!==next){const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<35;log.replaceChildren();for(const msg of r.chat){const p=document.createElement('p'),name=document.createElement('strong');name.textContent=playerName(msg.name);p.append(name,chatText(msg.message));log.append(p);}log.dataset.last=next;if(bottom)log.scrollTop=log.scrollHeight;}
 el<HTMLButtonElement>('start-round').hidden=!room.host;const players=r.members.filter(m=>m.seat>=0),ready=players.length>0&&players.every(m=>m.id===r.self||peerLoadouts.has(m.id));setDisabled(el<HTMLButtonElement>('start-round'),!ready||!!round&&!round.ended);
 el<HTMLButtonElement>('take-seat').hidden=false;setDisabled(el<HTMLButtonElement>('take-seat'),room.seat<0&&players.length>=2);el('take-seat').textContent=room.seat<0?'Join game':'Switch to spectator';
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
room.onHostChanged=()=>{
 const previous=setup,r=room.room!;if(round)round.ended=true;game?.stop();playing=false;clearTimeout(roundTimeout);roundTimeout=0;nextMapId=undefined;
 handoffMap=room.host&&previous?.map?{level:{id:previous.map.id||'received:'+previous.id,name:previous.map.name,data:mapData||undefined},data:mapData,seed:previous.seed}:undefined;
 round=undefined;setup=undefined;staging=undefined;peerLoadouts.clear();peerPings={};
 if(room.host){prefs.roomName=r.name;prefs.privateRoom=r.private;prefs.rules={...r.settings};prefs.rotation=[...r.settings.rotation];save();if(handoffMap&&!maps.levels.some(l=>l.id===handoffMap!.level.id))maps.levels.push(handoffMap.level);}
 notice(room.host?'The host left. You are the new host; restarting the current level.':'The host changed. Reconnecting to continue in this room.');
};
room.onState=renderRoom;room.onError=error=>{if([403,404,409].includes((error as any).status)&&room.id){void leaveRoom().then(()=>{if(!el<HTMLDialogElement>('rooms-menu').open)openMenu('rooms-menu');notice('The room has closed. Choose another room.');}).catch(report);return;}el('connection').textContent='Room unavailable';el('round-status').textContent=error.message;};
room.onReady=id=>{if(!room.host)room.send(id,{type:'ready',version:NETWORK_VERSION,loadout:prefs.loadouts[0]});};
room.onLost=id=>{if(id===room.room?.owner){if(round)round.ended=true;game?.stop();playing=false;notice('Host connection lost. Waiting for the room to reconnect or transfer.');void room.refresh().catch(report);return;}if(round&&!round.ended&&(id===room.room?.owner||(room.room?.members.find(m=>m.id===id)?.seat??-1)>=0)){round.ended=true;game.stop();playing=false;notice('Player connection lost. Return to the room to restart.');if(room.host)room.call('phase','PUT',{phase:'lobby'}).catch(report);}};
function validLoadout(v:any){return Array.isArray(v)&&v.length===5&&v.every(n=>Number.isInteger(n)&&n>=1&&n<=40);}
function sendSetup(id:string){
 if(!setup)return;
 room.send(id,{type:'start-meta',setup});
 if(mapData){let binary='';for(const value of mapData)binary+=String.fromCharCode(value);const encoded=btoa(binary);for(let i=0;i<encoded.length;i+=48000)room.send(id,{type:'map-chunk',round:setup.id,offset:i,data:encoded.slice(i,i+48000)});}
 room.send(id,{type:'start',round:setup.id});round?.history(id);
}
function launchNetwork(value:any,data:Uint8Array|null){
 applyRules(value.rules,value.loadouts,value.colors,data);lastRulesKey=rulesKey(value.rules);setup=value;mapData=data;localTwo=false;follow=room.seat===1?1:0;playerNames=[0,1].map(p=>playerName(value.players?.[p],''));setup.players=[...playerNames];el('map-name').textContent=value.map.name;
 if(round)round.ended=true;
 if(value.preview){round=undefined;playing=false;arena.reset();game.preview(value.seed);el('hud').hidden=true;el('spectator-tools').hidden=true;arena.nextCamera(true);return;}
 round=new NetworkRound(module,room,value.id,Array.isArray(value.playerIds)?value.playerIds.indexOf(room.room?.self):room.seat,value.participants??3);round.onError=message=>{console.error(message);game.stop();playing=false;notice(message);openMenu('rooms-menu');};round.onEnd=()=>{if(room.host){room.call('phase','PUT',{phase:'lobby'}).catch(report);roomTimeoutNext();}};
 game.start(false,false,value.seed,round);game.setSound(prefs.sound);select('camera').options[0].textContent='Follow '+playerNames[0];select('camera').options[1].textContent='Follow '+playerNames[1];select('camera').value=String(follow);showGame();if(round.spectator)arena.nextCamera(true);
}
function roomTimeoutNext(){clearTimeout(roundTimeout);roundTimeout=0;roundTimeout=window.setTimeout(()=>{roundTimeout=0;if(room.host&&room.id&&room.room?.members.filter(m=>m.seat>=0).length>0)startOnline().catch(report);},5000);}
async function startOnline(mapId?:string,restart=false){if(startingRound)return startingRound;const task=guard(async()=>{
 if(!room.host||!room.room)throw new Error('Only the host can start a round.');if(round&&!round.ended&&!restart)throw new Error('A round is already running.');
 const players=[0,1].map(p=>room.room!.members.find(m=>m.seat===p));if(!players.some(Boolean)||players.some(m=>m&&m.id!==room.room!.self&&!peerLoadouts.has(m.id)))throw new Error('Wait for the players to connect.');
 const authority=room.room!.owner,hostEpoch=room.room!.hostEpoch,transfer=mapId?undefined:handoffMap;const chosen=mapId??nextMapId,next=transfer??(chosen?await maps.pick(chosen):await maps.next(room.room!.settings.rotation));if(!room.host||room.room?.owner!==authority||room.room?.hostEpoch!==hostEpoch)return;handoffMap=undefined;nextMapId=undefined;clearTimeout(roundTimeout);roundTimeout=0;const loadouts=players.map(m=>!m||m.id===room.room!.self?[...prefs.loadouts[0]]:[...peerLoadouts.get(m.id)!]);
 const value={version:NETWORK_VERSION,id:crypto.randomUUID(),seed:transfer?.seed??crypto.getRandomValues(new Uint32Array(1))[0],rules:{...prefs.rules},loadouts,colors:players.map(m=>m?.color||'#3cac3c'),players:players.map(m=>m?.name||''),playerIds:players.map(m=>m?.id??null),participants:players.reduce((mask,m,p)=>mask|(m?1<<p:0),0),map:{id:next.level.id,name:next.level.name,bytes:next.data?.length||0}};
 launchNetwork(value,next.data);for(const m of room.room.members)if(m.id!==room.room.self)sendSetup(m.id);await room.call('phase','PUT',{phase:'playing'});
});startingRound=task;try{await task;}finally{if(startingRound===task)startingRound=undefined;}}
async function switchRoomMap(level:Level){
 if(!room.host||!room.room)throw new Error('Only the host can change the map.');
 const players=room.room.members.filter(m=>m.seat>=0);
 if(players.length>0&&players.every(m=>m.id===room.room!.self||peerLoadouts.has(m.id))){await startOnline(level.id,true);closeMenus();notice('Started '+level.name+' for everyone.');return;}
 await guard(async()=>{const data=await levelBytes(level);await saveRoomSettings();clearTimeout(roundTimeout);roundTimeout=0;await room.call('phase','PUT',{phase:'lobby'});nextMapId=level.id;
 const value={version:NETWORK_VERSION,preview:true,id:crypto.randomUUID(),seed:crypto.getRandomValues(new Uint32Array(1))[0],rules:{...prefs.rules},loadouts:prefs.loadouts.map(a=>[...a]),colors:[prefs.color,'#3cac3c'],players:[prefs.name,'Player 2'],map:{name:level.name,bytes:data?.length||0}};
 launchNetwork(value,data);for(const member of room.room!.members)if(member.id!==room.room!.self)sendSetup(member.id);notice('Changed to '+level.name+'. Press Play to start.');});
}
click('start-round',async()=>{await startOnline();closeMenus();});
room.onPacket=(from,packet)=>{
 try{
  if(packet.type==='seat-changed'&&room.host&&room.room?.members.some(m=>m.id===from)){void room.refresh().catch(report);return;}
  if(packet.type==='chat-delivery'&&!room.host&&from===room.room?.owner){arena.receiveChat(packet.message);return;}
  if(packet.type==='chat-posted'&&room.host){const member=room.room?.members.find(m=>m.id===from),msg=packet.message;if(!member||!msg||msg.player!==from||typeof msg.message!=='string'||msg.message.length>500||!Number.isSafeInteger(msg.seq))return;const message={...msg,name:member.name};arena.receiveChat(message);room.broadcast({type:'chat-delivery',message});return;}
  if(packet.type==='loadout'&&room.host&&validLoadout(packet.loadout)&&room.room?.members.some(m=>m.id===from)){peerLoadouts.set(from,[...packet.loadout]);const seat=room.room?.members.find(m=>m.id===from)?.seat??-1;if(seat>=0)round?.queueLoadout(seat,packet.loadout);return;}
  if(packet.type==='ready'&&room.host){if(packet.version!==NETWORK_VERSION){room.send(from,{type:'update-required'});notice('A player needs to reload Liero before joining.');return;}if(!validLoadout(packet.loadout))return;peerLoadouts.set(from,packet.loadout);if(setup&&(!round||!round.ended))sendSetup(from);void room.refresh().catch(report);return;}
  if(packet.type==='update-required'&&from===room.room?.owner){notice('Reload Liero to join this room: the game version has changed.');return;}
  if(packet.type==='pings'&&!room.host&&from===room.room?.owner){peerPings=packet.pings||{};return;}
  if(packet.type==='ended'&&from===room.room?.owner&&packet.round===round?.id){round!.ended=true;game.stop();endGame();return;}
  if(from===room.room?.owner&&!room.host){
   if(packet.type==='start-meta'){const v=packet.setup;if(v?.version!==NETWORK_VERSION||![1,2,3].includes(v.participants??3)||typeof v.id!=='string'||!Number.isInteger(v.seed)||!Array.isArray(v.loadouts)||!v.loadouts.every(validLoadout)||v.loadouts.length!==2||!Array.isArray(v.players)||v.players.length!==2||!Array.isArray(v.colors)||v.colors.length!==2||![0,1,2,3].includes(v.rules?.mode)||!Number.isInteger(v.map?.bytes)||v.map.bytes<0||v.map.bytes>1048576)throw new Error('Invalid round setup.');staging={value:v,chunks:[],size:0};return;}
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
onMenu('recordings-menu',()=>{setDisabled(el<HTMLButtonElement>('record-start'),!playing||recorder.active||!recorder.supported());if(!recorder.supported())el('record-status').textContent='MP4 recording is not supported by this browser. Try a browser with MP4 MediaRecorder support.';return renderArchive();});
click('record-start',()=>{if(!playing)throw new Error('Start or watch a game first.');recorder.start(canvas,module.audioStream,room.room?.name||'Local game');el('recording-indicator').hidden=false;setDisabled(el<HTMLButtonElement>('record-start'),true);setDisabled(el<HTMLButtonElement>('record-stop'),false);closeMenus();});
recorder.onRecordingChange=recording=>{const icon=el('recordings-toggle');icon.classList.toggle('is-recording',recording);icon.title=recording?'Recording in progress · open recordings':'Recordings';icon.setAttribute('aria-label',icon.title);el('recording-indicator').hidden=!recording;};
click('record-stop',()=>recorder.stop());recorder.onError=error=>{el('recording-indicator').hidden=true;setDisabled(el<HTMLButtonElement>('record-start'),!playing);setDisabled(el<HTMLButtonElement>('record-stop'),true);report(error);};recorder.onSaved=(recording,persisted)=>{el('recording-indicator').hidden=true;setDisabled(el<HTMLButtonElement>('record-start'),!playing);setDisabled(el<HTMLButtonElement>('record-stop'),true);notice(persisted?'Recording saved to the local archive.':'Archive storage is full. Download this recording before closing the page.');renderArchive(recording).catch(report);};
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(console.error);
window.addEventListener('pagehide',()=>{void room.leave().catch(()=>{});recorder.stop();game?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('beforeunload',event=>{if(recorder.active){event.preventDefault();event.returnValue='';}});
const initialParams=new URLSearchParams(location.hash.slice(1));
if(!initialParams.has('room'))openMenu('rooms-menu');
el('connection').textContent='Loading game…';
Promise.all([loadEngine(),room.recover()]).then(async ([engine])=>{
 module=engine;weapons=new WeaponLibrary(module,prefs,saveWeapons);const ptr=module._liero_palette();roomWeapons(room,prefs,weapons,save,saveRoomSettings);maps=new MapLibrary(prefs,()=>{save();if(room.host&&prefs.rotation.length)saveRoomSettings().catch(report);},module.HEAPU8.slice(ptr,ptr+1024),{canSwitch:()=>room.host,switchMap:switchRoomMap});await maps.init();templeData=(await maps.pick('temple')).data!;game=new LocalGame(module,canvas,endGame,renderStats);game.setControls(prefs.controls);game.setSound(prefs.sound);
 document.querySelectorAll<HTMLButtonElement>('.requires-engine').forEach(b=>b.disabled=false);
 waitingPreview();el('connection').textContent='Choose a room or start a local game';
 const params=new URLSearchParams(location.hash.slice(1)),id=params.get('room');try{if(id)await joinRoom(id,params.get('invite')||'');}catch(error){if(!el<HTMLDialogElement>('rooms-menu').open)openMenu('rooms-menu');notice(error instanceof Error?error.message:String(error));}
}).catch(error=>{el('connection').textContent='The game could not load. Reload to try again.';report(error);});
