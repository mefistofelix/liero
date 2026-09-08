import {defaultControls,type Preferences} from './preferences.ts';
import {el,select,button,onMenu,notice} from './ui.ts';
const mouseActions=['Move left','Move right','Up / jump / shorten rope','Down / extend rope','Jump / release rope','Fire (keyboard alternative)'];
const keyboardActions=['Aim up / shorten rope with modifier','Aim down / extend rope with modifier','Move left','Move right','Fire','Weapon / rope modifier','Jump / release rope'];
export function controlsUI(prefs:Preferences,save:()=>void,changed:()=>void){
 const section=document.createElement('section');section.className='controls-settings';const heading=document.createElement('h3');heading.textContent='Key bindings';const mode=document.createElement('select');mode.id='control-profile';mode.setAttribute('aria-label','Control profile');for(const [value,text]of [['mouse','Mouse + keyboard'],['0','Local player 1 · keyboard'],['1','Local player 2 · keyboard']]){const option=new Option(text,value);mode.add(option);}const rows=document.createElement('div');rows.className='binding-list';let pending=-1;
 const keys=()=>mode.value==='mouse'?prefs.controls.mouse:prefs.controls.keyboard[Number(mode.value)];
 const pretty=(code:string)=>code.replace(/^Key/,'').replace(/^Digit/,'').replace(/([a-z])([A-Z])/g,'$1 $2');
 const render=()=>{pending=-1;rows.replaceChildren();const labels=mode.value==='mouse'?mouseActions:keyboardActions;keys().forEach((key,index)=>{const row=document.createElement('div');row.className='binding-row';const label=document.createElement('span');label.textContent=labels[index];const b=button(pretty(key),()=>{pending=index;b.textContent='Press a key…';notice('Press a key. Escape cancels. Duplicate bindings will be swapped.');});b.setAttribute('aria-label','Rebind '+labels[index]);row.append(label,b);rows.append(row);});};
 section.append(heading,mode,rows,button('Reset controls',()=>{prefs.controls=structuredClone(defaultControls);save();changed();render();}));el('settings-menu').append(section);mode.onchange=render;render();
 onMenu('settings-menu',render);
 window.addEventListener('keydown',event=>{if(pending<0||!el<HTMLDialogElement>('settings-menu').open)return;event.preventDefault();event.stopImmediatePropagation();if(event.code==='Escape'){render();notice('Key change canceled.');return;}if(event.code==='Tab'){notice('Tab is reserved for the leaderboard.');return;}const list=keys(),duplicate=list.indexOf(event.code);if(duplicate>=0)list[duplicate]=list[pending];list[pending]=event.code;save();changed();render();notice('Key binding saved.');},true);
}
