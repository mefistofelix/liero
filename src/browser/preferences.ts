export const allWeapons=Array.from({length:40},(_,i)=>i+1);
export const weaponPool=(value:unknown):number[]=>Array.isArray(value)&&value.length&&value.every(id=>Number.isInteger(id)&&id>=1&&id<=40)?[...new Set<number>(value)]:[...allWeapons];
export const permittedLoadout=(loadout:number[],pool:number[])=>loadout.map((id,slot)=>pool.includes(id)?id:pool[slot%pool.length]);
export type Rules={mode:number;lives:number;loading:number;bonuses:number;allowedWeapons?:number[]};
export type Controls={mouse:string[];keyboard:string[][]};
export const defaultControls:Controls={mouse:['KeyA','KeyD','KeyW','KeyS','Space','KeyF'],keyboard:[['KeyW','KeyS','KeyA','KeyD','KeyF','KeyG','Space'],['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlRight','Enter','ShiftRight']]};
export type Preferences={name:string;color:string;roomName:string;privateRoom:boolean;sound:boolean;keyboardOnly:boolean;loadouts:number[][];rules:Rules;rotation:string[];controls:Controls};
export const defaults:Preferences={name:'Player',color:'#6868fc',roomName:'My room',privateRoom:false,sound:true,keyboardOnly:true,loadouts:[[1,8,15,22,29],[1,8,15,22,29]],rules:{mode:0,lives:15,loading:100,bonuses:4},rotation:['random','temple'],controls:defaultControls};
export function readPreferences():Preferences{
 let value:any={};try{value=JSON.parse(localStorage.getItem('liero.preferences.v1')||'{}')||{};}catch{}
 const number=(v:unknown,min:number,max:number,fallback:number)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max?Number(v):fallback;
 const text=(v:unknown,fallback:string,max:number)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):fallback;
 const bindings=(v:unknown,fallback:string[])=>fallback.map((key,index)=>Array.isArray(v)&&typeof v[index]==='string'&&/^[A-Za-z0-9]{1,30}$/.test(v[index])&&!['Escape','Tab'].includes(v[index])?v[index]:key);
 return {name:text(value.name,defaults.name,20),color:/^#[a-f0-9]{6}$/i.test(value.color)?value.color:defaults.color,roomName:text(value.roomName,defaults.roomName,48),privateRoom:value.privateRoom===true,sound:value.sound!==false,keyboardOnly:value.keyboardOnly!==false,
 loadouts:[0,1].map(p=>[0,1,2,3,4].map(s=>number(value.loadouts?.[p]?.[s],1,40,defaults.loadouts[p][s]))),
 rules:{mode:number(value.rules?.mode,0,3,0),lives:number(value.rules?.lives,1,99,15),loading:number(value.rules?.loading,1,1000,100),bonuses:number(value.rules?.bonuses,0,20,4),allowedWeapons:weaponPool(value.rules?.allowedWeapons)},
 controls:{mouse:bindings(value.controls?.mouse,defaultControls.mouse),keyboard:defaultControls.keyboard.map((keys,p)=>bindings(value.controls?.keyboard?.[p],keys))},
 rotation:Array.isArray(value.rotation)&&value.rotation.length&&value.rotation.length<=1000?value.rotation.filter((x:unknown)=>typeof x==='string'&&x.length<180):[...defaults.rotation]};
}
export function savePreferences(value:Preferences){localStorage.setItem('liero.preferences.v1',JSON.stringify(value));}
