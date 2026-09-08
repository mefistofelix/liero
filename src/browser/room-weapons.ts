import {el,button,onMenu,notice} from './ui.ts';
import {weaponPool,type Preferences} from './preferences.ts';
import type {RoomClient} from './rooms.ts';
import type {WeaponLibrary} from './weapons-ui.ts';
export function roomWeapons(room:RoomClient,prefs:Preferences,weapons:WeaponLibrary,save:()=>void,update:()=>Promise<void>){
 onMenu('room-weapons-menu',()=>{
  const editable=!room.id||room.host;let selected=weaponPool(room.room?.settings.allowedWeapons??prefs.rules.allowedWeapons);
  const list=el('room-weapon-list');list.replaceChildren();el('room-weapon-note').textContent=editable?'Enable the weapons everyone may use. Applies next round, including weapon bonuses.':'Weapons permitted by this room. Only the host can change them.';
  for(const weapon of weapons.weapons){const label=document.createElement('label');label.className='room-weapon';const check=document.createElement('input');check.type='checkbox';check.checked=selected.includes(weapon.id);check.disabled=!editable;check.onchange=()=>{selected=check.checked?[...selected,weapon.id]:selected.filter(id=>id!==weapon.id);};const icon=document.createElement('img');icon.src=weapon.icon;icon.alt='';label.append(check,icon,document.createTextNode(weapon.name));list.append(label);}
  const actions=el('room-weapons-actions');actions.replaceChildren();if(editable){actions.append(button('Enable all',()=>{selected=weapons.weapons.map(w=>w.id);list.querySelectorAll<HTMLInputElement>('input').forEach(c=>c.checked=true);}),button('Save weapon availability',async()=>{if(!selected.length){notice('Enable at least one weapon.');return;}prefs.rules.allowedWeapons=[...new Set(selected)];save();if(room.host)await update();notice('Room weapon availability saved for the next round.');},'primary'));}
 });
}
