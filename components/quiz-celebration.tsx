'use client';
import {useEffect,useState,type CSSProperties} from 'react';

export default function QuizCelebration(){
 const [active,setActive]=useState(false);
 useEffect(()=>{
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let timer:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{setActive(false);if(timer)clearTimeout(timer);};
  if(!preference.matches){setActive(true);timer=setTimeout(stop,3200);}
  const onChange=()=>{if(preference.matches)stop();};
  preference.addEventListener('change',onChange);
  return ()=>{if(timer)clearTimeout(timer);preference.removeEventListener('change',onChange);};
 },[]);
 return <div className="quiz-celebration" aria-hidden="true">
  <span className={'quiz-applause'+(active?' is-clapping':'')}>👏</span>
  {active&&<div className="quiz-confetti">{Array.from({length:48},(_,i)=>{
   const angle=i*2.3999632297;
   const radius=100+(i%7)*30;
   return <span key={i} style={{'--x':`${Math.cos(angle)*radius}px`,'--y':`${Math.sin(angle)*radius-60}px`,'--spin':`${(i%2?1:-1)*(180+i*17)}deg`,'--delay':`${i%6*35}ms`,'--colour':['#7054c9','#116b55','#a4e8c8','#ffad72','#f4cf57','#ea88ad'][i%6]} as CSSProperties}/>;
  })}</div>}
 </div>;
}
