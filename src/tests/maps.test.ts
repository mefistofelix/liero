import {test,expect} from 'bun:test';
import catalog from '../browser/maps/catalog.json';
import {validateLevel} from '../browser/maps.ts';
test('all catalog entries ship exact validated levels and local PNG previews',async()=>{
 expect(catalog).toHaveLength(897);
 for(const level of catalog){
  const data=new Uint8Array(await Bun.file(new URL('../browser'+level.asset,import.meta.url)).arrayBuffer());
  expect(validateLevel(data)).toBe(data);expect(new Bun.CryptoHasher('sha256').update(data).digest('hex')).toBe(level.sha256);
  const preview=new Uint8Array(await Bun.file(new URL('../browser'+level.thumbnail,import.meta.url)).arrayBuffer());expect([...preview.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]);const view=new DataView(preview.buffer);expect(view.getUint32(16)).toBe(168);expect(view.getUint32(20)).toBe(117);
 }
});
