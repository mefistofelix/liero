const task=Bun.argv[2]||'help';
switch(task){
 case 'engine':case 'engine-wasm':await (await import('./build-engine.ts')).buildEngine(task==='engine-wasm');break;
 case 'font':await import('./create-font.ts');break;
 case 'icons':await import('./create-icons.ts');break;
 case 'maps':await import('./bundle-maps.ts');break;
 case 'test':{const p=Bun.spawn([Bun.argv[0],'test','src/tests'],{stdout:'inherit',stderr:'inherit'});process.exitCode=await p.exited;break;}
 default:console.log('bun run src/tasks/main.ts <engine | engine-wasm | font | icons | maps | test>');
}
