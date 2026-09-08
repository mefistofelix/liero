// Bun orchestrates the original C++ toolchain. No shell scripts or app packages.
export async function buildEngine(wasm=false){
 const root=new URL('../../',import.meta.url);
 const executable=(relative:string)=>Bun.file(new URL(relative,root)).name!;
 const sdk=(Bun.env.EMSDK||executable('.tools/emsdk')).replaceAll('\\','/');
 const windows=Bun.env.OS==='Windows_NT',separator=windows?';':':';
 const resolveTool=async(override:string|undefined,bundled:string,names:string[])=>{if(override)return Bun.which(override)||override;if(await Bun.file(executable(bundled)).exists())return executable(bundled);return names.map(name=>Bun.which(name)).find(Boolean);};
 let python:string|undefined;try{python=[...new Bun.Glob(windows?'**/python.exe':'**/python3').scanSync({cwd:sdk+'/python',onlyFiles:true})][0];}catch{}
 const cmake=await resolveTool(Bun.env.CMAKE,'.tools/python/cmake/data/bin/cmake.exe',['cmake']),ninja=await resolveTool(Bun.env.NINJA,'.tools/python/bin/ninja.exe',['ninja']);
 const py=Bun.env.EMSDK_PYTHON||(python?sdk+'/python/'+python:Bun.which('python3')||Bun.which('python'));
 if(!py||!cmake||!ninja||!await Bun.file(py).exists()||!await Bun.file(cmake).exists()||!await Bun.file(ninja).exists()||!await Bun.file(sdk+'/upstream/emscripten/em++.py').exists())throw new Error('Engine build requires Emscripten, Python, CMake and Ninja. Set EMSDK, EMSDK_PYTHON, CMAKE or NINJA to override discovery. See docs/stack.md. Running the game uses the bundled engine.');
 const out=executable(wasm?'.local/build/wasm':'.local/build/js'),source=executable('.');
 const env={...Bun.env,EMSDK_PYTHON:py,PATH:[py.slice(0,Math.max(py.lastIndexOf('/'),py.lastIndexOf('\\'))),sdk+'/upstream/emscripten',Bun.env.PATH].join(separator)};
 async function run(cmd:string[]){const child=Bun.spawn(cmd,{cwd:source,env,stdout:'inherit',stderr:'inherit'});if(await child.exited)throw new Error('Engine build failed.');}
 await run([cmake,'-S',source,'-B',out,'-G','Ninja','-DCMAKE_MAKE_PROGRAM='+ninja,'-DCMAKE_TOOLCHAIN_FILE='+sdk+'/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake','-DCMAKE_BUILD_TYPE=Release','-DLIERO_JS_ONLY='+(wasm?'OFF':'ON')]);
 await run([cmake,'--build',out,'--target','openliero','-j','6']);
 if(!wasm)for(const file of ['openliero.mjs','openliero.data'])await Bun.write(new URL('src/browser/engine/'+file,root),Bun.file(out+'/'+file));
}
