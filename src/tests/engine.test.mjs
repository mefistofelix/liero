import {test,expect} from 'bun:test';
const assert={equal:(a,b,m)=>expect(a,m).toBe(b),deepEqual:(a,b)=>expect(a).toEqual(b),ok:(a,m)=>expect(a,m).toBeTruthy()};
const fileURLToPath=url=>Bun.file(url).name;

import create from '../browser/engine/openliero.mjs';

const engineDir=new URL('../browser/engine/',import.meta.url);
const fresh=()=>create({locateFile:file=>fileURLToPath(new URL(file,engineDir))});
const state=m=>Array.from(m.HEAP32.subarray(m._liero_info()>>2,(m._liero_info()>>2)+12));

test('full-page, split and free-camera rendering do not change the simulation',async()=>{
 const a=await fresh(),b=await fresh();a._liero_start(456,0);b._liero_start(456,0);
 a._liero_view(0,426,240);b._liero_view(1,320,200);
 for(let frame=0;frame<350;frame++){const args=[8,frame&127,0,8,(frame+64)&127,0];a._liero_step(...args);b._liero_step(...args);a._liero_camera(frame%504,frame%350);a._liero_render();b._liero_render();}
 assert.equal(a._liero_hash(),b._liero_hash());a._liero_player(1);a._liero_render();assert.equal(a._liero_hash(),b._liero_hash());
});

test('original weapon graphics and imported Temple level load through the adapter',async()=>{
 const m=await fresh();for(let id=1;id<=40;id++){assert.ok(m._liero_weapon_name(id)>0);const p=m._liero_weapon_icon(id);assert.ok(m.HEAPU8.subarray(p,p+1024).some(v=>v>0));}
 const bytes=new Uint8Array(await Bun.file(new URL('../browser/maps/temple.lev',import.meta.url)).arrayBuffer());m.FS.writeFile('/import.lev',bytes);m._liero_options(0,7,40,2,1);m._liero_loadout(0,0,40);m._liero_start(17,0);
 assert.equal(state(m)[3],7);for(let i=0;i<300;i++)m._liero_step_local(8,96,0,-1,16);assert.equal(state(m)[0],300);assert.ok(m._liero_render()>0);
});
test('kill telemetry reports the lethal original weapon without changing simulation state',async()=>{
 const m=await fresh();m._liero_options(0,99,20,0,0);for(let p=0;p<2;p++)for(let slot=0;slot<5;slot++)m._liero_loadout(p,slot,1);m._liero_start(1,0);
 for(let f=0;f<1000;f++)m._liero_step(8,0,0,8,0,0);
 const hash=m._liero_hash(),offset=m._liero_info()>>2,events=Array.from(m.HEAP32.subarray(offset+32,offset+40));
 expect(events[0]).toBeGreaterThan(0);expect(events[4]).toBeGreaterThan(events[0]);expect(events[1]).toBe(0);expect(events[5]).toBe(1);expect(m._liero_weapon_id(events[2])).toBe(1);expect(m._liero_weapon_id(events[6])).toBe(1);expect(m.HEAP32[offset+44]).toBe(1);expect(m.HEAP32[offset+45]).toBe(1);expect(m._liero_hash()).toBe(hash);
});
test('worm bars expose each player health limit and original reload timer independently of camera',async()=>{
 const m=await fresh();m._liero_options(0,99,100,0,0);for(let p=0;p<2;p++)for(let slot=0;slot<5;slot++)m._liero_loadout(p,slot,1);m._liero_start(1,0);
 const seen=[false,false];
 for(let f=0;f<700;f++){
  m._liero_step(8,0,0,f>350?8:0,64,0);
  const offset=m._liero_info()>>2,values=Array.from(m.HEAP32.subarray(offset+46,offset+52));
  for(let p=0;p<2;p++){expect(values[p*3]).toBeGreaterThan(0);expect(values[p*3+1]).toBeGreaterThanOrEqual(0);expect(values[p*3+1]).toBeLessThanOrEqual(values[p*3+2]);if(values[p*3+1]>0)seen[p]=true;}
  if(f===350){expect(seen[0]).toBe(true);expect(seen[1]).toBe(false);}
 }
 expect(seen).toEqual([true,true]);const hash=m._liero_hash(),offset=m._liero_info()>>2,values=Array.from(m.HEAP32.subarray(offset+46,offset+52));m._liero_player(1);m._liero_info();expect(Array.from(m.HEAP32.subarray(offset+46,offset+52))).toEqual(values);expect(m._liero_hash()).toBe(hash);
});

test('mouse fire works with rope and wheel modifiers, and explicit release wins during scrolling',async()=>{
 const ready=async()=>{const m=await fresh();for(let slot=0;slot<5;slot++)m._liero_loadout(0,slot,1);m._liero_start(321,0);for(let f=0;f<300;f++)m._liero_step(0,64,0,0,64,0);return m;};
 const rope=await ready(),ptr=rope._liero_info()>>2,ammo=rope.HEAP32[ptr+12];rope._liero_step(8|16,64,0,0,64,0);rope._liero_info();expect(rope.HEAP32[ptr+12]).toBe(ammo-1);expect(rope.HEAP32[ptr+5]).toBe(1);
 rope._liero_step(4|16,64,1,0,64,0);rope._liero_info();expect(rope.HEAP32[ptr+5]).toBe(0);
 const wheel=await ready(),offset=wheel._liero_info()>>2,before=wheel.HEAP32[offset+12],slot=wheel.HEAP32[offset+4];wheel._liero_step(8,64,1,0,64,0);wheel._liero_info();expect(wheel.HEAP32[offset+4]).toBe((slot+1)%5);wheel._liero_step(0,64,-1,0,64,0);wheel._liero_info();expect(wheel.HEAP32[offset+12]).toBe(before-1);
});

