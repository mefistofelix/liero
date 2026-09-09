import {test,expect} from 'bun:test';
import {encodePacket,decodePacket,compressCheckpoint,decompressCheckpoint} from '../browser/net-packets.ts';
const round='ed50a5b8-736a-4f74-8059-c63dc7f1f4a9';
test('compact packets preserve all native control combinations, angles and pulses',()=>{
 for(let buttons=0;buttons<512;buttons++)for(const angle of [0,32,64,96,127])for(const wheel of [-1,0,1]){
  const p={type:'input-event',round,frame:252000,sequence:512,input:[buttons,angle,wheel]},data=encodePacket(p) as Uint8Array;
  expect(data.length).toBe(28);expect(decodePacket(data.buffer)).toEqual(p);
 }
 for(const p of [{type:'event',kind:'input',round,frame:70,serial:42,sequence:7,seat:1,input:[511,127,-1]},
  {type:'progress',round,frame:70,serial:42,hash:0xf1234567,ended:true},
  {type:'checkpoint-chunk',round,token:5,offset:8192,data:new Uint8Array([0,1,255])},
  {type:'map-chunk',round,offset:8192,data:new Uint8Array([0,1,255])}]){
  const data=encodePacket(p) as Uint8Array;expect(decodePacket(data.buffer)).toEqual(p);expect(()=>decodePacket(data.slice(0,24).buffer)).toThrow();
 }
});
test('native stream compression round trips checkpoint bytes',async()=>{
 const bytes=crypto.getRandomValues(new Uint8Array(65536));expect(await decompressCheckpoint(await compressCheckpoint(bytes))).toEqual(bytes);
});
