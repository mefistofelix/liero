import {detectRegion} from './matchmaker.js';
import {requestCountry} from './geography.js';
const TTL=120;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const statement=(db,sql,...values)=>db.prepare(sql).bind(...values);
async function query(db,sql,...values){return (await db.batch([statement(db,sql,...values)]))[0].results;}
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');
const short=(s,length)=>typeof s==='string'&&s.trim().length&&s.length<=length?s.trim():fail('Invalid text.');
function rules(s){
 if(!s||typeof s!=='object')fail('Missing settings.');
 const integer=(k,lo,hi)=>Number.isInteger(s[k])&&s[k]>=lo&&s[k]<=hi?s[k]:fail(`Invalid setting: ${k}`);
 const pool=s.allowedWeapons??Array.from({length:40},(_,i)=>i+1);
 if(!Array.isArray(pool)||!pool.length||pool.length>40||pool.some(id=>!Number.isInteger(id)||id<1||id>40))fail('Enable at least one valid weapon.');
 return {mode:integer('mode',0,3),lives:integer('lives',1,99),loading:integer('loading',1,1000),bonuses:integer('bonuses',0,20),allowedWeapons:[...new Set(pool)],rotation:Array.isArray(s.rotation)&&s.rotation.length>0&&s.rotation.length<=1000?s.rotation.map(n=>short(n,180)):fail('Select at least one map.')};
}
async function body(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail('Use JSON.',415);
 let bytes=0,text='';const reader=request.body?.getReader(),decoder=new TextDecoder();
 if(reader)for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>65536){await reader.cancel();fail('Request too large.',413);}text+=decoder.decode(r.value,{stream:true});}
 let parsed;try{parsed=JSON.parse(text+decoder.decode());}catch{fail('Invalid JSON.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))fail('Invalid JSON.');return parsed;
}
function publicRoom(r,count=0){return {id:r.id,name:r.name,region:r.region,country:r.country||'',private:!!r.private,settings:JSON.parse(r.settings),phase:r.phase,count,capacity:16};}
export async function roomAPI(request,env,key){
 const db=env.DB,url=new URL(request.url),parts=url.pathname.split('/').filter(Boolean),id=parts[2],action=parts[3]||'',now=Math.floor(Date.now()/1000);
 try{
  await db.batch([statement(db,'DELETE FROM rooms WHERE expires_at<=?',now),statement(db,'DELETE FROM members WHERE expires_at<=?',now),statement(db,'DELETE FROM room_signals WHERE expires_at<=?',now),statement(db,'DELETE FROM room_departures WHERE expires_at<=?',now)]);
  if(!id&&request.method==='GET'){
   const rows=await query(db,`SELECT r.*,COUNT(m.player) count,SUM(CASE WHEN m.seat>=0 THEN 1 ELSE 0 END) players FROM rooms r LEFT JOIN members m ON m.room=r.id WHERE r.private=0 GROUP BY r.id ORDER BY r.name LIMIT 100`);
   return json({rooms:rows.map(r=>({...publicRoom(r,r.count),players:r.players})),region:detectRegion(request.cf)});
  }
  if(!key)fail('Invalid identity.',401);
  if(!id&&request.method==='DELETE'){
   await db.batch([statement(db,'INSERT INTO room_departures(player,expires_at) VALUES(?,?) ON CONFLICT(player) DO UPDATE SET expires_at=excluded.expires_at',key,now+300),statement(db,'DELETE FROM rooms WHERE owner=?',key),statement(db,'DELETE FROM members WHERE player=?',key)]);
   return json({ok:true});
  }
  if((await query(db,'SELECT 1 FROM room_departures WHERE player=?',key)).length)fail('This room session has ended. Join again.',409);
  if(!id&&request.method==='POST'){
   const b=await body(request),region=detectRegion(request.cf)||'',country=requestCountry(request,b.country);
   const existing=await query(db,'SELECT room FROM members WHERE player=?',key);if(existing.length)fail('Leave your current room first.',409);
   const settings=rules(b.settings),name=short(b.name,48),playerName=short(b.playerName,20),roomId=crypto.randomUUID(),invite=crypto.randomUUID()+crypto.randomUUID();
   const statements=[];
   // Legacy API auto-join also enters as a spectator. The browser selects
   // candidates using measured WebRTC RTT before calling the join endpoint.
   if(b.auto===true)statements.push(statement(db,`INSERT INTO members(room,player,name,seat,expires_at)
    SELECT r.id,?,?,-1,? FROM rooms r WHERE r.private=0
    AND (SELECT COUNT(*) FROM members m WHERE m.room=r.id)<16 AND NOT EXISTS(SELECT 1 FROM room_departures WHERE player=?) ORDER BY r.id LIMIT 1`,key,playerName,now+TTL,key));
   statements.push(statement(db,`INSERT INTO rooms(id,owner,name,region,private,invite,settings,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM members WHERE player=?) AND NOT EXISTS(SELECT 1 FROM room_departures WHERE player=?)`,roomId,key,name,region,b.auto?0:(b.private?1:0),await hash(invite),JSON.stringify(settings),now+TTL,key,key));
   statements.push(statement(db,`INSERT INTO members(room,player,name,seat,expires_at) SELECT ?,?,?,-1,? WHERE EXISTS(SELECT 1 FROM rooms WHERE id=?)`,roomId,key,playerName,now+TTL,roomId));
   statements.push(statement(db,'UPDATE rooms SET country=? WHERE id=?',country,roomId));
   statements.push(statement(db,'UPDATE members SET country=? WHERE player=?',country,key));
   statements.push(statement(db,'UPDATE members SET color=? WHERE player=?',/^#[a-f0-9]{6}$/i.test(b.color)?b.color:'#6868fc',key));
   statements.push(statement(db,'SELECT room,seat FROM members WHERE player=?',key));
   const r=await db.batch(statements),member=r.at(-1).results[0];if(!member)fail('This room session has ended. Join again.',409);return json({id:member.room,seat:member.seat,invite:member.room===roomId?invite:undefined},201);
  }
  if(!id||!/^[a-f0-9-]{36}$/.test(id))fail('Room not found.',404);
  const room=(await query(db,'SELECT * FROM rooms WHERE id=?',id))[0];if(!room)fail('Room closed or expired.',404);
  let member=(await query(db,'SELECT * FROM members WHERE room=? AND player=?',id,key))[0];
  const owner=room.owner===key;
  const allowed=!room.private||member||await hash(request.headers.get('X-Room-Invite')||'')===room.invite;
  if(!allowed)fail('Invalid private invite link.',404);
  if(action==='join'&&request.method==='POST'){
   const b=await body(request);const playerName=short(b.name,20);
   if(member)return json({id,seat:member.seat});
   const occupied=(await query(db,'SELECT room FROM members WHERE player=?',key))[0];if(occupied)fail('Leave your current room first.',409);
   const r=await db.batch([statement(db,`INSERT INTO members(room,player,name,seat,expires_at) SELECT ?,?,?,-1,? WHERE (SELECT COUNT(*) FROM members WHERE room=?)<16 AND NOT EXISTS(SELECT 1 FROM room_departures WHERE player=?)`,id,key,playerName,now+TTL,id,key),statement(db,'SELECT seat FROM members WHERE player=? AND room=?',key,id)]);
   if(!r[1].results.length)fail('Room is full.',409);await query(db,'UPDATE members SET country=? WHERE room=? AND player=?',requestCountry(request,b.country),id,key);await query(db,'UPDATE members SET color=? WHERE room=? AND player=?',/^#[a-f0-9]{6}$/i.test(b.color)?b.color:'#6868fc',id,key);return json({id,seat:-1});
  }
  if(action==='signals'){
   // Public visitors may probe host RTT without occupying a player seat.
   if(request.method==='GET')return json({signals:await query(db,'SELECT seq,sender,body FROM room_signals WHERE room=? AND recipient=? AND seq>? ORDER BY seq LIMIT 100',id,key,Number(url.searchParams.get('after'))||0)});
   if(request.method==='POST'){
    const b=await body(request);if(!b||typeof b.data!=='object'||!b.data||!['offer','answer','candidate','probe-offer'].includes(b.data.type))fail('Invalid signal.');
    const target=owner?short(b.to,64):room.owner;
    if(!member&&b.data.type!=='probe-offer'&&b.data.type!=='candidate')fail('Join the room first.',403);
    const count=(await query(db,'SELECT COUNT(*) n FROM room_signals WHERE room=? AND sender=?',id,key))[0].n;if(count>=100)fail('Too many signals.',429);
    await query(db,'INSERT INTO room_signals(room,sender,recipient,body,expires_at) VALUES(?,?,?,?,?)',id,key,target,JSON.stringify(b.data),now+30);return json({ok:true});
   }
  }
  if(!member)fail('Join the room first.',403);
  if(action==='profile'&&request.method==='PUT'){
   const b=await body(request),name=short(b.name,20);if(!/^#[a-f0-9]{6}$/i.test(b.color))fail('Invalid worm color.');
   await query(db,'UPDATE members SET name=?,color=? WHERE room=? AND player=?',name,b.color,id,key);return json({ok:true});
  }
  if(action==='state'&&request.method==='GET'){
   const r=await db.batch([statement(db,'UPDATE members SET expires_at=? WHERE room=? AND player=?',now+TTL,id,key),statement(db,'UPDATE rooms SET expires_at=? WHERE id=? AND owner=?',now+TTL,id,key),statement(db,'SELECT player id,name,color,seat,country FROM members WHERE room=? ORDER BY seat,name',id),statement(db,'SELECT seq,player,name,message,created_at FROM room_chat WHERE room=? ORDER BY seq DESC LIMIT 100',id)]);
   return json({...publicRoom(room,r[2].results.length),owner:room.owner,self:key,members:r[2].results,chat:r[3].results.reverse()});
  }
  if(action==='seat'&&request.method==='POST'){
   const b=await body(request);
   const r=await db.batch([statement(db,`UPDATE members SET seat=CASE WHEN ?=0 THEN -1 WHEN seat>=0 THEN seat ELSE COALESCE((SELECT slot FROM (SELECT 0 slot UNION ALL SELECT 1) WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.room=? AND m.seat=slot) ORDER BY slot LIMIT 1),-1) END WHERE room=? AND player=?`,b.play?1:0,id,id,key),statement(db,'SELECT seat FROM members WHERE room=? AND player=?',id,key)]);
   const seat=r[1].results[0].seat;if(b.play&&seat<0)fail('Both player slots are occupied.',409);return json({seat});
  }
  if(action==='chat'&&request.method==='POST'){
   const b=await body(request),message=short(b.message,500);
   const recent=(await query(db,'SELECT COUNT(*) n FROM room_chat WHERE room=? AND player=? AND created_at>?',id,key,now-10))[0].n;if(recent>=8)fail('Wait a moment before sending more messages.',429);
   const saved=await db.batch([statement(db,'INSERT INTO room_chat(room,player,name,message,created_at) VALUES(?,?,?,?,?)',id,key,member.name,message,now),statement(db,'DELETE FROM room_chat WHERE room=? AND seq NOT IN(SELECT seq FROM room_chat WHERE room=? ORDER BY seq DESC LIMIT 100)',id,id),statement(db,'SELECT seq,player,name,message,created_at FROM room_chat WHERE room=? AND player=? ORDER BY seq DESC LIMIT 1',id,key)]);return json({ok:true,message:saved[2].results[0]});
  }
  if(action==='settings'&&request.method==='PUT'){
   if(!owner)fail('Only the host can edit the room.',403);const b=await body(request);
   await query(db,'UPDATE rooms SET name=?,private=?,settings=? WHERE id=?',short(b.name,48),b.private?1:0,JSON.stringify(rules(b.settings)),id);return json({ok:true});
  }
  if(action==='phase'&&request.method==='PUT'){
   if(!owner)fail('Only the host can start the round.',403);const b=await body(request);if(!['lobby','playing'].includes(b.phase))fail('Invalid room state.');
   await query(db,'UPDATE rooms SET phase=? WHERE id=?',b.phase,id);return json({ok:true});
  }
  if(!action&&request.method==='DELETE'){
   await query(db,owner?'DELETE FROM rooms WHERE id=? AND owner=?':'DELETE FROM members WHERE room=? AND player=?',id,key);return json({ok:true});
  }
  return json({error:'Operation unavailable.'},405);
 }catch(error){if(error.status)return json({error:error.message},error.status);console.error('Room request failed',error.name);return json({error:'Room service temporarily unavailable.'},503);}
}
