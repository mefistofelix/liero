export function orderPlayers<T extends {seat:number}>(members:readonly T[],kills:(seat:number)=>number):T[]{
 return [...members].sort((a,b)=>{
  if(a.seat<0)return b.seat<0?0:1;
  if(b.seat<0)return -1;
  return kills(b.seat)-kills(a.seat)||a.seat-b.seat;
 });
}

export function playerStatus(playing:boolean){
 const cell=document.createElement('td');cell.className='player-status';
 const label=playing?'Playing':'Spectating';cell.title=label;cell.setAttribute('aria-label',label);
 const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 path.setAttribute('d',playing?'m8 4 12 8-12 8Z':'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0');
 icon.append(path);cell.append(icon);return cell;
}
