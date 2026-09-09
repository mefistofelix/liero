import { Database } from 'bun:sqlite';
import { localDatabase } from './server/local-database.ts';
import api from './server/worker.js';
import catalog from './browser/maps/catalog.json';

const root = new URL('../', import.meta.url);
await Bun.write(new URL('.local/.keep', root), '');
const sqlite = new Database(Bun.file(new URL('.local/matchmaking.sqlite', root)).name!, {create:true});
const DB = await localDatabase(sqlite, new URL('./server/migrations/', import.meta.url));
const build = await Bun.build({entrypoints:[`${import.meta.dir}/browser/client.ts`], target:'browser', minify:false});
if (!build.success) { for(const log of build.logs) console.error(log); throw new Error('Browser build failed'); }
const client = await build.outputs[0].text();
const files: Record<string,{name:string,type:string}> = {
 '/':{name:'index.html',type:'text/html; charset=utf-8'},
 '/style.css':{name:'style.css',type:'text/css; charset=utf-8'},
 '/liero.ttf':{name:'liero.ttf',type:'font/ttf'},
 '/engine/openliero.mjs':{name:'engine/openliero.mjs',type:'text/javascript'},
 '/engine/openliero.data':{name:'engine/openliero.data',type:'application/octet-stream'},
 '/maps/temple.lev':{name:'maps/temple.lev',type:'application/octet-stream'},
 '/maps/catalog.json':{name:'maps/catalog.json',type:'application/json'},
 '/manifest.webmanifest':{name:'manifest.webmanifest',type:'application/manifest+json'},
 '/sw.js':{name:'sw.js',type:'text/javascript'},
 '/favicon.ico':{name:'favicon.ico',type:'image/x-icon'},
 '/icon-180.png':{name:'icon-180.png',type:'image/png'},
 '/icon-192.png':{name:'icon-192.png',type:'image/png'},
 '/icon-512.png':{name:'icon-512.png',type:'image/png'},
};
for(const level of catalog){files[level.asset]={name:level.asset.slice(1),type:'application/octet-stream'};files[level.thumbnail]={name:level.thumbnail.slice(1),type:'image/png'};}
for(const flag of new Bun.Glob('*.svg').scanSync({cwd:`${import.meta.dir}/browser/flags`}))files['/flags/'+flag]={name:'flags/'+flag,type:'image/svg+xml'};
const server = Bun.serve({
 hostname:'127.0.0.1', port:Number(Bun.env.PORT ?? 3000),
 async fetch(request) {
  const path = new URL(request.url).pathname;
  if(path.startsWith('/api/')) {
   // Bun has no Cloudflare request.cf. Explicit local test geography only.
   Object.defineProperty(request,'cf',{value:{continent:Bun.env.LOCAL_REGION??'EU',country:Bun.env.LOCAL_COUNTRY??''}});
   return api.fetch(request,{DB});
  }
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  if(path==='/client.js')return new Response(request.method==='HEAD'?null:client,{headers:{'Content-Type':'text/javascript','Cache-Control':'no-store'}});
  const asset=files[path];
  if(!asset)return new Response('Not found',{status:404});
  const file=Bun.file(new URL(`./browser/${asset.name}`,import.meta.url));
  if(!await file.exists())return new Response('Asset missing',{status:503});
  return new Response(request.method==='HEAD'?null:file,{headers:{'Content-Type':asset.type,'Cache-Control':'no-store'}});
 },
});
console.log(`Liero: ${server.url}`);
console.log(`Runtime Bun ${Bun.version}; local geography ${Bun.env.LOCAL_REGION??'EU'}.`);

const cleanup=setInterval(()=>api.scheduled(null,{DB}),600000);
cleanup.unref();
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{clearInterval(cleanup);server.stop(true);sqlite.close();process.exit(0);});
