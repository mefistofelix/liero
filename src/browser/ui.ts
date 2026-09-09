import {runAction} from './pending-action.ts';
export {setDisabled} from './pending-action.ts';
export const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
export const input=(id:string)=>el<HTMLInputElement>(id);
export const select=(id:string)=>el<HTMLSelectElement>(id);
export const button=(text:string,action:()=>unknown,cls='')=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.className=cls;b.onclick=()=>{void runAction(b,action).catch(report);};return b;};
let timer=0;export function notice(message:string){const toast=el('toast');toast.textContent=message;toast.hidden=false;clearTimeout(timer);timer=window.setTimeout(()=>toast.hidden=true,6500);const dialog=document.querySelector('dialog[open]');if(dialog){let p=dialog.querySelector('.dialog-toast');if(!p){p=document.createElement('p');p.className='dialog-toast';p.setAttribute('role','status');dialog.querySelector('.dialog-heading')?.after(p);}p.textContent=message;}}
export function report(error:unknown){console.error(error);notice(error instanceof Error?error.message:String(error));}
const opening=new Map<string,(()=>unknown)[]>();let menuChange=(open:boolean)=>{};
export function onMenu(id:string,fn:()=>unknown){opening.set(id,[...(opening.get(id)||[]),fn]);}
export function menuHandler(fn:(open:boolean)=>void){menuChange=fn;}
const menuStack:string[]=[];const closing=new Map<string,()=>void>();
export function onMenuClose(id:string,fn:()=>void){closing.set(id,fn);}
function hideMenus(){document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>{closing.get(d.id)?.();d.close();});}
function showMenu(id:string,restore=false){const target=el<HTMLDialogElement>(id);if(target.classList.contains('dropdown'))target.show();else target.showModal();menuChange(true);if(!restore)for(const fn of opening.get(id)||[])Promise.resolve().then(fn).catch(report);}
export function closeMenus(){menuStack.length=0;hideMenus();menuChange(false);}
function backMenu(){const previous=menuStack.pop();hideMenus();if(previous)showMenu(previous,true);else menuChange(false);}
export function openMenu(id:string){const current=document.querySelector<HTMLDialogElement>('dialog[open]');if(current?.id===id){backMenu();return;}if(current)menuStack.push(current.id);hideMenus();showMenu(id);}
export function click(id:string,fn:()=>unknown){const target=el(id);target.addEventListener('click',()=>{void runAction(target,fn).catch(report);});}
export function form(id:string,fn:()=>unknown){const target=el<HTMLFormElement>(id);target.addEventListener('submit',e=>{e.preventDefault();const submitter=e.submitter as HTMLButtonElement|null;const control=submitter||target.querySelector<HTMLButtonElement>('button[type=submit],button:not([type])')||target;void runAction(control,fn,target).catch(report);});}
document.querySelectorAll<HTMLElement>('[data-open]').forEach(b=>b.onclick=()=>openMenu(b.dataset.open!));
document.querySelectorAll<HTMLElement>('[data-close]').forEach(b=>b.onclick=backMenu);
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(d=>{d.addEventListener('cancel',event=>{if(event.target!==d)return;event.preventDefault();backMenu();});d.addEventListener('close',()=>menuChange(!!document.querySelector('dialog[open]')));});
document.addEventListener('pointerdown',event=>{const target=event.target as HTMLElement;if(!target.closest('dialog,.corner-tools')&&document.querySelector('dialog.dropdown[open]'))closeMenus();});
window.addEventListener('keydown',event=>{if(event.code==='Escape'){const dropdown=document.querySelector<HTMLDialogElement>('dialog.dropdown[open]');if(dropdown){event.preventDefault();event.stopImmediatePropagation();backMenu();}}});
