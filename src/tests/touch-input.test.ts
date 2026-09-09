import {test,expect} from 'bun:test';
import {TouchInput} from '../browser/touch-input.ts';
import {LocalGame} from '../browser/engine.ts';

const point={x:100,y:80};
test('one finger aims and holds fire; a quick tap survives until an input tick',()=>{
 const input=new TouchInput();input.down(1,point);
 expect(input.sample()).toBe(8);expect(input.sample()).toBe(8);
 input.move(1,{x:152.5,y:91.5});expect(input.aim).toEqual({x:152.5,y:91.5});
 input.up(1);expect(input.sample()).toBe(0);
 input.down(2,point);input.up(2);expect(input.sample(false)).toBe(8);
 expect(input.sample(false)).toBe(8);expect(input.sample()).toBe(8);expect(input.sample()).toBe(0);
});

test('two and three fingers supersede pending fire without moving aim to an added finger',()=>{
 const input=new TouchInput();input.down(1,point);input.down(2,{x:300,y:170});
 expect(input.aim).toEqual(point);expect(input.sample()).toBe(16);
 input.move(2,{x:330,y:180});expect(input.aim).toEqual(point);expect(input.sample()).toBe(16);
 input.down(3,{x:350,y:160});expect(input.sample()).toBe(4);expect(input.sample()).toBe(0);
 input.down(4,point);expect(input.sample()).toBe(0);
 for(const id of [4,3,2,1]){input.up(id);expect(input.sample()).toBe(0);}
 input.down(5,point);expect(input.sample()).toBe(8);
});

test('a release chord replaces even a rope press not yet consumed by the network',()=>{
 const input=new TouchInput();input.down(1,point);input.down(2,point);
 expect(input.sample(false)).toBe(16);input.down(3,point);
 for(const id of [1,2,3])input.up(id);
 expect(input.sample(false)).toBe(4);expect(input.sample()).toBe(4);expect(input.sample()).toBe(0);
});

test('lifting a rope finger never fires; rapid rethrow contains a native release edge',()=>{
 const input=new TouchInput();input.down(1,point);input.down(2,point);expect(input.sample()).toBe(16);
 input.up(2);input.down(3,point);
 expect(input.sample(false)).toBe(0);expect(input.sample(false)).toBe(0);
 expect(input.sample()).toBe(0);expect(input.sample()).toBe(16);
 input.up(1);expect(input.sample()).toBe(0);input.move(3,{x:2,y:3});expect(input.sample()).toBe(0);
 input.clear();input.move(3,point);input.up(3);expect(input.aim).toBeUndefined();expect(input.sample()).toBe(0);
});

test('touch events feed engine intents, suppress emulated mouse clicks, and stop at menus/cancellation',()=>{
 let menu=false,time=1;const steps:number[][]=[],aims:number[][]=[],cameras:number[][]=[];
 const stubs:any={window:new EventTarget(),document:Object.assign(new EventTarget(),{querySelector:()=>menu?{}:null}),ImageData:class{data=new Uint8ClampedArray(320*200*4)},ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1};
 const previous=Object.fromEntries(Object.keys(stubs).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [key,value] of Object.entries(stubs))Object.defineProperty(globalThis,key,{value,configurable:true});
 try{
  const canvas:any=Object.assign(new EventTarget(),{width:320,height:200,parentElement:{},getContext:()=>({putImageData(){}}),getBoundingClientRect:()=>({left:10,top:20,width:640,height:400}),focus(){},setPointerCapture(){}});
  const engine:any={HEAPU8:new Uint8Array(320*200*4),HEAP32:new Int32Array(52),_liero_render:()=>0,_liero_info:()=>0,_liero_aim:(...input:number[])=>{aims.push(input);return 64;},_liero_step:(...input:number[])=>{steps.push(input);return 1;},_liero_camera:(...input:number[])=>cameras.push(input)};
  const game:any=new LocalGame(engine,canvas,()=>{},()=>{});game.frame(time);
  const step=()=>{game.frame(time+=15);return steps.at(-1)![0];};
  const dispatch=(type:string,id:number,x=110,y=100)=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:id,pointerType:'touch',isPrimary:id===1,buttons:type==='pointerup'?0:1,clientX:x,clientY:y});canvas.dispatchEvent(event);return event;};
  expect(dispatch('pointerdown',1).defaultPrevented).toBe(true);
  dispatch('pointerdown',2,400,300);expect(step()).toBe(16);expect(aims.at(-1)?.slice(1,3)).toEqual([50,40]);
  dispatch('pointermove',1,210,200);expect(step()).toBe(16);expect(aims.at(-1)?.slice(1,3)).toEqual([100,90]);
  const mouse=new Event('mousedown',{cancelable:true});Object.assign(mouse,{buttons:1,button:0,sourceCapabilities:{firesTouchEvents:true}});canvas.dispatchEvent(mouse);expect(game.buttons).toBe(0);
  dispatch('pointerdown',3);expect(step()).toBe(4);
  for(const id of [3,2,1]){dispatch('pointerup',id);dispatch('lostpointercapture',id);expect(step()).toBe(0);}
  dispatch('pointerdown',1);dispatch('pointerup',1);dispatch('lostpointercapture',1);expect(step()).toBe(8);expect(step()).toBe(0);
  dispatch('pointerdown',1);dispatch('pointercancel',1);expect(step()).toBe(0);
  dispatch('pointerdown',1);dispatch('lostpointercapture',1);expect(step()).toBe(0);
  dispatch('pointerdown',1);menu=true;expect(step()).toBe(0);menu=false;dispatch('pointermove',1);expect(step()).toBe(0);
  dispatch('pointerdown',2);stubs.window.dispatchEvent(new Event('blur'));game.frame(time+=15);expect(step()).toBe(0);
  game.freeCamera=true;game.camera={x:252,y:175};dispatch('pointerdown',1);dispatch('pointermove',1,150,120);
  expect(cameras.at(-1)).toEqual([232,165]);expect(step()).toBe(0);
  game.events.abort();
 }finally{for(const [key,descriptor] of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete (globalThis as any)[key];}}
});
