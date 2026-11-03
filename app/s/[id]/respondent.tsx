'use client';
import {useEffect,useRef,useState} from 'react';
import Brand from '../../../components/brand';
import SurveyForm from '../../../components/survey-form';
import type {Survey} from '../../../lib/survey';
export default function SurveyRespondent({id}:{id:string}){
 const [survey,setSurvey]=useState<Survey|null>(null),[error,setError]=useState('');const responseId=useRef('');
 useEffect(()=>{responseId.current=crypto.randomUUID();let alive=true;fetch('/api/surveys/'+id).then(async r=>{const x:any=await r.json();if(!r.ok)throw Error(x.error);if(alive)setSurvey(x.survey);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[id]);
 async function submit(identifier:string,answers:unknown[]){const r=await fetch('/api/surveys/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier,answers,responseId:responseId.current})});const x:any=await r.json();if(!r.ok)throw Error(x.error||'Unable to submit.');}
 return <><header className="header"><Brand/></header><main className="student-shell">{error?<p className="alert" role="alert">{error}</p>:survey?<SurveyForm survey={survey} onSubmit={submit}/>:<p role="status">Loading survey…</p>}</main></>;
}
