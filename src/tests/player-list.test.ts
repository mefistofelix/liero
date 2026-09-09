import {test,expect} from 'bun:test';
import {orderPlayers} from '../browser/player-list.ts';

test('players sort by kills descending, before spectators, and update after a lead change',()=>{
 const members=[{id:'watch1',seat:-1},{id:'p1',seat:0},{id:'watch2',seat:-1},{id:'p2',seat:1}],kills=[3,7];
 const ordered=()=>orderPlayers(members,seat=>{expect(seat).toBeGreaterThanOrEqual(0);return kills[seat];}).map(m=>m.id);
 expect(ordered()).toEqual(['p2','p1','watch1','watch2']);
 kills[0]=8;expect(ordered()).toEqual(['p1','p2','watch1','watch2']);
 kills[1]=8;expect(ordered()).toEqual(['p1','p2','watch1','watch2']);
 expect(members.map(m=>m.id)).toEqual(['watch1','p1','watch2','p2']);
});
