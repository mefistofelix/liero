import {test,expect} from 'bun:test';

test('cancelling a file picker keeps its parent menu open; dialog Escape still closes it',async()=>{
 const previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
 const listeners=new Map<string,(event:any)=>void>();let closes=0;
 const dialog={id:'maps-menu',open:true,addEventListener:(name:string,fn:(event:any)=>void)=>listeners.set(name,fn),close(){this.open=false;closes++;}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelectorAll:(selector:string)=>selector==='dialog'||selector==='dialog[open]'&&dialog.open?[dialog]:[],querySelector:()=>dialog.open?dialog:null,addEventListener:()=>{}}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener:()=>{}}});
 try{
  await import('../browser/ui.ts');
  let prevented=false;listeners.get('cancel')!({target:{type:'file'},preventDefault(){prevented=true;}});
  expect(closes).toBe(0);expect(dialog.open).toBe(true);expect(prevented).toBe(false);
  listeners.get('cancel')!({target:dialog,preventDefault(){prevented=true;}});
  expect(closes).toBe(1);expect(dialog.open).toBe(false);expect(prevented).toBe(true);
 }finally{
  if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else delete (globalThis as any).document;
  if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else delete (globalThis as any).window;
 }
});
