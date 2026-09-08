import type {EngineModule} from './engine.ts';
import type {Preferences} from './preferences.ts';
import {el,input,select,button,onMenu} from './ui.ts';
export class WeaponLibrary{
 weapons:{id:number;name:string;icon:string}[]=[];private slot=0;private allowed=new Set(Array.from({length:40},(_,i)=>i+1));
 setAvailability(ids:number[]){this.allowed=new Set(ids);}
 constructor(module:EngineModule,private prefs:Preferences,private save:()=>void){
  for(let id=1;id<=40;id++){const ptr=module._liero_weapon_name(id),end=module.HEAPU8.indexOf(0,ptr),name=new TextDecoder().decode(module.HEAPU8.subarray(ptr,end));const canvas=document.createElement('canvas');canvas.width=canvas.height=16;const ctx=canvas.getContext('2d')!,pixels=ctx.createImageData(16,16),iconPtr=module._liero_weapon_icon(id);pixels.data.set(module.HEAPU8.subarray(iconPtr,iconPtr+1024));ctx.putImageData(pixels,0,0);this.weapons.push({id,name,icon:canvas.toDataURL('image/png')});}
  onMenu('weapons-menu',()=>this.render());select('loadout-player').onchange=()=>this.render();input('weapon-search').oninput=()=>this.render();
 }
 get(id:number){return this.weapons[id-1];}
 private weaponButton(id:number,action:()=>void){const w=this.get(id),b=button(w.name,action,'weapon-button'),img=document.createElement('img');img.src=w.icon;img.alt='';b.prepend(img);return b;}
 render(){const player=Number(select('loadout-player').value),slots=el('loadout-slots');slots.replaceChildren();this.prefs.loadouts[player].forEach((id,slot)=>{const b=this.weaponButton(id,()=>{this.slot=slot;this.render();});b.classList.toggle('active',slot===this.slot);b.setAttribute('aria-pressed',String(slot===this.slot));b.title=`Slot ${slot+1}`;slots.append(b);});const picker=el('weapon-picker');picker.replaceChildren();for(const w of this.weapons.filter(w=>w.name.toLowerCase().includes(input('weapon-search').value.toLowerCase()))){const b=this.weaponButton(w.id,()=>{this.prefs.loadouts[player][this.slot]=w.id;this.save();this.render();});b.disabled=!this.allowed.has(w.id);if(b.disabled)b.title='Disabled by the room host';picker.append(b);}}
}
