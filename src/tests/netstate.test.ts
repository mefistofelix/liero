import {test,expect} from 'bun:test';
import create from '../browser/engine/openliero.mjs';
import {applyLiveLoadout,applyLiveRules} from '../browser/netgame.ts';
const fresh=()=>create({locateFile:file=>Bun.file(new URL('../browser/engine/'+file,import.meta.url)).name});
const start=(e:any,seed:number)=>{e._liero_options(0,99,20,4,0);e._liero_start(seed,0);e._liero_begin_play();e._liero_net_enable();};
const snapshot=(e:any)=>{const n=e._liero_net_save(1);expect(n).toBeGreaterThan(353000);return e.HEAPU8.slice(e._liero_net_data(1),e._liero_net_data(1)+n);};
const restore=(e:any,data:Uint8Array)=>{const p=e._liero_net_buffer();e.HEAPU8.set(data,p);return e._liero_net_load(data.length);};
const step=(e:any,f:number)=>e._liero_step((f%151<110?8:0)|(f%47<30?16:0)|(f%81<40?1:2),f&127,f%41===0?1:0,8|(f%37<20?16:0)|(f%113<60?64:128),(f*3)&127,f%73===0?-1:0);

test('complete checkpoints preserve ongoing native simulation across fresh engines and restore loops',async()=>{
 const a=await fresh(),b=await fresh();start(a,19);start(b,819);
 for(let f=0;f<1400;f++){
  if(f===600){applyLiveRules(a,{mode:0,lives:99,loading:70,bonuses:3,allowedWeapons:[1,8,20,28,35]});applyLiveLoadout(a,0,[28,20,8,1,35]);}
  step(a,f);
  if(f%100===0){const saved=snapshot(a);expect(restore(b,saved)).toBe(1);expect(snapshot(b)).toEqual(saved);}
  else{step(b,f);expect(b._liero_net_hash()).toBe(a._liero_net_hash());}
  if(f%7===0)a._liero_render();if(f%3===0)b._liero_render();
 }
 const saved=snapshot(a);for(let i=0;i<10;i++){expect(a._liero_net_restore(1)).toBe(1);step(a,1401);}
 expect(restore(b,saved)).toBe(1);step(b,1401);expect(snapshot(a)).toEqual(snapshot(b));
});

test('malformed checkpoints are rejected atomically',async()=>{
 const e=await fresh();start(e,2);for(let f=0;f<200;f++)step(e,f);const good=snapshot(e);
 const bad=good.slice();bad[0]^=1;
 for(const bytes of [bad,good.slice(0,good.length-1),new Uint8Array([...good,0])]){
  expect(restore(e,bytes)).toBe(0);expect(snapshot(e)).toEqual(good);
 }
});

test('a rope anchored to the other worm restores the anchor and forces on both players',async()=>{
 const a=await fresh(),b=await fresh();
 for(const e of [a,b]){e.FS.writeFile('/import.lev',new Uint8Array(176400));e._liero_options(0,99,20,0,1);e._liero_start(4,0);e._liero_begin_play();e._liero_net_enable();}
 const fixture=snapshot(a),view=new DataView(fixture.buffer),info=a.HEAP32.slice(a._liero_info()>>2,(a._liero_info()>>2)+52),offsets:number[]=[];
 // Locate the two known spawn vectors in the pointer-free snapshot. Editing a
 // checkpoint fixture avoids adding test-only teleport APIs to the shipped engine.
 for(let p=0;p<2;p++){
  const x=(info[24+p*4]+info[40])*65536,y=(info[25+p*4]+info[41])*65536,matches:number[]=[];
  for(let i=353000;i<fixture.length-16;i++)if(view.getInt32(i,true)===x&&view.getInt32(i+4,true)===y&&view.getInt32(i+8,true)===0&&view.getInt32(i+12,true)===0)matches.push(i);
  expect(matches).toHaveLength(1);offsets.push(matches[0]);view.setInt32(matches[0],(240+p*35)*65536,true);view.setInt32(matches[0]+4,170*65536,true);
 }
 expect(restore(a,fixture)).toBe(1);let attached:Uint8Array|undefined;
 for(let f=0;f<20;f++){
  const ptr=a._liero_info()>>2,angle=a._liero_aim(0,275-a.HEAP32[ptr+40],170-a.HEAP32[ptr+41],16);
  a._liero_step(16|64,angle,0,0,96,0);const bytes=snapshot(a),r=offsets[0]+78;
  if(bytes[r]===1&&bytes[r+1]===1&&new DataView(bytes.buffer).getInt32(r+2,true)===1){attached=bytes;break;}
 }
 expect(attached).toBeDefined();expect(restore(b,attached!)).toBe(1);
 for(let f=0;f<120;f++){
  const buttons=f<40?64:f===40?4:f===42?16:0;
  for(const e of [a,b])e._liero_step(buttons,96,0,f===80?256:2,32,0);
  expect(snapshot(a)).toEqual(snapshot(b));
 }
});

const wasmPath=new URL('../../.local/build/wasm/openliero.mjs',import.meta.url);
test.skipIf(!await Bun.file(wasmPath).exists())('checkpoints are portable between JS and WASM with continuing simulation',async()=>{
 const wasmCreate=(await import(wasmPath.href)).default,a=await fresh(),b=await wasmCreate({locateFile:file=>Bun.file(new URL(file,wasmPath)).name});
 start(a,71);start(b,981);
 for(let f=0;f<800;f++){step(a,f);if(f===0||f===350)expect(restore(b,snapshot(a))).toBe(1);else step(b,f);expect(b._liero_net_hash()).toBe(a._liero_net_hash());}
 expect(snapshot(b)).toEqual(snapshot(a));
});
