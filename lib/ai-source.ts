// Keep every character; prefer paragraph boundaries so slides and sections stay together.
export const MAX_SOURCE_CHARS=400000;
export const SECTION_CHARS=20000;
export function sourceSections(text:string){
 if(text.length>MAX_SOURCE_CHARS)throw Error('This source exceeds 400,000 characters. Choose a chapter or a smaller document.');
 const sections:string[]=[];
 for(let start=0;start<text.length;){
  let end=Math.min(start+SECTION_CHARS,text.length);
  if(end<text.length){const boundary=text.lastIndexOf('\n',end);if(boundary>start+SECTION_CHARS/2)end=boundary+1;}
  sections.push(text.slice(start,end));start=end;
 }
 return sections;
}
function decodeXML(text:string){return text.replace(/&#x([0-9a-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos);/gi,(entity,hex,decimal,name)=>{if(name)return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[name.toLowerCase()];const n=parseInt(hex||decimal,hex?16:10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):entity;});}
export function officeText(xml:string,kind:'docx'|'pptx'){
 const prefix=kind==='pptx'?'a':'w';
 // Read text runs only, excluding formatting attributes, metadata and XML indentation.
 const paragraphs=xml.match(new RegExp(`<${prefix}:p(?:\\s[^>]*)?>[\\s\\S]*?<\\/${prefix}:p>`,'g'))||[];
 return paragraphs.map(p=>Array.from(p.matchAll(new RegExp(`<${prefix}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${prefix}:t>`,'g')),m=>decodeXML(m[1])).join('')).filter(Boolean).join('\n');
}
