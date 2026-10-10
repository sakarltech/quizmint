export const plans = [
 {id:'starter',name:'50 question credits',questions:50,amount:299,mode:'payment'},
 {id:'plus',name:'200 question credits',questions:200,amount:799,mode:'payment'},
 {id:'bulk',name:'500 question credits',questions:500,amount:1499,mode:'payment'},
 {id:'monthly',name:'Unlimited monthly',questions:0,amount:1299,mode:'subscription'},
] as const;
export function allocation(free:number,credits:number,count:number,unlimited:boolean){if(!Number.isInteger(count)||count<1||count>50)throw Error('Generate 1–50 questions at a time.');if(unlimited)return {free:0,paid:0};if(free+credits<count)throw Error('You need more question credits. Choose a credit pack or monthly plan.');return {free:Math.min(free,count),paid:Math.max(0,count-free)};}
export async function verifyStripe(raw:string,header:string,secret:string,now=Date.now()){
 const parts=header.split(',');const timestamp=parts.find(p=>p.startsWith('t='))?.slice(2);if(!timestamp||Math.abs(now/1000-Number(timestamp))>300)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw)));const expected=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 return parts.filter(p=>p.startsWith('v1=')).some(p=>{const actual=p.slice(3);if(actual.length!==expected.length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i);return diff===0;});
}
