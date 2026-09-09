import {test,expect} from 'bun:test';
import {chatParts,chatText} from '../browser/chat-text.ts';

test('chat links preserve text, queries, fragments and balanced URL parentheses',()=>{
 const text='Join https://liero.haxthepax.chatgpt.site/#room=123&invite=abc, or (https://example.com/Map_(level)). www.example.com!';
 const parts=chatParts(text);
 expect(parts.map(p=>p.text).join('')).toBe(text);
 expect(parts.filter(p=>p.href).map(p=>p.href)).toEqual(['https://liero.haxthepax.chatgpt.site/#room=123&invite=abc','https://example.com/Map_(level)','https://www.example.com/']);
 expect(chatParts('javascript:alert(1) data:text/html,test https://')).toEqual([{text:'javascript:alert(1) data:text/html,test https://'}]);
});

test('chat renders literal markup as text and HTTP links as isolated new-tab anchors',()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 const fragment={children:[] as any[],append(child:any){this.children.push(child);}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createDocumentFragment:()=>fragment,createTextNode:(text:string)=>({text}),createElement:(tag:string)=>({tag})}});
 try{
  chatText('<img src=x onerror=alert(1)> https://example.com/?a=1&b=2');
  expect(fragment.children[0].text).toBe('<img src=x onerror=alert(1)> ');
  expect(fragment.children[1]).toEqual({tag:'a',href:'https://example.com/?a=1&b=2',textContent:'https://example.com/?a=1&b=2',target:'_blank',rel:'noopener noreferrer'});
 }finally{if(previous)Object.defineProperty(globalThis,'document',previous);else delete (globalThis as any).document;}
});
