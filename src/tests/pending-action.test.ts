import {test,expect} from 'bun:test';
import {runAction,setDisabled} from '../browser/pending-action.ts';
const control=()=>{const attributes=new Map<string,string>();return {disabled:false,getAttribute:(key:string)=>attributes.get(key)??null,setAttribute:(key:string,value:string)=>attributes.set(key,value),removeAttribute:(key:string)=>attributes.delete(key)} as any;};
test('pending buttons reject duplicate clicks and restore after success',async()=>{
 const b=control();let done:(value?:unknown)=>void=()=>{},calls=0;const action=()=>{calls++;return new Promise(resolve=>done=resolve);};
 const work=runAction(b,action);expect(b.disabled).toBe(true);expect(b.getAttribute('aria-busy')).toBe('true');await runAction(b,action);expect(calls).toBe(1);
 setDisabled(b,false);expect(b.disabled).toBe(true);done();await work;expect(b.disabled).toBe(false);expect(b.getAttribute('aria-busy')).toBeNull();
});
test('failed actions unlock for retry and retain updated permission restrictions',async()=>{
 const b=control();let fail:(error:Error)=>void=()=>{};const work=runAction(b,()=>new Promise((_,reject)=>fail=reject));fail(new Error('Offline'));await expect(work).rejects.toThrow('Offline');expect(b.disabled).toBe(false);
 let done:()=>void=()=>{};const next=runAction(b,()=>new Promise<void>(resolve=>done=resolve));setDisabled(b,true);done();await next;expect(b.disabled).toBe(true);expect(b.getAttribute('aria-busy')).toBeNull();
});
test('form submission lock also blocks Enter or another submit button',async()=>{
 const form={},a=control(),b=control();let done:()=>void=()=>{},calls=0;const work=runAction(a,()=>{calls++;return new Promise<void>(resolve=>done=resolve);},form);await runAction(b,()=>calls++,form);expect(calls).toBe(1);done();await work;await runAction(b,()=>calls++,form);expect(calls).toBe(2);expect(b.getAttribute('aria-busy')).toBeNull();
});
