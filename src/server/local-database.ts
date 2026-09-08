import { Database } from 'bun:sqlite';

// Local stand-in for D1's transactional batch contract. Production injects D1.
export async function localDatabase(sqlite: Database, migrations: URL) {
 sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL');
 sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
 const directory = Bun.file(migrations).name!;
 const names=Array.from(new Bun.Glob('*.sql').scanSync({cwd:directory})).sort();
 for(const name of names) {
  if(sqlite.query('SELECT name FROM local_migrations WHERE name=?').get(name))continue;
  const sql=await Bun.file(new URL(name,migrations)).text();
  sqlite.transaction(()=>{sqlite.exec(sql);sqlite.query('INSERT INTO local_migrations VALUES(?)').run(name);})();
 }
 const prepare=(query:string,values:unknown[]=[])=>({query,values,bind(...next:unknown[]){return prepare(query,next);}});
 return {prepare,async batch(statements:ReturnType<typeof prepare>[]) {
  return sqlite.transaction(()=>statements.map(s=>({results:sqlite.query(s.query).all(...s.values as any[])})))();
 }};
}
