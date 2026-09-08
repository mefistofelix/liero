import {test,expect} from 'bun:test';
import {LocalGame} from '../browser/engine.ts';
test('mouse chords work, and menus suppress input while the local simulation keeps running',()=>{
 const stubs:any={window:new EventTarget(),document:new EventTarget(),ImageData:class{data=new Uint8ClampedArray(320*200*4)},ResizeObserver:class{observe(){} disconnect(){}},requestAnimationFrame:()=>1};
 const previous=Object.fromEntries(Object.keys(stubs).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value]of Object.entries(stubs))Object.defineProperty(globalThis,key,{value,configurable:true});
 try{
  const canvas:any=new EventTarget();Object.assign(canvas,{width:320,height:200,parentElement:{},getContext:()=>({putImageData(){}}),getBoundingClientRect:()=>({left:0,top:0,width:320,height:200}),focus(){},setPointerCapture(){}});
  const steps:number[][]=[];const engine={HEAPU8:new Uint8Array(320*200*4),HEAP32:new Int32Array(52),_liero_render:()=>0,_liero_info:()=>0,_liero_aim:()=>64,_liero_step:(...input:number[])=>{steps.push(input);return 1;}};
  const game:any=new LocalGame(engine as any,canvas,()=>{},()=>{});
  const dispatch=(type:string,buttons:number,button:number)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{buttons,button,pointerId:1,clientX:10,clientY:10});canvas.dispatchEvent(e);return e;};
  expect(dispatch('pointerdown',2,2).defaultPrevented).toBe(false);expect(game.buttons).toBe(2);
  game.pendingButtons=0;dispatch('pointermove',3,0);expect(game.buttons).toBe(3);expect(game.pendingButtons&1).toBe(1);
  game.pendingButtons=0;dispatch('pointermove',2,0);expect(game.buttons).toBe(2);expect(game.pendingButtons).toBe(0);
  dispatch('pointermove',6,1);expect(game.buttons).toBe(6);expect(game.pendingButtons&4).toBe(4);
  stubs.document.querySelector=()=>({});game.frame(10);game.frame(30);expect(steps).toHaveLength(1);expect(steps[0][0]).toBe(0);expect(steps[0][2]).toBe(0);
  game.events.abort();
 }finally{for(const [key,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}
});
