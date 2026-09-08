import {test,expect} from 'bun:test';
import {LocalGame} from '../browser/engine.ts';
test('pointer input preserves first clicks and tracks chords without suppressing mouse events',()=>{
 const stubs:any={window:new EventTarget(),document:new EventTarget(),ImageData:class{},ResizeObserver:class{observe(){} disconnect(){}}};
 const previous=Object.fromEntries(Object.keys(stubs).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value]of Object.entries(stubs))Object.defineProperty(globalThis,key,{value,configurable:true});
 try{
  const canvas:any=new EventTarget();Object.assign(canvas,{width:320,height:200,parentElement:{},getContext:()=>({}),getBoundingClientRect:()=>({left:0,top:0,width:320,height:200}),focus(){},setPointerCapture(){}});
  const game:any=new LocalGame({} as any,canvas,()=>{},()=>{});
  const dispatch=(type:string,buttons:number,button:number)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{buttons,button,pointerId:1,clientX:10,clientY:10});canvas.dispatchEvent(e);return e;};
  expect(dispatch('pointerdown',2,2).defaultPrevented).toBe(false);expect(game.buttons).toBe(2);
  game.pendingButtons=0;dispatch('pointermove',3,0);expect(game.buttons).toBe(3);expect(game.pendingButtons&1).toBe(1);
  game.pendingButtons=0;dispatch('pointermove',2,0);expect(game.buttons).toBe(2);expect(game.pendingButtons).toBe(0);
  dispatch('pointermove',6,1);expect(game.buttons).toBe(6);expect(game.pendingButtons&4).toBe(4);
  game.events.abort();
 }finally{for(const [key,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}
});
