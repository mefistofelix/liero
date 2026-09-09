export function chatParts(text:string){
 const parts:{text:string;href?:string}[]=[];let cursor=0;
 for(const match of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi)){
  let label=match[0].replace(/[.,!?;:]+$/,'');
  for(const [open,close]of [['(',')'],['[',']'],['{','}']])while(label.endsWith(close)&&label.split(close).length>label.split(open).length)label=label.slice(0,-1);
  let url:URL;try{url=new URL(/^www\./i.test(label)?'https://'+label:label);}catch{continue;}
  if(!url.hostname||!['http:','https:'].includes(url.protocol))continue;
  if(match.index!>cursor)parts.push({text:text.slice(cursor,match.index)});
  parts.push({text:label,href:url.href});cursor=match.index!+label.length;
 }
 if(cursor<text.length)parts.push({text:text.slice(cursor)});
 return parts;
}

export function chatText(text:string){
 const fragment=document.createDocumentFragment();
 for(const part of chatParts(text)){
  if(!part.href){fragment.append(document.createTextNode(part.text));continue;}
  const link=document.createElement('a');link.href=part.href;link.textContent=part.text;
  link.target='_blank';link.rel='noopener noreferrer';fragment.append(link);
 }
 return fragment;
}
