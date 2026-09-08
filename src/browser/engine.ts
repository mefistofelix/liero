import type {NetworkRound} from './netgame.ts';
import {defaultControls,type Controls} from './preferences.ts';
export type EngineModule = {
  FS:{writeFile(path:string,data:Uint8Array):void};audioStream?:MediaStream;
  _liero_options(mode:number,lives:number,loading:number,bonuses:number,imported:number):void;
  _liero_color(player:number,r:number,g:number,b:number):void;
  _liero_palette():number;_liero_weapon_icon(id:number):number;
  _liero_font():number;
  _liero_allowed(id:number,enabled:number):void;
  _liero_weapon_id(type:number):number;
  _liero_player(player:number):void;_liero_camera(x:number,y:number):void;
  HEAPU8: Uint8Array; HEAP32: Int32Array;
  _liero_start(seed: number, bot: number): number;
  _liero_participants(mask:number):void;
  _liero_rules_live(mode:number,lives:number,loading:number,bonuses:number):void;
  _liero_view(split:number,width:number,height:number): void;
  _liero_step_local(b:number,a:number,w:number,raw0:number,raw1:number): number;
  _liero_loadout(player:number,slot:number,id:number): void;
  _liero_weapon_name(id:number): number; _liero_mute(muted:number): void;
  _liero_step(b0: number,a0: number,w0: number,b1: number,a1: number,w1: number): number;
  _liero_render(): number; _liero_aim(player: number,x: number,y: number): number;
  _liero_info(): number; _liero_hash(): number; _liero_audio(): void;
};
let modulePromise: Promise<EngineModule> | undefined;
export function loadEngine(): Promise<EngineModule> {
  if (!modulePromise) {
    const path='/engine/openliero.mjs';
    modulePromise=import(path).then(({default:create})=>create({locateFile:(file:string)=>`/engine/${file}`}))
      .catch(error=>{modulePromise=undefined;throw error;});
  }
  return modulePromise;
}

