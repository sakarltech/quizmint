export type SurveyQuestion = { prompt:string; type:'single'|'multiple'|'short'|'long'|'rating'; required:boolean; options:string[]; branches:(number|null)[] };
export type Survey = {title:string; description:string; closingMessage:string; identifierLabel:string; questions:SurveyQuestion[]};
const text=(value:unknown,max:number,label:string,required=false)=>{if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error(`Check ${label}.`);return value.trim();};
export function validateSurvey(input:unknown):Survey {
 if(!input||typeof input!=='object')throw Error('Invalid survey.');
 const x=input as Record<string,unknown>;
 const title=text(x.title,120,'the title',true),description=text(x.description,1000,'the description'),closingMessage=text(x.closingMessage,1000,'the closing message'),identifierLabel=text(x.identifierLabel,100,'the identifier label');
 if(!Array.isArray(x.questions)||x.questions.length<1||x.questions.length>50)throw Error('Include 1–50 questions.');
 const questionCount=x.questions.length;
 const questions=x.questions.map((raw:unknown,i:number):SurveyQuestion=>{
  if(!raw||typeof raw!=='object')throw Error(`Check question ${i+1}.`);
  const q=raw as Record<string,unknown>,prompt=text(q.prompt,1500,`question ${i+1}`,true);
  if(!['single','multiple','short','long','rating'].includes(String(q.type))||typeof q.required!=='boolean')throw Error(`Check question ${i+1}.`);
  const type=q.type as SurveyQuestion['type'];let options:string[]=[];let branches:(number|null)[]=[];
  if(type==='single'||type==='multiple'){
   if(!Array.isArray(q.options)||q.options.length<2||q.options.length>10)throw Error(`Question ${i+1} needs 2–10 options.`);
   options=q.options.map((o:unknown)=>text(o,600,`the options for question ${i+1}`,true));
   if(new Set(options.map(o=>o.toLowerCase())).size!==options.length)throw Error(`Question ${i+1} needs distinct options.`);
   if(type==='single'){
    if(!Array.isArray(q.branches)||q.branches.length!==options.length)throw Error(`Check the branching for question ${i+1}.`);
    branches=q.branches.map((v:unknown)=>{if(v===null||v===-1)return v;if(!Number.isInteger(v)||Number(v)<=i||Number(v)>=questionCount)throw Error(`Question ${i+1} can only branch forward.`);return Number(v);});
   }
  }
  return {prompt,type,required:q.required,options,branches};
 });
 return {title,description,closingMessage,identifierLabel,questions};
}
export function validateSurveyResponse(survey:Survey,identifier:unknown,values:unknown){
 if(survey.identifierLabel)text(identifier,254,'the required identifier',true);
 else if(identifier!==undefined&&identifier!==null&&identifier!=='')throw Error('This survey does not collect identifiers.');
 if(!Array.isArray(values)||values.length!==survey.questions.length)throw Error('Check your answers.');
 const answers:(string|string[]|number|null)[]=Array(values.length).fill(null),seen:number[]=[];
 let i=0;while(i<survey.questions.length){
  const q=survey.questions[i],value=values[i];seen.push(i);let next=i+1;
  if(q.type==='single'||q.type==='rating'){
   const max=q.type==='rating'?5:q.options.length;
   if(value===null||value===undefined||value===''){if(q.required)throw Error(`Answer question ${i+1}.`);}
   else {if(!Number.isInteger(value)||value<0||value>=max)throw Error(`Check question ${i+1}.`);answers[i]=value;if(q.type==='single'){const destination=q.branches[value];if(destination===-1)next=survey.questions.length;else if(destination!==null)next=destination;}}
  }else if(q.type==='multiple'){
   if(!Array.isArray(value)||value.some(v=>!Number.isInteger(v)||v<0||v>=q.options.length)||new Set(value).size!==value.length)throw Error(`Check question ${i+1}.`);
   if(q.required&&!value.length)throw Error(`Answer question ${i+1}.`);answers[i]=value.length?value.map(v=>q.options[v]):null;
  }else {const answer=text(value??'',q.type==='short'?500:5000,`question ${i+1}`,q.required);answers[i]=answer||null;}
  i=next;
 }
 for(let n=0;n<values.length;n++)if(!seen.includes(n)&&values[n]!=null&&values[n]!==''&&!(Array.isArray(values[n])&&values[n].length===0))throw Error('Answers include questions outside your survey path.');
 return {identifier:survey.identifierLabel?String(identifier).trim():null,answers,seen};
}
