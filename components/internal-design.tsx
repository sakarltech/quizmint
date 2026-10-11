'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {LayoutDashboard,FileText,Trophy,UserRound,CircleHelp,Sparkles,Menu,X,ArrowRight,ArrowLeft,BookOpen,Activity} from 'lucide-react';

export default function InternalDesign({children}:{children:React.ReactNode}){
 const path=usePathname()||'/',[open,setOpen]=useState(false),[admin,setAdmin]=useState(false),toggle=useRef<HTMLButtonElement>(null);
 const workspace=['/teacher','/admin','/admin/health','/profile','/help','/arena'].includes(path);
 useEffect(()=>{setOpen(false);setAdmin(path.startsWith('/admin')||(path==='/arena'&&new URLSearchParams(location.search).get('admin')==='1'));},[path]);
 function close(){setOpen(false);toggle.current?.focus();}
 if(path==='/')return <>{children}</>;
 const library=admin?'/admin':'/teacher';
 const links=[{href:'/library',label:'Shared quiz library',icon:BookOpen,active:path==='/library'},...(admin?[{href:'/admin/health',label:'Health & costs',icon:Activity,active:path==='/admin/health'}]:[]),{href:library,label:admin?'Admin dashboard':'Dashboard',icon:LayoutDashboard,active:path==='/teacher'||path==='/admin'}, {href:library+'?studio=manual',label:'Create a quiz',icon:FileText,active:false},{href:'/arena'+(admin?'?admin=1':''),label:'Arena competitions',icon:Trophy,active:path==='/arena'},...(!admin?[{href:'/profile',label:'My profile',icon:UserRound,active:path==='/profile'}]:[]),{href:'/pricing',label:'Pricing',icon:Sparkles,active:path==='/pricing'},{href:'/help',label:'Help centre',icon:CircleHelp,active:path==='/help'}];
 return <div className={'qm-interior'+(workspace?' qm-workspace':'')} onKeyDown={event=>{if(event.key==='Escape'&&open)close();}}>
 <nav className="qm-home-return" aria-label="Home navigation"><a href="/"><ArrowLeft size={16} aria-hidden="true"/><span>Back to home</span></a></nav>
 {workspace&&<><button ref={toggle} type="button" className="qm-sidebar-toggle" aria-label={open?'Close menu':'Open menu'} aria-controls="qm-workspace-menu" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?<X size={22}/>:<Menu size={22}/>}</button>{open&&<button type="button" className="qm-sidebar-backdrop" onClick={close} aria-label="Close navigation"/>}<aside id="qm-workspace-menu" className={'qm-sidebar'+(open?' is-open':'')} aria-label="Workspace navigation"><span className="qm-sidebar-label">{admin?'ADMIN WORKSPACE':'YOUR CREATOR SPACE'}</span><nav>{links.map(({href,label,icon:Icon,active})=><a href={href} key={label} aria-current={active?'page':undefined} onClick={()=>setOpen(false)}><Icon size={19} aria-hidden="true"/><span>{label}</span></a>)}</nav><div className="qm-studio-note"><Sparkles size={22} aria-hidden="true"/><strong>A little AI magic</strong><p>Turn your lesson into a draft. Review it, then make it yours.</p><a href={library+'?studio=ai'}>Open question studio <ArrowRight size={16}/></a></div><div className="qm-sidebar-legal"><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div></aside></>}
 {children}
 </div>;
}
