// Shared action state for static buttons, generated buttons and form submissions.
type Control=HTMLElement&{disabled?:boolean};
type Pending={disabled:boolean|undefined;busy:string|null};
const pending=new WeakMap<Control,Pending>(),running=new WeakSet<object>();
export function setDisabled(control:Control,value:boolean){const state=pending.get(control);if(state){state.disabled=value;control.disabled=true;}else control.disabled=value;}
export async function runAction(control:Control,action:()=>unknown,key:object=control){
 if(running.has(key)||pending.has(control)||control.disabled)return;
 running.add(key);
 try{
  const result=action();
  // Keep synchronous toggles immediate; only asynchronous work gets a spinner.
  if(!result||typeof (result as PromiseLike<unknown>).then!=='function')return result;
  const state:Pending={disabled:control.disabled,busy:control.getAttribute('aria-busy')};pending.set(control,state);
  control.setAttribute('aria-busy','true');if('disabled' in control)control.disabled=true;
  try{return await result;}finally{
   pending.delete(control);if(state.disabled!==undefined)control.disabled=state.disabled;
   if(state.busy===null)control.removeAttribute('aria-busy');else control.setAttribute('aria-busy',state.busy);
  }
 }finally{running.delete(key);}
}
