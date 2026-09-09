import {test,expect} from 'bun:test';
import {RoomPresence} from '../browser/room-presence.ts';
const storage=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}};};
test('reload removes the old identity before a new entry; copied new tabs leave the original alone',async()=>{
 const store=storage(),quit:string[]=[];const first=new RoomPresence(store,false,async id=>{quit.push(id);});const old=await first.begin();
 const reload=new RoomPresence(store,true,async id=>{quit.push(id);});const current=await reload.begin();expect(quit).toEqual([old]);expect(current).not.toBe(old);
 const newTab=new RoomPresence(store,false,async id=>{quit.push(id);});expect(await newTab.begin()).not.toBe(current);expect(quit).toEqual([old]);
});
test('failed quit is retried before joining; overlapping quits share one request',async()=>{
 const store=storage();let attempts=0,release:()=>void=()=>{};
 const presence=new RoomPresence(store,false,async()=>{attempts++;if(attempts===1)throw new Error('Offline');await new Promise<void>(resolve=>release=resolve);});
 const original=await presence.begin();await expect(presence.leave()).rejects.toThrow('Offline');
 const retry=presence.leave(),same=presence.leave(),next=presence.begin();expect(retry).toBe(same);expect(attempts).toBe(2);release();await retry;expect(await next).not.toBe(original);
});

test('navigation recovery removes an abandoned tab but does not kick an active duplicated tab',async()=>{
 const store=storage(),active=new Set<string>(),quit:string[]=[];
 const lease={isActive:async(id:string)=>active.has(id),hold:async(id:string)=>{active.add(id);return ()=>{active.delete(id);};}};
 const original=new RoomPresence(store,false,async id=>{quit.push(id);},lease),id=await original.begin();
 const copied=new RoomPresence(store,false,async id=>{quit.push(id);},lease);const copyId=await copied.begin();expect(quit).toEqual([]);expect(copyId).not.toBe(id);expect(active.has(id)).toBe(true);
 // Simulate page destruction without pagehide delivery: the browser releases locks.
 active.delete(copyId);const next=new RoomPresence(store,false,async id=>{quit.push(id);},lease);await next.begin();expect(quit).toEqual([copyId]);
});
