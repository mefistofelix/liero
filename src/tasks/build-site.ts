import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import catalog from '../browser/maps/catalog.json';

const root=resolve(import.meta.dir,'../..'),dist=resolve(root,'dist');
if(dist!==root+'/dist'&&dist!==root+'\\dist')throw new Error('Invalid output directory');
await rm(dist,{recursive:true,force:true});
for(const [source,out,target] of [['src/browser/client.ts','client/client.js','browser'],['src/server/hosting.ts','server/index.js','browser']] as const){
  const result=await Bun.build({entrypoints:[resolve(root,source)],target,minify:true});
  if(!result.success)throw new AggregateError(result.logs,'Hosting build failed');
  if(result.outputs.length!==1)throw new Error('Unexpected build outputs');
  await Bun.write(resolve(dist,out),result.outputs[0]);
}
const assets=['index.html','style.css','liero.ttf','engine/openliero.mjs','engine/openliero.data','maps/temple.lev','manifest.webmanifest','sw.js','favicon.svg','icon-192.png','icon-512.png'];
for(const level of catalog)assets.push(level.asset.slice(1),level.thumbnail.slice(1));
for(const asset of new Set(assets))await Bun.write(resolve(dist,'client',asset),Bun.file(resolve(root,'src/browser',asset)));
await Bun.write(resolve(dist,'.openai/hosting.json'),Bun.file(resolve(root,'.openai/hosting.json')));
const migrations=[...new Bun.Glob('*.sql').scanSync({cwd:resolve(root,'src/server/migrations')})].sort();
for(const migration of migrations){
  const sql=await Bun.file(resolve(root,'src/server/migrations',migration)).text();
  // Sites consumes Drizzle-compatible migration files; retain our existing SQL schema.
  await Bun.write(resolve(dist,'.openai/drizzle',migration),sql.replace(/;\s*(?=\S)/g,';\n--> statement-breakpoint\n'));
}
await Bun.write(resolve(dist,'.openai/drizzle/meta/_journal.json'),Bun.file(resolve(root,'src/server/migrations/meta/_journal.json')));
console.log(`Hosting build ready: Worker, ${new Set(assets).size} assets, ${migrations.length} D1 migrations.`);
