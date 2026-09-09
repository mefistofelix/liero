import type {EngineModule} from './engine.ts';
import type {Preferences} from './preferences.ts';
import {el,input,select,button,onMenu,click,notice} from './ui.ts';
export class WeaponLibrary{
 weapons:{id:number;name:string;icon:string}[]=[];private slot=0;private dragSlot=-1;private dragWeapon=-1;private allowed=new Set(Array.from({length:40},(_,i)=>i+1));
 setAvailability(ids:number[]){const next=new Set(ids);if([...next].join()=== [...this.allowed].join())return;this.allowed=next;if(el<HTMLDialogElement>('weapons-menu').open)this.render();}
 setPlayer(player:number){this.player=player;this.slot=0;}
 constructor(module:EngineModule,private prefs:Preferences,private save:(player:number)=>void){
  for(let id=1;id<=40;id++){const ptr=module._liero_weapon_name(id),end=module.HEAPU8.indexOf(0,ptr),name=new TextDecoder().decode(module.HEAPU8.subarray(ptr,end));const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(16,16),iconPtr=module._liero_weapon_icon(id);pixels.data.set(module.HEAPU8.subarray(iconPtr,iconPtr+1024));ctx.putImageData(pixels,0,0);this.weapons.push({id,name,icon:canvas.toDataURL('image/png')});}
  onMenu('weapons-menu',()=>this.render());input('weapon-search').oninput=()=>this.render();
  select('saved-loadout').onchange=()=>{const p=this.player,preset=this.prefs.savedLoadouts[p].find(v=>v.id===select('saved-loadout').value);if(!preset)return;this.prefs.selectedLoadouts[p]=preset.id;this.prefs.loadouts[p]=[...preset.weapons];this.save(p);this.render();};
  click('new-loadout',()=>{const p=this.player,name=this.presetName();if(!name)return;if(this.prefs.savedLoadouts[p].length>=32){notice('You can save up to 32 loadouts per player.');return;}const preset={id:crypto.randomUUID(),name,weapons:[...this.prefs.loadouts[p]]};this.prefs.savedLoadouts[p].push(preset);this.prefs.selectedLoadouts[p]=preset.id;this.save(p);this.render();});
  click('rename-loadout',()=>{const name=this.presetName();if(!name)return;this.selected.name=name;this.save(this.player);this.render();});
  click('delete-loadout',()=>{const p=this.player,id=this.selected.id;if(this.prefs.savedLoadouts[p].length===1)return;this.prefs.savedLoadouts[p]=this.prefs.savedLoadouts[p].filter(v=>v.id!==id);const next=this.prefs.savedLoadouts[p][0];this.prefs.selectedLoadouts[p]=next.id;this.prefs.loadouts[p]=[...next.weapons];this.save(p);this.render();});
 }
 private player=0;
 private get selected(){return this.prefs.savedLoadouts[this.player].find(v=>v.id===this.prefs.selectedLoadouts[this.player])!;}
 private presetName(){const name=input('loadout-name').value.trim();if(!name){notice('Enter a loadout name.');return '';}return name.slice(0,32);}
 private changed(){this.selected.weapons=[...this.prefs.loadouts[this.player]];this.save(this.player);this.render();}
 private move(from:number,to:number){if(from<0||from>4||to<0||to>4||from===to)return;const list=this.prefs.loadouts[this.player];list.splice(to,0,list.splice(from,1)[0]);this.slot=to;this.changed();el('loadout-slots').querySelectorAll<HTMLButtonElement>('button')[to]?.focus();}
 get(id:number){return this.weapons[id-1];}
 private weaponButton(id:number,action:()=>void){const w=this.get(id),b=button(w.name,action,'weapon-button'),img=document.createElement('img');img.src=w.icon;img.alt='';img.draggable=false;b.prepend(img);return b;}
 render(){
  const player=this.player,presets=select('saved-loadout');presets.replaceChildren();for(const preset of this.prefs.savedLoadouts[player]){const option=document.createElement('option');option.value=preset.id;option.textContent=preset.name;presets.append(option);}presets.value=this.prefs.selectedLoadouts[player];input('loadout-name').value=this.selected.name;el<HTMLButtonElement>('delete-loadout').disabled=this.prefs.savedLoadouts[player].length<2;
  const slots=el('loadout-slots');slots.replaceChildren();this.prefs.loadouts[player].forEach((id,slot)=>{
   const b=this.weaponButton(id,()=>{this.slot=slot;this.render();});b.classList.toggle('active',slot===this.slot);b.setAttribute('aria-pressed',String(slot===this.slot));b.classList.toggle('unavailable',!this.allowed.has(id));b.title=`Slot ${slot+1} · Drag to reorder`+(!this.allowed.has(id)?' · Unavailable in this room':'');b.draggable=true;
   b.ondragstart=e=>{this.dragWeapon=-1;this.dragSlot=slot;e.dataTransfer!.effectAllowed='move';e.dataTransfer!.setData('text/plain',String(slot));b.classList.add('dragging');};
   b.ondragover=e=>{if(this.dragSlot>=0||this.dragWeapon>0){e.preventDefault();e.dataTransfer!.dropEffect=this.dragWeapon>0?'copy':'move';b.classList.add('drop-target');}};
   b.ondragleave=()=>b.classList.remove('drop-target');b.ondragend=()=>{this.dragWeapon=-1;this.dragSlot=-1;slots.querySelectorAll('.dragging,.drop-target').forEach(node=>node.classList.remove('dragging','drop-target'));};
   b.ondrop=e=>{e.preventDefault();const from=this.dragSlot,weapon=this.dragWeapon;this.dragSlot=this.dragWeapon=-1;if(weapon>0&&this.allowed.has(weapon)){this.prefs.loadouts[player][slot]=weapon;this.slot=slot;this.changed();el('loadout-slots').querySelectorAll<HTMLButtonElement>('button')[slot]?.focus();}else this.move(from,slot);};
   b.onkeydown=e=>{if(e.altKey&&['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.move(slot,slot+(e.code==='ArrowLeft'?-1:1));}};slots.append(b);
  });
  const picker=el('weapon-picker');picker.replaceChildren();for(const w of this.weapons.filter(w=>w.name.toLowerCase().includes(input('weapon-search').value.toLowerCase()))){const b=this.weaponButton(w.id,()=>{this.prefs.loadouts[player][this.slot]=w.id;this.changed();});b.disabled=!this.allowed.has(w.id);if(b.disabled)b.title='Disabled by the room host';else{b.draggable=true;b.title='Click to equip, or drag to a loadout slot';b.ondragstart=e=>{this.dragSlot=-1;this.dragWeapon=w.id;e.dataTransfer!.effectAllowed='copy';e.dataTransfer!.setData('text/plain',w.name);b.classList.add('dragging');};b.ondragend=()=>{this.dragSlot=this.dragWeapon=-1;b.classList.remove('dragging');slots.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));};}picker.append(b);}
 }
}