test('original weapon availability restricts all five slots to the room pool',async()=>{
 const m=await fresh();for(let id=1;id<=40;id++)m._liero_allowed(id,id===1?1:0);m._liero_start(33,0);
 for(let n=0;n<5;n++){m._liero_step(0,96,1,0,32,0);m._liero_step(0,96,0,0,32,0);const p=m._liero_info()>>2;expect(m._liero_weapon_id(m.HEAP32[p+14])).toBe(1);}
});

test('original engine loads upstream assets, spawns and renders opaque pixels',async()=>{
 const m=await fresh();m._liero_start(1234,1);
 for(let i=0;i<300;++i)assert.equal(m._liero_step(0,96,0,0,32,0),1);
 assert.equal(state(m)[0],300);
 const p=m._liero_render(), pixels=m.HEAPU8.subarray(p,p+320*200*4);
 assert.equal(pixels.length,256000);
 assert.ok(pixels.some((v,i)=>i%4!==3&&v!==0),'rendered world must not be blank');
 for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);
});

test('same seed and inputs stay deterministic independently of render frequency',async()=>{
 const a=await fresh(), b=await fresh();a._liero_start(789,0);b._liero_start(789,0);
 for(let frame=0;frame<900;++frame){
  const buttons=(frame%120<60?1:2)|(frame%80<20?8:0)|(frame%45<15?16:0);
  const input=[buttons,frame&127,frame%90===0?1:0,frame%100<50?8:4,(frame+64)&127,0];
  a._liero_step(...input);b._liero_step(...input);
  if(frame%2===0)a._liero_render();if(frame%7===0)b._liero_render();
  if(frame%30===0)assert.equal(a._liero_hash(),b._liero_hash(),`frame ${frame}`);
 }
 assert.deepEqual(state(a),state(b));
});

test('wheel while holding jump changes weapon without launching rope',async()=>{
 const m=await fresh();m._liero_start(1234,0);
 for(let i=0;i<300;++i)m._liero_step(0,96,0,0,32,0);
 const before=state(m)[4];m._liero_step(4,96,1,0,32,0);
 assert.equal(state(m)[4],(before+1)%5);
 assert.equal(state(m)[5],0);
});

test('down never digs; hanging up/down use original rope length controls and Space releases',async()=>{
 const a=await fresh(),b=await fresh();a._liero_start(321,0);b._liero_start(321,0);
 for(let i=0;i<350;i++){a._liero_step(128,64,0,0,64,0);b._liero_step(0,64,0,0,64,0);}
 assert.equal(a._liero_hash(),b._liero_hash());
 const data=new Uint8Array(176400);data.fill(163,0,504*5);data.fill(163,504*345);a.FS.writeFile('/import.lev',data);a._liero_options(0,15,100,0,1);a._liero_start(321,0);
 for(let i=0;i<300;i++)a._liero_step(0,64,0,0,64,0);a._liero_step(16,64,0,0,64,0);
 for(let i=0;i<300;i++)a._liero_step(0,64,0,0,64,0);
 const rope=()=>Array.from(a.HEAP32.subarray((a._liero_info()>>2)+20,(a._liero_info()>>2)+22));
 assert.equal(rope()[1],1);const before=rope()[0];a._liero_step(128,64,0,0,64,0);assert.ok(rope()[0]>before);const longer=rope()[0];a._liero_step(64,64,0,0,64,0);assert.ok(rope()[0]<longer);assert.equal(rope()[1],1);
 a._liero_step(4|64,64,0,0,64,0);assert.equal(state(a)[5],0);assert.equal(rope()[1],0);
});

const wasmPath=new URL('../../.local/build/wasm/openliero.mjs',import.meta.url);
(await Bun.file(wasmPath).exists()?test:test.skip)('JavaScript output matches WASM output for original keyboard fixtures',async()=>{
 const {default:createWasm}=await import(wasmPath.href);
 const a=await fresh(),b=await createWasm({locateFile:file=>fileURLToPath(new URL(file,wasmPath))});
 for(const seed of [1,1234,0xffffffff]){
  a._liero_start(seed,0);b._liero_start(seed,0);
  assert.equal(a._liero_hash(),b._liero_hash(),`initial seed ${seed}`);
  for(let frame=0;frame<1000;++frame){
   const controls=[(frame*13)&127,(frame*37)&127];
   a._liero_step_raw(...controls);b._liero_step_raw(...controls);
   if(frame%10===0)assert.equal(a._liero_hash(),b._liero_hash(),`seed ${seed}, frame ${frame}`);
  }
 }
});
