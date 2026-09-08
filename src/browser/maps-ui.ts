import {builtins,savedLevels,importLevel,levelBytes,thumbnail,type Level} from './maps.ts';
import {el,input,select,button,onMenu,notice,report,click} from './ui.ts';
import type {Preferences} from './preferences.ts';
export class MapLibrary{
 private viewingRotation?:string[];
 private get rotation(){return this.viewingRotation??this.prefs.rotation;}
 private set rotation(value:string[]){if(!this.viewingRotation)this.prefs.rotation=value;}
 setRoom(rotation?:string[]){this.viewingRotation=rotation;input('map-files').disabled=!!rotation;el<HTMLButtonElement>('enable-maps').disabled=!!rotation;}
 levels:Level[]=[...builtins];private page=0;private version=0;private visible:Level[]=[];private rotationPosition=0;
 constructor(private prefs:Preferences,private save:()=>void,private palette:Uint8Array){
  onMenu('maps-menu',()=>this.render());
  for(const id of ['map-search','map-filter'])el(id).addEventListener('input',()=>{this.page=0;this.render();});
  click('maps-prev',()=>{this.page--;this.render();});click('maps-next',()=>{this.page++;this.render();});
  click('enable-maps',()=>{this.rotation=[...new Set([...this.rotation,...this.visible.map(l=>l.id)])];this.save();this.render();});
  input('map-files').onchange=()=>{this.importFiles(Array.from(input('map-files').files||[]));input('map-files').value='';};
  const drop=el('map-drop');drop.ondragover=e=>{e.preventDefault();drop.classList.add('dragging');};drop.ondragleave=()=>drop.classList.remove('dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('dragging');this.importFiles(Array.from(e.dataTransfer?.files||[]));};
 }
 async init(){this.levels.push(...await savedLevels());}
 async next(rotation=this.rotation){if(!rotation.length)throw new Error('Enable at least one map in the rotation.');const id=rotation[this.rotationPosition++%rotation.length],level=this.levels.find(l=>l.id===id);if(!level)throw new Error('A rotation map is missing from this device. Import it again or disable it.');return {level,data:await levelBytes(level)};}
 async importFiles(files:File[]){if(this.viewingRotation){notice('Only the host can change room maps.');return;}for(const file of files){try{const level=await importLevel(file,this.palette),index=this.levels.findIndex(l=>l.id===level.id);if(index<0)this.levels.unshift(level);else this.levels[index]=level;if(!this.rotation.includes(level.id))this.rotation.push(level.id);this.save();notice(`Imported ${level.name} and added it to the rotation.`);}catch(error){report(error);}}select('map-filter').value='imported';this.page=0;this.render();}
 render(){
  const version=++this.version,search=input('map-search').value.toLowerCase(),filter=select('map-filter').value;
  const levels=this.levels.filter(l=>l.name.toLowerCase().includes(search)&&(filter==='all'||filter==='selected'&&this.rotation.includes(l.id)||filter==='imported'&&l.id.startsWith('import:')||Number(filter)>0&&((l.flags||0)&Number(filter))!==0));
  const pages=Math.max(1,Math.ceil(levels.length/24));this.page=Math.max(0,Math.min(pages-1,this.page));this.visible=levels.slice(this.page*24,this.page*24+24);
  el('maps-status').textContent=`${levels.length} maps · ${this.rotation.length} in rotation`;el('map-page').textContent=`${this.page+1} / ${pages}`;
  el<HTMLButtonElement>('maps-prev').disabled=this.page===0;el<HTMLButtonElement>('maps-next').disabled=this.page===pages-1;
  const grid=el('map-grid');grid.replaceChildren();const tasks:(()=>Promise<void>)[]=[];
  for(const level of this.visible){const card=document.createElement('article');card.className=`map-card ${this.rotation.includes(level.id)?'selected':''}`;const preview=document.createElement('div');preview.className='preview';preview.textContent=level.id==='random'?'New terrain every round':'Loading preview…';const label=document.createElement('label'),checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.disabled=!!this.viewingRotation;checkbox.checked=this.rotation.includes(level.id);checkbox.onchange=()=>{if(checkbox.checked)this.rotation.push(level.id);else this.rotation=this.rotation.filter(id=>id!==level.id);this.save();card.classList.toggle('selected',checkbox.checked);this.renderRotation();el('maps-status').textContent=`${levels.length} maps · ${this.rotation.length} in rotation`;};label.append(checkbox,document.createTextNode(level.name));card.append(preview,label);grid.append(card);
   if(level.preview){const image=document.createElement('img');image.src=level.preview;image.loading='lazy';image.alt=level.name+' terrain preview';image.onerror=()=>{preview.replaceChildren(button('Retry preview',()=>{image.src=level.preview!+'?retry='+Date.now();preview.replaceChildren(image);}));};preview.replaceChildren(image);}else if(level.id!=='random')tasks.push(async()=>{try{const data=await levelBytes(level);if(version!==this.version||!preview.isConnected)return;const image=document.createElement('img');image.src=level.preview??=thumbnail(data!,this.palette);image.alt=`${level.name} terrain preview`;preview.replaceChildren(image);}catch{if(version===this.version){preview.replaceChildren(button('Retry preview',()=>{level.data=undefined;this.render();}));}}});
  }
  for(let worker=0;worker<4;worker++)(async()=>{while(tasks.length&&version===this.version)await tasks.shift()!();})();this.renderRotation();
 }
 private renderRotation(){el('rotation-summary').textContent=`Rotation order · ${this.rotation.length} maps`;const list=el('rotation-list');list.replaceChildren();this.rotation.forEach((id,index)=>{const li=document.createElement('li');li.append(document.createTextNode(this.levels.find(l=>l.id===id)?.name||id));for(const [label,delta]of [['↑',-1],['↓',1]] as const){const b=button(label,()=>{const to=index+delta;[this.rotation[index],this.rotation[to]]=[this.rotation[to],this.rotation[index]];this.save();this.renderRotation();});b.disabled=!!this.viewingRotation||index+delta<0||index+delta>=this.rotation.length;b.setAttribute('aria-label',`${delta<0?'Move up':'Move down'} ${li.textContent}`);li.append(b);}list.append(li);});}
}
