// Explicit maintenance task. No downloads at application runtime.
import create from '../browser/engine/openliero.mjs';
import {png} from './png.ts';
const source=Bun.env.MAP_SOURCE||'.local/sources/webliero-maps',root='src/browser/maps';
if(!await Bun.file(source+'/README.md').exists()){
 const clone=Bun.spawn(['git','clone','--depth','1','https://gitlab.com/webliero/webliero-maps.git',source],{stdout:'inherit',stderr:'inherit'});
 if(await clone.exited)throw new Error('Could not download the map source collection.');
}
const catalog=await Bun.file(root+'/catalog.json').json();
// Glob casing differs by platform; enumerate all files and match exact basenames.
const paths=[...new Bun.Glob('**/*').scanSync({cwd:source,onlyFiles:true})].map(p=>p.replaceAll('\\','/'));
const engine=await create({locateFile:(f:string)=>Bun.file('src/browser/engine/'+f).name});
const p=engine._liero_palette(),palette=engine.HEAPU8.slice(p,p+1024);
for(const level of catalog){
 const matches=paths.filter(p=>p.split('/').at(-1)===level.name).sort((a,b)=>Number(b.startsWith('hellhole/'))-Number(a.startsWith('hellhole/'))||a.localeCompare(b));
 if(!matches.length)throw new Error('Missing source '+level.name);
 const bytes=new Uint8Array(await Bun.file(source+'/'+matches[0]).arrayBuffer());
 if(bytes.length<176400||bytes.length>1048576)throw new Error('Invalid LEV '+level.name);
 const hash=new Bun.CryptoHasher('sha256').update(bytes).digest('hex');
 level.asset='/maps/levels/'+hash+'.lev';level.thumbnail='/maps/previews/'+hash+'.png';level.sha256=hash;level.sourcePath=matches[0];
 await Bun.write('src/browser'+level.asset,bytes);
 const pal=palette.slice();if(new TextDecoder().decode(bytes.subarray(176400,176410))==='POWERLEVEL'){if(bytes.length<177178)throw new Error('Incomplete palette');for(let i=0;i<256;i++)for(let c=0;c<3;c++)pal[i*4+c]=(bytes[176410+i*3+c]&63)<<2;}
 const rgba=new Uint8Array(168*117*4);for(let y=0;y<117;y++)for(let x=0;x<168;x++){const index=bytes[Math.min(349,Math.floor(y*350/117))*504+x*3]*4;rgba.set(pal.subarray(index,index+4),(y*168+x)*4);}
 await Bun.write('src/browser'+level.thumbnail,png(168,117,rgba));
}
await Bun.write(root+'/catalog.json',JSON.stringify(catalog,null,2)+'\n');
const rev=Bun.spawnSync(['git','-C',source,'rev-parse','HEAD']).stdout.toString().trim();
await Bun.write(root+'/SOURCES.md',`# Bundled level sources\n\n${catalog.length} WebLiero catalog entries, copied without changing LEV bytes.\n\nSource: https://gitlab.com/webliero/webliero-maps\nCommit: ${rev}\n\nThe catalog records the source path and SHA-256 of every file. Identical files share one asset.\nMap copyrights remain with their respective authors. The collection does not declare a blanket license; the engine license does not relicense these assets.\n\nOriginal collection README follows:\n\n`+await Bun.file(source+'/README.md').text());
console.log('Bundled',catalog.length,'entries,',new Set(catalog.map(l=>l.asset)).size,'unique maps and previews.');
