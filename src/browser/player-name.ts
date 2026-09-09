// Match the server's 20-character player-name limit, including untrusted peer data.
export function playerName(value:unknown,fallback='Player'):string{
 if(typeof value!=='string')return fallback;
 return value.slice(0,256).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'').trim().slice(0,20)||fallback;
}
