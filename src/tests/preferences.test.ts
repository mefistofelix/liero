import {test,expect} from 'bun:test';
import {readPreferences,savePreferences} from '../browser/preferences.ts';
test('first-launch color persists and new factory defaults preserve custom choices',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage');let stored:string|null=null;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>stored,setItem:(_key:string,value:string)=>{stored=value;}}});
 try{
  const first=readPreferences();expect(first.color).toMatch(/^#[a-f0-9]{6}$/);expect(readPreferences().color).toBe(first.color);
  expect(first.loadouts[0]).toEqual([19,25,9,36,35]);expect(first.rotation).toEqual(['temple']);expect(first.rules.loading).toBe(30);
  stored=JSON.stringify({loadouts:[[1,8,15,22,29],[2,3,4,5,6]],rotation:['random','custom']});
  const migrated=readPreferences();expect(migrated.loadouts).toEqual([[19,25,9,36,35],[2,3,4,5,6]]);expect(migrated.rotation).toEqual(['random','custom']);
  migrated.loadouts[0]=[1,8,15,22,29];savePreferences(migrated);expect(readPreferences().loadouts[0]).toEqual([1,8,15,22,29]);
 }finally{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete (globalThis as any).localStorage;}
});
