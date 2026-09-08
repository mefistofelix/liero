import {test,expect} from 'bun:test';
import {compareRooms,includeRoom} from '../browser/room-list.ts';
const entry=(name:string,count:number,ms:number)=>({room:{name,count,capacity:16,settings:{mode:0}},ms});
test('room ordering prioritizes people then ping, with reversible column sorting',()=>{
 const entries=[entry('Empty',0,1),entry('Slow',3,80),entry('Fast',3,10),entry('Full',16,100),entry('Unknown',3,Infinity)];
 expect([...entries].sort((a,b)=>compareRooms(a,b,{key:'count',ascending:false})).map(e=>e.room.name)).toEqual(['Full','Fast','Slow','Unknown','Empty']);
 expect([...entries].sort((a,b)=>compareRooms(a,b,{key:'ping',ascending:false})).map(e=>e.room.name)).toEqual(['Full','Slow','Fast','Empty','Unknown']);
 expect(entries.filter(e=>includeRoom(e.room,false,false)).map(e=>e.room.name)).toEqual(['Slow','Fast','Unknown']);
 expect(entries.filter(e=>includeRoom(e.room,true,true))).toHaveLength(5);
});
