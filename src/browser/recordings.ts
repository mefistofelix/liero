export type Recording={id:string;name:string;date:number;duration:number;blob:Blob};
let database:Promise<IDBDatabase>;
async function archive<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await(database??=new Promise((resolve,reject)=>{const r=indexedDB.open('liero.recordings',1);r.onupgradeneeded=()=>r.result.createObjectStore('videos',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}));
 return new Promise((resolve,reject)=>{const tx=db.transaction('videos',mode),r=action(tx.objectStore('videos'));tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
export const listRecordings=()=>archive<Recording[]>('readonly',s=>s.getAll());
export const deleteRecording=(id:string)=>archive('readwrite',s=>s.delete(id));
export class GameRecorder{
 private completion?:Promise<void>;private finish=()=>{};private finalizing=false;
 private recorder?:MediaRecorder;private chunks:Blob[]=[];private startTime=0;private raf=0;private videoStream?:MediaStream;private name='';private bytes=0;
 onRecordingChange=(recording:boolean)=>{};onSaved=(recording:Recording,persisted:boolean)=>{};onError=(error:Error)=>{};
 get active(){return this.recorder?.state==='recording'||this.finalizing;}
 supported(){return typeof MediaRecorder!=='undefined'&&['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4'].some(t=>MediaRecorder.isTypeSupported(t));}
 start(game:HTMLCanvasElement,audio:MediaStream|undefined,name:string){
  if(this.active)return;
  const mimeType=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!mimeType)throw new Error('This browser cannot record MP4. Use a browser with MP4 MediaRecorder support.');
  // Stable recording dimensions even when the game viewport is resized.
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=800;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
  const draw=()=>{ctx.fillStyle='#080b0b';ctx.fillRect(0,0,1280,800);const scale=Math.min(1280/game.width,800/game.height),w=game.width*scale,h=game.height*scale;ctx.drawImage(game,(1280-w)/2,(800-h)/2,w,h);this.raf=requestAnimationFrame(draw);};draw();
  this.videoStream=canvas.captureStream(60);const tracks=[...this.videoStream.getVideoTracks(),...(audio?.getAudioTracks()||[])];
  this.recorder=new MediaRecorder(new MediaStream(tracks),{mimeType,videoBitsPerSecond:4_000_000,audioBitsPerSecond:128_000});this.chunks=[];this.bytes=0;this.startTime=Date.now();this.name=name;
  this.recorder.ondataavailable=e=>{if(e.data.size){this.chunks.push(e.data);this.bytes+=e.data.size;if(this.bytes>256*1024*1024)this.stop();}};
  this.recorder.onerror=()=>{this.onError(new Error('Recording failed.'));this.stop();};
  this.completion=new Promise<void>(resolve=>{this.finish=()=>{this.finalizing=false;resolve();};});
  this.recorder.onstop=async()=>{
   this.onRecordingChange(false);
   this.finalizing=true;try{
   cancelAnimationFrame(this.raf);this.videoStream?.getTracks().forEach(t=>t.stop());
   const recording={id:crypto.randomUUID(),name:this.name,date:this.startTime,duration:Date.now()-this.startTime,blob:new Blob(this.chunks,{type:'video/mp4'})};this.chunks=[];
   if(!recording.blob.size){this.onError(new Error('The browser did not produce a recording.'));return;}
   try{await archive('readwrite',s=>s.put(recording));this.onSaved(recording,true);}catch{this.onSaved(recording,false);}
   }finally{this.finish();}
  };
  this.recorder.start(1000);this.onRecordingChange(true);
 }
 stop(){if(this.recorder?.state==='recording'){this.finalizing=true;this.recorder.stop();this.onRecordingChange(false);}return this.completion??Promise.resolve();}
}
