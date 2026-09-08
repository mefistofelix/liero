import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {joinQueue,queueStatus,leaveQueue,cleanup,detectRegion} from '../server/matchmaker.js';
import worker from '../server/worker.js';
const assert={equal:(a,b,m)=>expect(a,m).toBe(b),ok:(a,m)=>expect(a,m).toBeTruthy()};
const schema=await Bun.file(new URL('../server/migrations/0001_matchmaking.sql',import.meta.url)).text();
function database(){
 const sql=new Database(':memory:');
 sql.exec('PRAGMA foreign_keys=ON');
 sql.exec(schema);
 const wrap=(query,values=[])=>({query,values,bind(...values){return wrap(query,values);}});
 return {sql,prepare:wrap,async batch(stmts){
  sql.exec('BEGIN');
  try{const results=stmts.map(s=>({results:sql.prepare(s.query).all(...s.values)}));sql.exec('COMMIT');return results;}
  catch(e){sql.exec('ROLLBACK');throw e;}
 }};
}

test('regional matching is isolated and each pair is assigned only once',async()=>{
 const db=database();
 assert.equal((await joinQueue(db,'a','EU',100)).status,'waiting');
 assert.equal((await joinQueue(db,'b','NA',101)).status,'waiting');
 const c=await joinQueue(db,'c','EU',102);
 assert.equal(c.status,'matched');
 assert.equal((await queueStatus(db,'a',103)).matchId,c.matchId);
 assert.equal((await queueStatus(db,'b',103)).status,'waiting');
 assert.equal((await joinQueue(db,'a','EU',104)).matchId,c.matchId);
 assert.equal(db.sql.prepare('SELECT count(*) n FROM matches').get().n,1);
});
test('bursty joins do not share players between pairs',async()=>{
 const db=database();
 await Promise.all(Array.from({length:20},(_,i)=>joinQueue(db,`p${i}`,'EU',100+i)));
 const rows=db.sql.prepare('SELECT match_id,count(*) n FROM queue GROUP BY match_id').all();
 assert.equal(rows.length,10);for(const row of rows){assert.ok(row.match_id);assert.equal(row.n,2);}
});
test('expired queue entries cannot become opponents; polling renews live entries',async()=>{
 const db=database();await joinQueue(db,'old','EU',100);
 assert.equal((await joinQueue(db,'new','EU',221)).status,'waiting');
 assert.equal(await queueStatus(db,'old',221),null);
 assert.equal((await queueStatus(db,'new',222)).expiresAt,342);
 await cleanup(db,223);assert.equal(db.sql.prepare('SELECT count(*) n FROM queue').get().n,1);
});
test('cancellation removes waiting entries but reports an assignment race',async()=>{
 const db=database();await joinQueue(db,'a','EU',100);assert.equal(await leaveQueue(db,'a'),true);
 await joinQueue(db,'a','EU',101);await joinQueue(db,'b','EU',102);
 assert.equal(await leaveQueue(db,'a'),false);
});
test('HTTP boundary rejects unsupported regions, malformed bodies and foreign origins',async()=>{
 const env={DB:database()},headers={Authorization:`Bearer ${'a'.repeat(64)}`,'Content-Type':'application/json'};
 const req=(body,extra={})=>new Request('https://game.test/api/queue',{method:'POST',headers:{...headers,...extra},body});
 assert.equal((await worker.fetch(req('{'),env)).status,400);
 assert.equal((await worker.fetch(req('{"region":"invalid"}'),env)).status,400);
 assert.equal((await worker.fetch(req('{"region":"EU"}',{Origin:'https://other.test'}),env)).status,403);
 assert.equal((await worker.fetch(req(' '.repeat(1025)),env)).status,413);
 assert.equal((await worker.fetch(req('{"region":"EU"}'),env)).status,200);
 assert.equal(detectRegion({continent:'EU'}),'EU');assert.equal(detectRegion({}),null);
});
