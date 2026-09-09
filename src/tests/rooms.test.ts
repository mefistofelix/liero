import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {localDatabase} from '../server/local-database.ts';
import worker from '../server/worker.js';
const settings={mode:0,lives:15,loading:100,bonuses:4,rotation:['random','temple']};
async function fixture(){const sql=new Database(':memory:');const DB=await localDatabase(sql,new URL('../server/migrations/',import.meta.url));return {sql,request:async(token:string,path:string,method='GET',body?:unknown,invite='')=>{const req=new Request('https://game.test/api'+path,{method,headers:{Authorization:'Bearer '+token.padStart(64,'0'),'Content-Type':'application/json',...(invite?{'X-Room-Invite':invite}:{})},body:body?JSON.stringify(body):undefined});Object.defineProperty(req,'cf',{value:{continent:'EU'}});const response=await worker.fetch(req,{DB});return {status:response.status,data:await response.json()};}};}
test('private rooms hide from explorer and require invite; host owns settings; guests spectate',async()=>{
 const f=await fixture();try{
 const created=await f.request('a','/rooms','POST',{name:'Private test',playerName:'Host',color:'#ee3355',region:'auto',private:true,settings});expect(created.status).toBe(201);const {id,invite}=created.data;
 expect((await f.request('b','/rooms')).data.rooms).toHaveLength(0);
 expect((await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest'})).status).toBe(404);
 expect((await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest',color:'#123456'},invite)).data.seat).toBe(-1);
 const state=await f.request('b',`/rooms/${id}/state`);expect(state.data.members).toHaveLength(2);expect(state.data.members.some(m=>m.color==='#ee3355')).toBe(true);
 expect((await f.request('b',`/rooms/${id}/settings`,'PUT',{name:'Hijack',settings})).status).toBe(403);
 expect((await f.request('b',`/rooms/${id}/seat`,'POST',{play:true})).data.seat).toBe(0);
 expect((await f.request('a',`/rooms/${id}`,'DELETE')).status).toBe(200);
 expect((await f.request('b',`/rooms/${id}/state`)).status).toBe(404);
 }finally{f.sql.close();}
});
test('room seats cannot be overbooked; chat and signaling are member scoped',async()=>{
 const f=await fixture();try{
 const {id}= (await f.request('a','/rooms','POST',{name:'Room',playerName:'Host',region:'EU',settings})).data;
 for(const token of ['b','c'])expect((await f.request(token,`/rooms/${id}/join`,'POST',{name:token})).status).toBe(200);
 expect((await f.request('a',`/rooms/${id}/seat`,'POST',{play:true})).data.seat).toBe(0);
 const seats=await Promise.all(['b','c'].map(token=>f.request(token,`/rooms/${id}/seat`,'POST',{play:true})));expect(seats.map(s=>s.status).sort()).toEqual([200,409]);
 expect((await f.request('d',`/rooms/${id}/chat`,'POST',{message:'Not a member'})).status).toBe(403);
 expect((await f.request('b',`/rooms/${id}/chat`,'POST',{message:'<script>test</script>'})).status).toBe(200);
 const state=(await f.request('a',`/rooms/${id}/state`)).data;expect(state.chat[0].message).toBe('<script>test</script>');
 expect((await f.request('b',`/rooms/${id}/signals`,'POST',{data:{type:'offer',sdp:'test'}})).status).toBe(200);
 expect((await f.request('a',`/rooms/${id}/signals`)).data.signals).toHaveLength(1);expect((await f.request('c',`/rooms/${id}/signals`)).data.signals).toHaveLength(0);
 }finally{f.sql.close();}
});
test('room discovery is worldwide and stale hosts disappear',async()=>{
 const f=await fixture();try{
 const create=(token:string,region:string)=>f.request(token,'/rooms','POST',{name:'Quick match',playerName:token,region,settings,auto:true});
 const a=await create('a','EU'),b=await create('b','NA'),c=await create('c','EU');expect(a.data.id).toBe(c.data.id);expect(b.data.id).toBe(c.data.id);expect(c.data.seat).toBe(-1);
 f.sql.query('UPDATE rooms SET expires_at=0 WHERE id=?').run(a.data.id);
 const list=(await f.request('d','/rooms')).data.rooms;expect(list).toHaveLength(0);
 }finally{f.sql.close();}
});
test('members update only their own live name and color',async()=>{
 const f=await fixture();try{
  const {id}=(await f.request('a','/rooms','POST',{name:'Profile test',playerName:'Host',settings})).data;
  await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest'});
  expect((await f.request('b',`/rooms/${id}/profile`,'PUT',{name:'Renamed',color:'#ff8844',player:'a'})).status).toBe(200);
  const room=(await f.request('a',`/rooms/${id}/state`)).data;
  expect(room.members.find(m=>m.name==='Renamed').color).toBe('#ff8844');expect(room.members.some(m=>m.name==='Host')).toBe(true);
  expect((await f.request('b',`/rooms/${id}/profile`,'PUT',{name:'Bad',color:'red'})).status).toBe(400);
 }finally{f.sql.close();}
});
test('host can spectate while both seats are held by guests, and a playing member can return to spectating',async()=>{
 const f=await fixture();try{
 const created=await f.request('a','/rooms','POST',{name:'Spectator host',playerName:'Host',region:'EU',settings});expect(created.data.seat).toBe(-1);const id=created.data.id;
 for(const key of ['b','c'])await f.request(key,`/rooms/${id}/join`,'POST',{name:key});
 const seats=await Promise.all(['b','c'].map(key=>f.request(key,`/rooms/${id}/seat`,'POST',{play:true})));expect(seats.map(v=>v.data.seat).sort()).toEqual([0,1]);
 await f.request('a',`/rooms/${id}/phase`,'PUT',{phase:'playing'});
 expect((await f.request('b',`/rooms/${id}/seat`,'POST',{play:false})).data.seat).toBe(-1);
 expect((await f.request('a',`/rooms/${id}/seat`,'POST',{play:true})).data.seat).toBe(0);
 expect((await f.request('b',`/rooms/${id}/seat`,'POST',{play:true})).status).toBe(409);
 }finally{f.sql.close();}
});
test('room creation needs no region or cf metadata, and records player and host flags',async()=>{
 const sql=new Database(':memory:'),DB=await localDatabase(sql,new URL('../server/migrations/',import.meta.url));
 try{const send=async(token:string,path:string,data?:unknown)=>{const request=new Request('https://game.test/api'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token.padStart(64,'0'),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const response=await worker.fetch(request,{DB});return {status:response.status,value:await response.json()};};
 const created=await send('a','/rooms',{name:'Worldwide',playerName:'Host',country:'IT',settings});expect(created.status).toBe(201);
 await send('b','/rooms/'+created.value.id+'/join',{name:'Guest',country:'DE'});
 const room=(await send('a','/rooms/'+created.value.id+'/state')).value;expect(room.country).toBe('IT');expect(room.members.map(m=>m.country).sort()).toEqual(['DE','IT']);
 }finally{sql.close();}
});

test('room weapon availability is host-owned, validated and persisted',async()=>{
 const f=await fixture();try{const {id}=(await f.request('a','/rooms','POST',{name:'Weapon pool',playerName:'Host',region:'EU',settings})).data;
 await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest'});
 const change=(token:string,pool:number[])=>f.request(token,`/rooms/${id}/settings`,'PUT',{name:'Weapon pool',settings:{...settings,allowedWeapons:pool}});
 expect((await change('b',[1])).status).toBe(403);expect((await change('a',[])).status).toBe(400);expect((await change('a',[41])).status).toBe(400);expect((await change('a',[1,5,9])).status).toBe(200);
 expect((await f.request('b',`/rooms/${id}/state`)).data.settings.allowedWeapons).toEqual([1,5,9]);
 }finally{f.sql.close();}
});

test('quit removes membership immediately, fences late joins and cannot delete a later visit',async()=>{
 const f=await fixture();try{
  const {id}=(await f.request('a','/rooms','POST',{name:'Re-entry test',playerName:'Host',settings})).data;
  await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest'});
  await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest'});
  expect((await f.request('a',`/rooms/${id}/state`)).data.members).toHaveLength(2);
  expect((await f.request('b','/rooms','DELETE')).status).toBe(200);
  expect((await f.request('a',`/rooms/${id}/state`)).data.members).toHaveLength(1);
  expect((await f.request('b',`/rooms/${id}/join`,'POST',{name:'Guest'})).status).toBe(409);
  await f.request('c',`/rooms/${id}/join`,'POST',{name:'Guest'});
  await f.request('b','/rooms','DELETE');
  const room=(await f.request('a',`/rooms/${id}/state`)).data;
  expect(room.members).toHaveLength(2);expect(room.members.filter(m=>m.name==='Guest')).toHaveLength(1);
  await f.request('d','/rooms','DELETE');
  expect((await f.request('d','/rooms','POST',{name:'Late creation',playerName:'Late',settings})).status).toBe(409);
  await f.request('a','/rooms','DELETE');expect((await f.request('c',`/rooms/${id}/state`)).status).toBe(404);
 }finally{f.sql.close();}
});


test('a room accepts the complete bundled map rotation from Select all',async()=>{
 const f=await fixture();try{
  const catalog=await Bun.file(new URL('../browser/maps/catalog.json',import.meta.url)).json(),rotation=['random','temple',...catalog.map((level:any)=>level.id)];
  const {id}=(await f.request('a','/rooms','POST',{name:'All maps',playerName:'Host',settings})).data;
  const updated=await f.request('a','/rooms/'+id+'/settings','PUT',{name:'All maps',settings:{...settings,rotation}});
  expect(updated.status).toBe(200);expect((await f.request('a','/rooms/'+id+'/state')).data.settings.rotation).toEqual(rotation);
 }finally{f.sql.close();}
});
