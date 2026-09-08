export type RoomSort={key:'name'|'count'|'ping'|'mode';ascending:boolean};
type Entry={room:{name:string;count:number;capacity:number;settings:{mode:number}};ms:number};
export function compareRooms(a:Entry,b:Entry,sort:RoomSort){
 const delta=sort.key==='name'?a.room.name.localeCompare(b.room.name):sort.key==='count'?a.room.count-b.room.count:sort.key==='mode'?a.room.settings.mode-b.room.settings.mode:(Number.isFinite(a.ms)?a.ms:Infinity)-(Number.isFinite(b.ms)?b.ms:Infinity);
 if(sort.key==='ping'&&Number.isFinite(a.ms)!==Number.isFinite(b.ms))return Number.isFinite(a.ms)?-1:1;
 return (delta?(sort.ascending?delta:-delta):0)||a.ms-b.ms||a.room.name.localeCompare(b.room.name);
}
export function includeRoom(room:Entry['room'],empty:boolean,full:boolean){return (empty||room.count>0)&&(full||room.count<room.capacity);}
