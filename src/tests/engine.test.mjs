import {test,expect} from 'bun:test';
const assert={equal:(a,b,m)=>expect(a,m).toBe(b),deepEqual:(a,b)=>expect(a).toEqual(b),ok:(a,m)=>expect(a,m).toBeTruthy()};
const fileURLToPath=url=>Bun.file(url).name;

import create from '../browser/engine/openliero.mjs';

const engineDir=new URL('../browser/engine/',import.meta.url);
const fresh=()=>create({locateFile:file=>fileURLToPath(new URL(file,engineDir))});
const state=m=>Array.from(m.HEAP32.subarray(m._liero_info()>>2,(m._liero_info()>>2)+12));

test('restarting a used engine matches a fresh peer before and after throwing a rope',async()=>{
 const a=await fresh(),b=await fresh();
 const start=m=>{m._liero_options(0,15,20,4,0);m._liero_start(789,0);m._liero_participants(3);m._liero_begin_play();};
 start(a);for(let frame=0;frame<200;frame++)a._liero_step(frame===0?16:0,96,0,0,64,0);
 start(a);start(b);expect(a._liero_hash()).toBe(b._liero_hash());
 for(let frame=0;frame<400;frame++){
  const inputs=[frame===100?16:frame>200?8:0,96,0,0,64,0];
  a._liero_step(...inputs);b._liero_step(...inputs);
  expect(a._liero_hash(),`restart frame ${frame}`).toBe(b._liero_hash());
 }
});
test('live rules rescale an ongoing reload without restarting or replacing disabled weapons',async()=>{
 const m=await fresh();m._liero_options(0,99,100,0,0);for(let p=0;p<2;p++)for(let k=0;k<5;k++)m._liero_loadout(p,k,1);m._liero_start(1,0);
 let offset=0;for(let f=0;f<2000;f++){m._liero_step(8,0,0,0,64,0);offset=m._liero_info()>>2;if(m.HEAP32[offset+47]>20)break;}
 const before=m.HEAP32.slice(offset,offset+52);expect(before[47]).toBeGreaterThan(20);
 m._liero_rules_live(0,20,40,2);m._liero_info();const after=m.HEAP32.slice(offset,offset+52);
 expect(after[0]).toBe(before[0]);expect(after[24]).toBe(before[24]);expect(after[25]).toBe(before[25]);
 expect(after[47]).toBe(Math.ceil(before[47]*after[48]/before[48]));expect(after[47]).toBeLessThan(before[47]);
 for(let id=1;id<=40;id++)m._liero_allowed(id,id===35?1:0);m._liero_rules_live(0,20,40,2);m._liero_info();expect(m._liero_weapon_id(m.HEAP32[offset+14])).toBe(1);const ammo=m.HEAP32[offset+12];for(let f=0;f<5;f++)m._liero_step(8,0,0,0,64,0);m._liero_info();expect(m.HEAP32[offset+12]).toBe(ammo);
});
test('live color changes preserve simulation and stop records an original suicide',async()=>{
 const m=await fresh();m._liero_start(178,0);for(let f=0;f<300;f++)m._liero_step(0,64,0,0,64,0);
 const before=m._liero_hash(),pixels=m.HEAPU8.slice(m._liero_render(),m._liero_render()+320*200*4);
 m._liero_color(0,63,0,0);expect(m._liero_hash()).toBe(before);
 const ptr=m._liero_render();expect(m.HEAPU8.slice(ptr,ptr+pixels.length)).not.toEqual(pixels);
 m._liero_step(256,64,0,0,64,0);const p=m._liero_info()>>2;
 expect(m.HEAP32[p+44]).toBe(1);expect(m.HEAP32[p+33]).toBe(0);expect(m.HEAP32[p+26]).toBe(0);
});

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
test('self-kills from secondary fragments retain the weapon without changing gameplay',async()=>{
 const m=await fresh(),bytes=new Uint8Array(await Bun.file(new URL('../browser/maps/temple.lev',import.meta.url)).arrayBuffer());m.FS.writeFile('/import.lev',bytes);
 // Death frames and state hashes captured before the telemetry-only correction.
 for(const [id,deathFrame,hash]of [[20,1367,448806626],[28,323,2504931467]]){
  m._liero_options(0,99,20,0,1);for(let p=0;p<2;p++)for(let slot=0;slot<5;slot++)m._liero_loadout(p,slot,id);
  m._liero_start(1,0);m._liero_participants(1);m._liero_begin_play();
  for(let frame=0;frame<=deathFrame;frame++)m._liero_step(8,32,0,0,64,0);
  const offset=m._liero_info()>>2;expect(m.HEAP32[offset+32]).toBe(1);expect(m.HEAP32[offset+33]).toBe(0);
  expect(m._liero_weapon_id(m.HEAP32[offset+34])).toBe(id);expect(m.HEAP32[offset+35]).toBe(deathFrame);expect(m._liero_hash()>>>0).toBe(hash);
 }
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

test('mouse aim preserves subpixels and original shot/rope origins within the 128 native angles',async()=>{
 const m=await fresh();m._liero_start(321,0);m._liero_begin_play();m._liero_view(0,504,350);
 for(const player of [0,1]){
  m._liero_player(player);const offset=m._liero_info()>>2,x=m.HEAP32[offset+24+player*4],y=m.HEAP32[offset+25+player*4],hash=m._liero_hash();
  expect(m._liero_aim(player,x+10,y-1,8)).toBe(96);
  expect(m._liero_aim(player,x+10,y,16)).toBe(96);
  expect(m._liero_aim(player,x+10,y-1,8|16)).toBe(96);
  expect(m._liero_aim(player,x+10,y-1+.20,8)).toBe(96);
  expect(m._liero_aim(player,x+10,y-1+.30,8)).toBe(97);
  for(let a=0;a<128;a++){
   const radians=a*Math.PI/64;
   expect(m._liero_aim(player,x-50*Math.sin(radians),y-1+50*Math.cos(radians),8)).toBe(a);
  }
  expect(m._liero_hash()).toBe(hash);
 }
});

test('mouse fire works with rope and wheel modifiers, and explicit release wins during scrolling',async()=>{
 const ready=async()=>{const m=await fresh();for(let slot=0;slot<5;slot++)m._liero_loadout(0,slot,1);m._liero_start(321,0);for(let f=0;f<300;f++)m._liero_step(0,64,0,0,64,0);return m;};
 const rope=await ready(),ptr=rope._liero_info()>>2,ammo=rope.HEAP32[ptr+12];rope._liero_step(8|16,64,0,0,64,0);rope._liero_info();expect(rope.HEAP32[ptr+12]).toBe(ammo-1);expect(rope.HEAP32[ptr+5]).toBe(1);
 rope._liero_step(0,64,0,0,64,0);rope._liero_step(16,64,0,0,64,0);rope._liero_info();expect(rope.HEAP32[ptr+5]).toBe(1);
 rope._liero_step(4|16,64,1,0,64,0);rope._liero_info();expect(rope.HEAP32[ptr+5]).toBe(0);
 const wheel=await ready(),offset=wheel._liero_info()>>2,before=wheel.HEAP32[offset+12],slot=wheel.HEAP32[offset+4];wheel._liero_step(8,64,1,0,64,0);wheel._liero_info();expect(wheel.HEAP32[offset+4]).toBe((slot+1)%5);wheel._liero_step(0,64,-1,0,64,0);wheel._liero_info();expect(wheel.HEAP32[offset+12]).toBe(before-1);
});

test('room restrictions skip unavailable slots while retaining the complete personal loadout',async()=>{
 const m=await fresh(),loadout=[19,25,9,36,35];for(let p=0;p<2;p++)for(let k=0;k<5;k++)m._liero_loadout(p,k,loadout[k]);
 for(let id=1;id<=40;id++)m._liero_allowed(id,id===25||id===35?1:0);m._liero_start(33,0);
 for(let f=0;f<300;f++)m._liero_step(0,96,0,0,32,0);
 const selected=()=>{const p=m._liero_info()>>2;return [m.HEAP32[p+4],m._liero_weapon_id(m.HEAP32[p+14])];};
 expect(selected()).toEqual([1,25]);for(let n=0;n<4;n++){m._liero_step(0,96,1,0,32,0);m._liero_step(0,96,0,0,32,0);expect(selected()).toEqual(n%2?[1,25]:[4,35]);}
 for(let id=1;id<=40;id++)m._liero_allowed(id,1);m._liero_rules_live(0,15,100,4);
 const seen=new Set();for(let n=0;n<5;n++){m._liero_step(0,96,1,0,32,0);m._liero_step(0,96,0,0,32,0);seen.add(selected()[1]);}expect([...seen].sort()).toEqual([...loadout].sort());
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

test('held W does not release a launched or rethrown rope while it is flying',async()=>{
 const m=await fresh(),data=new Uint8Array(176400);data.fill(163,0,504*5);data.fill(163,504*345);m.FS.writeFile('/import.lev',data);m._liero_options(0,99,30,0,1);m._liero_start(321,0);m._liero_begin_play();
 for(let i=0;i<300;i++)m._liero_step(0,64,0,0,64,0);
 m._liero_step(64,64,0,0,64,0);m._liero_step(64|16,64,0,0,64,0);expect(state(m)[5]).toBe(1);
 for(let i=0;i<50;i++){m._liero_step(64,64,0,0,64,0);expect(state(m)[5]).toBe(1);}
 m._liero_step(64|16,64,0,0,64,0);expect(state(m)[5]).toBe(1);m._liero_step(64,64,0,0,64,0);expect(state(m)[5]).toBe(1);
 m._liero_step(64|4,64,0,0,64,0);expect(state(m)[5]).toBe(0);
});
test('Play spawns immediately without fire and live loadout reordering preserves ammo and reload',async()=>{
 const m=await fresh();m._liero_options(0,99,30,0,0);const loadout=[19,25,9,36,35];loadout.forEach((id,k)=>m._liero_loadout(0,k,id));m._liero_start(123,0);m._liero_begin_play();let p=m._liero_info()>>2;
 expect(m.HEAP32[p+26]).toBe(1);expect(m.HEAP32[p+30]).toBe(1);const weapon=m._liero_weapon_id(m.HEAP32[p+27]),ammo=m.HEAP32[p+12],reload=m.HEAP32[p+47],cycle=m.HEAP32[p];
 [...loadout].reverse().forEach((id,k)=>m._liero_loadout(0,k,id));m._liero_loadout_live(0);m._liero_info();expect(m.HEAP32[p]).toBe(cycle);expect(m._liero_weapon_id(m.HEAP32[p+27])).toBe(weapon);expect(m.HEAP32[p+12]).toBe(ammo);expect(m.HEAP32[p+47]).toBe(reload);
 for(let k=0;k<5;k++)m._liero_loadout(0,k,1);m._liero_loadout_live(0);m._liero_info();expect(m._liero_weapon_id(m.HEAP32[p+27])).toBe(1);expect(m.HEAP32[p+47]).toBeGreaterThan(0);expect(m.HEAP32[p+26]).toBe(1);
 m._liero_step(256,64,0,0,64,0);for(let f=0;f<350;f++)m._liero_step(0,64,0,0,64,0);m._liero_info();expect(m.HEAP32[p+26]).toBe(1);
});

test('instant Play uses valid original Temple spawn positions instead of the uninitialized origin',async()=>{
 const m=await fresh(),temple=new Uint8Array(await Bun.file(new URL('../browser/maps/temple.lev',import.meta.url)).arrayBuffer());m.FS.writeFile('/import.lev',temple);m._liero_options(0,99,20,0,1);
 for(const seed of [1,123,789])for(const mask of [1,2,3]){
  m._liero_start(seed,0);m._liero_participants(mask);m._liero_begin_play();m._liero_view(0,504,350);m._liero_camera(252,175);
  const ptr=m._liero_info()>>2;
  for(let player=0;player<2;player++){if(!(mask&(1<<player)))continue;const base=ptr+24+player*4;expect(m.HEAP32[base+2]).toBe(1);expect(m.HEAP32[base]).toBeGreaterThan(5);expect(m.HEAP32[base]).toBeLessThan(499);expect(m.HEAP32[base+1]).toBeGreaterThan(5);expect(m.HEAP32[base+1]).toBeLessThan(345);}
 }
});

test('instant Play initializes spawns across all bundled levels and generated terrain',async()=>{
 const catalog=await Bun.file(new URL('../browser/maps/catalog.json',import.meta.url)).json(),m=await fresh();
 const check=name=>{m._liero_begin_play();m._liero_view(0,504,350);m._liero_camera(252,175);const ptr=m._liero_info()>>2;for(let player=0;player<2;player++){const base=ptr+24+player*4;expect(m.HEAP32[base+2],name).toBe(1);expect(m.HEAP32[base],name).toBeGreaterThan(0);expect(m.HEAP32[base],name).toBeLessThan(504);expect(m.HEAP32[base+1],name).toBeGreaterThan(0);expect(m.HEAP32[base+1],name).toBeLessThan(350);}};
 for(const level of catalog){const data=new Uint8Array(await Bun.file(new URL('../browser'+level.asset,import.meta.url)).arrayBuffer());m.FS.writeFile('/import.lev',data);m._liero_options(0,99,20,0,1);m._liero_start(789,0);check(level.name);}
 for(const seed of [1,123,789,0xffffffff]){m._liero_options(0,99,20,0,0);m._liero_start(seed,0);check('Generated '+seed);}
},60000);
