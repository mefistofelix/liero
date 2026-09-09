type Point={x:number;y:number};

// Canvas contacts only. Emit the same intent bits as the mouse adapter.
export class TouchInput{
 private contacts=new Map<number,Point>();
 private peak=0;
 private held=0;
 private pending=0;
 private lastOutput=0;
 private ropeEdge=false;
 get aim():Point|undefined{return this.contacts.values().next().value;}
 get panning(){return this.contacts.size===1&&this.peak===1;}
 has(id:number){return this.contacts.has(id);}
 down(id:number,point:Point){
  if(this.has(id))return;
  if(!this.contacts.size){this.peak=0;this.held=0;}
  this.contacts.set(id,point);
  const count=this.contacts.size,previousPeak=this.peak;
  this.peak=Math.max(this.peak,count);
  if(this.peak>=3){
   this.held=0;this.ropeEdge=false;
   if(previousPeak<3)this.pending=4;
  }else if(count===2){this.held=16;this.pending=16;this.ropeEdge=true;}
  else if(this.peak===1){this.held=8;this.pending=8;}
 }
 move(id:number,point:Point){if(this.has(id))this.contacts.set(id,point);}
 up(id:number){
  if(!this.contacts.delete(id))return;
  // Never downgrade a chord to a new action as its fingers are lifted.
  this.held=this.peak===2&&this.contacts.size===2?16:0;
 }
 sample(consume=true){
  let value=this.held|this.pending;
  // A new two-finger press needs a released native right-button edge, even
  // when the finger was lifted and pressed again between simulation ticks.
  if(this.ropeEdge&&(value&16)&&(this.lastOutput&16))value=0;
  if(consume){
   this.lastOutput=value;
   if(value){this.pending=0;this.ropeEdge=false;}
  }
  return value;
 }
 clear(){this.contacts.clear();this.peak=0;this.held=0;this.pending=0;this.lastOutput=0;this.ropeEdge=false;}
}