export class LocalGame {
  network?:NetworkRound;
  private freeCamera=false;
  private camera={x:252,y:175};
  private active = false;
  private previewing=false;
  private paused = false;
  private localTwo = false;
  private keyboardOnly = true;
  private sound = true;
  private controls:Controls=structuredClone(defaultControls);
  private resizeObserver: ResizeObserver;
  private raf = 0;
  private last = 0;
  private debt = 0;
  private keys = new Set<string>();
  private pendingKeys = new Set<string>();
  private buttons = 0;
  private pendingButtons = 0;
  private wheel = 0;
  private mouse = {x: 100, y: 80};
  private events = new AbortController();
  private pixels = new ImageData(320,200);
  private context: CanvasRenderingContext2D;
  constructor(private module: EngineModule, private canvas: HTMLCanvasElement, private onEnd: () => void, private onState: (state:Int32Array)=>void) {
    const ctx = canvas.getContext('2d', {alpha: false});
    if (!ctx) throw new Error('Canvas is unavailable.');
    this.context = ctx;
    const opts = {signal: this.events.signal};
    canvas.addEventListener('pointermove', this.point, opts);
    canvas.addEventListener('pointerdown', event => {
      canvas.focus(); this.point(event);
      canvas.setPointerCapture(event.pointerId);
      this.pendingButtons|=event.buttons&~this.buttons;
      this.buttons=event.buttons;
    }, opts);
    // Pointerdown fires only for the first mouse button; mousedown includes chords.
    canvas.addEventListener('mousedown', event => {
      event.preventDefault();
      this.buttons = event.buttons;
      this.pendingButtons|=event.button===0?1:event.button===2?2:event.button===1?4:0;
    }, opts);
    window.addEventListener('mouseup', event => {this.buttons=event.buttons;}, opts);
    canvas.addEventListener('pointerup', event => {this.buttons = event.buttons;}, opts);
    canvas.addEventListener('pointercancel', this.clear, opts);
    canvas.addEventListener('lostpointercapture', () => {this.buttons=0;}, opts);
    canvas.addEventListener('contextmenu', e => e.preventDefault(), opts);
    canvas.addEventListener('auxclick', e => e.preventDefault(), opts);
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); this.wheel += Math.sign(event.deltaY);
      this.wheel = Math.max(-5, Math.min(5, this.wheel));
    }, {...opts, passive: false});
    canvas.addEventListener('keydown', event => {
      if ([...this.controls.mouse,...this.controls.keyboard.flat()].includes(event.code)) {
        event.preventDefault(); this.keys.add(event.code);if(!event.repeat)this.pendingKeys.add(event.code);
      }
    }, opts);
    canvas.addEventListener('keyup', event => {this.keys.delete(event.code);}, opts);
    canvas.addEventListener('blur', this.clear, opts);
    window.addEventListener('blur', this.clear, opts);
    document.addEventListener('visibilitychange', () => this.pause(document.hidden), opts);
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
  }
  private point = (event: PointerEvent) => {
    this.pendingButtons|=event.buttons&~this.buttons;
    this.buttons=event.buttons;
    const rect = this.canvas.getBoundingClientRect();
    if(this.freeCamera&&(event.buttons&2)&&event.type==='pointermove'){
      this.camera.x=Math.max(this.canvas.width/2,Math.min(504-this.canvas.width/2,this.camera.x-(event.clientX-this.dragPoint.x)*this.canvas.width/rect.width));
      this.camera.y=Math.max(this.canvas.height/2,Math.min(350-this.canvas.height/2,this.camera.y-(event.clientY-this.dragPoint.y)*this.canvas.height/rect.height));
      this.module._liero_camera(this.camera.x,this.camera.y);if(this.previewing)this.render();
    }
    this.dragPoint={x:event.clientX,y:event.clientY};
    this.mouse = {x: (event.clientX-rect.left)*this.canvas.width/rect.width, y: (event.clientY-rect.top)*this.canvas.height/rect.height};
  };
  private dragPoint={x:0,y:0};
  private clear = () => {this.keys.clear();this.pendingKeys.clear();this.buttons=0;this.pendingButtons=0;this.wheel=0;this.debt=0;this.last=0;};
  start(localTwo=false, keyboardOnly=true, seed=crypto.getRandomValues(new Uint32Array(1))[0], network?:NetworkRound) {
    this.stop();this.previewing=false; this.localTwo=localTwo;this.keyboardOnly=keyboardOnly;
    this.network=network;this.freeCamera=false;this.module._liero_player(network?.seat===1?1:0);
    this.module._liero_audio();this.module._liero_mute(this.sound?0:1);
    this.module._liero_start(seed,(localTwo||network)?0:1);
    if(network)this.module._liero_participants(network.participants);
    this.active=true;this.paused=false;this.resize();
    this.canvas.focus(); this.raf=requestAnimationFrame(this.frame);
  }
  setSound(enabled:boolean){this.sound=enabled;this.module._liero_mute(enabled&&!this.paused?0:1);}
  refreshAppearance(){if(this.active)this.render();}
  async stopPlayer(){
    if(this.network)await this.network.requestStop();
    else{this.module._liero_step(256,96,0,0,96,0);this.render();}
  }
  setControls(controls:Controls){this.controls=structuredClone(controls);this.clear();}
  pause(paused:boolean){this.paused=paused&&!this.network;this.clear();this.module._liero_mute(this.sound&&!this.paused?0:1);}
  setCamera(player:number|'free'){this.freeCamera=player==='free';if(player!=='free')this.module._liero_player(player);else{const ptr=this.module._liero_info()>>2;this.camera={x:this.module.HEAP32[ptr+40]+this.canvas.width/2,y:this.module.HEAP32[ptr+41]+this.canvas.height/2};this.module._liero_camera(this.camera.x,this.camera.y);}if(this.previewing)this.render();}
  preview(seed=1){this.stop();this.network=undefined;this.previewing=true;this.localTwo=false;this.module._liero_start(seed,0);this.module._liero_camera(252,175);this.freeCamera=true;this.active=true;this.resize();}
  private resize(){
    const container=this.canvas.parentElement!.getBoundingClientRect();
    const ratio=container.width/Math.max(1,container.height);
    const width=this.localTwo?320:Math.max(320,Math.min(504,Math.round(200*ratio)));
    const height=this.localTwo?200:Math.max(200,Math.min(350,Math.round(width/ratio)));
    const scale=Math.min(container.width/width,container.height/height);
    this.canvas.style.width=`${width*scale}px`;this.canvas.style.height=`${height*scale}px`;
    this.canvas.width=width;this.canvas.height=height;
    this.pixels=new ImageData(width,height);this.module._liero_view(this.localTwo?1:0,width,height);
    if(this.active)this.render();
  }
  private keyboard(player:number){
    const codes=this.controls.keyboard[player];
    return codes.reduce((bits,key,index)=>bits|(this.keys.has(key)||this.pendingKeys.has(key)?1<<index:0),0);
  }
  private render(){
    const ptr=this.module._liero_render();
    this.pixels.data.set(this.module.HEAPU8.subarray(ptr,ptr+this.pixels.data.length));
    this.context.putImageData(this.pixels,0,0);
    const info=this.module._liero_info()>>2;this.onState(this.module.HEAP32.subarray(info,info+52));
  }
  private frame = (time: number) => {
    const menu=!!document.querySelector('dialog[open],#chat-compose:not([hidden])');
    if(this.paused){this.clear();this.raf=requestAnimationFrame(this.frame);return;}
    if(menu){this.keys.clear();this.pendingKeys.clear();this.buttons=0;this.pendingButtons=0;this.wheel=0;}
    this.network?.catchUp();
    if (!this.last) this.last = time;
    this.debt += Math.min(100, time-this.last); this.last=time;
    while (this.debt >= 1000/70) {
      const down=(index:number)=>this.keys.has(this.controls.mouse[index])||this.pendingKeys.has(this.controls.mouse[index]);
      const mouse=this.buttons|this.pendingButtons;
      const b=(down(0)?1:0)|(down(1)?2:0)|(down(4)||(mouse&4)?4:0)
        |((mouse&1)||down(5)?8:0)|((mouse&2)?16:0)|(down(2)?64:0)|(down(3)?128:0);
      const consumesInput=!this.network||this.network.needsInput;
      const wheel = Math.sign(this.wheel);if(consumesInput)this.wheel-=wheel;
      const aim = this.module._liero_aim(this.network?.seat===1?1:0,Math.round(this.mouse.x),Math.round(this.mouse.y));
      if(this.freeCamera){this.camera.x=Math.max(0,Math.min(504,this.camera.x+((b&2)?2:0)-((b&1)?2:0)));this.camera.y=Math.max(0,Math.min(350,this.camera.y+(down(3)?2:0)-(down(2)?2:0)));this.module._liero_camera(this.camera.x,this.camera.y);}
      if(this.network){if(this.network.ended){this.stop();this.onEnd();return;}const advanced=this.network.advance([b,aim,wheel]);if(consumesInput){this.pendingKeys.clear();this.pendingButtons=0;}if(!advanced)break;this.debt-=1000/70;continue;}
      const playing=this.localTwo?this.module._liero_step_local(b,aim,wheel,this.keyboardOnly?this.keyboard(0):-1,this.keyboard(1)):this.module._liero_step(b,aim,wheel,0,96,0);
      this.pendingKeys.clear();this.pendingButtons=0;
      if (!playing) {this.render();this.stop();this.onEnd();return;}
      this.debt -= 1000/70;
    }
    this.render();
    this.raf=requestAnimationFrame(this.frame);
  };
  stop() {cancelAnimationFrame(this.raf);this.active=false;this.clear();this.module._liero_mute(1);}
  dispose() {this.stop();this.resizeObserver.disconnect();this.events.abort();}
}
