'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {ArrowUp,MessageCircle,Sparkles,X} from 'lucide-react';
import {helpLinks,HelpLinkId} from '../lib/help-knowledge';
type Message={role:'user'|'assistant';content:string;links?:HelpLinkId[];mode?:string};
const welcome:Message={role:'assistant',content:'Hey, I’m Minty 👋 Your QuizMint guide. Ask me about creating quizzes, AI uploads, plans or Arena. Where would you like to start?'};
const starters=['How do I create my first quiz?','What does AI cost?','How do I host an Arena competition?','Which files can I upload?'];
export default function Minty(){
 const path=usePathname()||'/',[open,setOpen]=useState(false),[messages,setMessages]=useState<Message[]>([welcome]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const launcher=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),log=useRef<HTMLDivElement>(null),pending=useRef<AbortController|null>(null);
 const hidden=path.startsWith('/q/')||(/^\/arena\/[^/]+/.test(path)&&!path.endsWith('/host'));
 useEffect(()=>{if(open&&!hidden&&!busy)input.current?.focus()},[open,hidden,busy]);
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight},[messages,busy,open]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 function close(){setOpen(false);launcher.current?.focus()}
 async function send(value:string){if(busy||!value.trim())return;const message=value.trim().slice(0,1000),history=messages.slice(1).slice(-6).map(m=>({role:m.role,content:m.content}));setMessages(m=>[...m.slice(-29),{role:'user',content:message}]);setDraft('');setError('');setBusy(true);const controller=new AbortController();pending.current=controller;const timeout=setTimeout(()=>controller.abort(),27000);
  try{const page=path==='/teacher'?'creator':path==='/admin'?'admin':path==='/profile'?'profile':path.startsWith('/arena')?'arena':path==='/login'?'login':path==='/help'?'help':'home';const r=await fetch('/api/help',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({message,history,page})});const x:any=await r.json();if(!r.ok)throw Error(x.error||'Minty is unavailable.');if(typeof x.answer!=='string'||!Array.isArray(x.links))throw Error('Minty is unavailable.');setMessages(m=>[...m.slice(-29),{role:'assistant',content:x.answer,links:x.links.filter((id:string)=>Object.hasOwn(helpLinks,id)),mode:x.mode}]);}
  catch(e){setError(e instanceof Error&&e.name==='AbortError'?'Minty took too long to respond. Try again or browse the help centre.':e instanceof Error?e.message:'Minty is unavailable. Browse the help centre.');setDraft(message)}finally{clearTimeout(timeout);pending.current=null;setBusy(false);input.current?.focus()}
 }
 if(hidden)return null;
 return <div className="minty-widget">{open&&<section id="minty-panel" className="minty-panel" role="dialog" aria-label="Minty, your QuizMint guide" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();close()}}}>
  <header className="minty-header"><span className="minty-avatar" aria-hidden="true"><Sparkles size={22}/></span><div><h2>Minty</h2><p>Your QuizMint guide</p></div><button type="button" aria-label="Close Minty" onClick={close}><X size={20}/></button></header>
  <div className="minty-log" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" ref={log}>{messages.map((m,i)=><div key={i} className={'minty-message '+m.role}><span className="minty-speaker">{m.role==='user'?'You':m.mode==='guide'?'Minty · Help guide (AI unavailable)':'Minty'}</span><p>{m.content}</p>{m.links?.length? <div className="minty-links">{m.links.map(id=><a href={helpLinks[id].href} key={id}>{helpLinks[id].label} →</a>)}</div>:null}</div>)}{busy&&<p className="minty-thinking" role="status">Minty is thinking…</p>}</div>
  {messages.length===1&&<div className="minty-starters">{starters.map(s=><button type="button" key={s} onClick={()=>send(s)} disabled={busy}>{s}</button>)}</div>}
  {error&&<p className="minty-error" role="alert">{error} <a href="/help">Open help centre</a></p>}
  <form className="minty-form" onSubmit={e=>{e.preventDefault();send(draft)}}><label className="sr-only" htmlFor="minty-input">Ask Minty about QuizMint</label><input id="minty-input" ref={input} placeholder="Ask about QuizMint…" maxLength={1000} value={draft} onChange={e=>setDraft(e.target.value)} disabled={busy}/><button type="submit" aria-label="Send message" disabled={busy||!draft.trim()}><ArrowUp size={20}/></button></form>
  <footer className="minty-footer"><p>AI guidance may be mistaken. Don’t share personal or payment details. Messages go to the AI provider; chat clears on reload.</p><div><a href="/help">Help centre</a><a href="/privacy">Privacy</a><button type="button" disabled={busy} onClick={()=>{setMessages([welcome]);setError('');setDraft('');input.current?.focus()}}>Clear chat</button></div></footer>
 </section>}<button ref={launcher} type="button" className="minty-launcher" aria-expanded={open} aria-controls={open?'minty-panel':undefined} aria-label={open?'Close Minty help':'Ask Minty for help'} onClick={()=>open?close():setOpen(true)}><MessageCircle size={21}/><span>Ask Minty</span></button></div>;
}
