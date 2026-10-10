export type Question = {prompt:string;options:string[];correct:number;explanation:string};
export function validateQuiz(input:any) {
 if(!input || typeof input.title!=='string' || !input.title.trim() || input.title.length>120) throw new Error('Add a title (up to 120 characters).');
 if(typeof input.subject!=='string' || input.subject.length>80 || typeof input.description!=='string' || input.description.length>1000) throw new Error('Check the subject and instructions.');
 if(!Array.isArray(input.questions) || input.questions.length<1 || input.questions.length>50) throw new Error('Include 1–50 questions.');
 const questions:Question[]=input.questions.map((q:any)=>{
  if(typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>1500||!Array.isArray(q.options)||q.options.length!==4||q.options.some((o:any)=>typeof o!=='string'||!o.trim()||o.length>600)||new Set(q.options.map((o:string)=>o.trim())).size!==4||!Number.isInteger(q.correct)||q.correct<0||q.correct>3||typeof q.explanation!=='string'||!q.explanation.trim()||q.explanation.length>2000) throw new Error('Each question needs four distinct options, one correct answer and an explanation.');
  return {prompt:q.prompt.trim(),options:q.options.map((o:string)=>o.trim()),correct:q.correct,explanation:q.explanation.trim()};
 });
 return {title:input.title.trim(),subject:input.subject.trim(),description:input.description.trim(),questions};
}
export function grade(questions:Question[], answers:number[]) {
 if(!Array.isArray(answers)||answers.length!==questions.length||answers.some(a=>!Number.isInteger(a)||a<0||a>3)) throw new Error('Answer every question before submitting.');
 const feedback=questions.map((q,i)=>({...q,selected:answers[i],isCorrect:q.correct===answers[i]}));
 return {score:feedback.filter(q=>q.isCorrect).length,total:questions.length,feedback};
}
