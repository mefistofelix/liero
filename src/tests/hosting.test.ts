import {test,expect} from 'bun:test';
import hosting from '../server/hosting.ts';

test('production Worker routes APIs to the application and game assets to static hosting',async()=>{
 const fetched:string[]=[];const env={ASSETS:{fetch:async(request:Request)=>{fetched.push(request.url);return new Response('static asset');}}};
 const request=new Request('https://arena.example/api/region');Object.defineProperty(request,'cf',{value:{continent:'EU',country:'IT'}});
 const response=await hosting.fetch(request,env);expect(response.status).toBe(200);expect((await response.json()).region).toBe('EU');expect(fetched).toHaveLength(0);
 expect(await(await hosting.fetch(new Request('https://arena.example/engine/openliero.data'),env)).text()).toBe('static asset');expect(fetched).toEqual(['https://arena.example/engine/openliero.data']);
});
