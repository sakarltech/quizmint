import {validateDiagram,diagramRelevance,type Diagram} from './diagrams';
export type Answer = number | number[];
export type Question = {prompt:string;options:string[];correct:Answer;explanation:string;image?:{id:string;alt:string;caption?:string};diagram?:Diagram;diagramRelevance?:{helpful:boolean;reason:string}};
export function validateQuiz(input:any) {
 if(!input || typeof input.title!=='string' || !input.title.trim() || input.title.length>120) throw new Error('Add a title (up to 120 characters).');
 if(typeof input.subject!=='string' || input.subject.length>80 || typeof input.description!=='string' || input.description.length>1000) throw new Error('Check the subject and instructions.');
 if(!Array.isArray(input.questions) || input.questions.length<1 || input.questions.length>50) throw new Error('Include 1–50 questions.');
 const questions:Question[]=input.questions.map((q:any)=>{
  if(!q)throw Error('Invalid question.');
  if(typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>1500||!Array.isArray(q.options)||q.options.length!==4||q.options.some((o:any)=>typeof o!=='string'||!o.trim()||o.length>600)||new Set(q.options.map((o:string)=>o.trim())).size!==4||typeof q.explanation!=='string'||!q.explanation.trim()||q.explanation.length>2000) throw new Error('Each question needs four distinct options and an explanation.');
  const multiSelect=Array.isArray(q.correct);
  if(!validAnswer(q.correct,multiSelect)|| (multiSelect&&q.correct.length<2))throw Error('Choose one correct option for single answer or at least two for select all that apply.');
  let image:Question['image'];if(q.image!=null){if(typeof q.image!=='object'||typeof q.image.id!=='string'||!/^[a-f0-9]{32}$/.test(q.image.id)||typeof q.image.alt!=='string'||!q.image.alt.trim()||q.image.alt.length>500||(q.image.caption!=null&&(typeof q.image.caption!=='string'||q.image.caption.length>300)))throw Error('Each image needs a valid upload and a description (up to 500 characters); captions can be up to 300 characters.');image={id:q.image.id,alt:q.image.alt.trim(),...(q.image.caption?.trim()?{caption:q.image.caption.trim()}:{})};}
  return {...(q.diagramRelevance!=null?{diagramRelevance:diagramRelevance(q.diagramRelevance)}:{}),...(image?{image}:{}),...(q.diagram!=null?{diagram:validateDiagram(q.diagram)}:{}),prompt:q.prompt.trim(),options:q.options.map((o:string)=>o.trim()),correct:multiSelect?[...q.correct].sort((a,b)=>a-b):q.correct,explanation:q.explanation.trim()};
 });
 const timeLimitMinutes=input.timeLimitMinutes??input.time_limit_minutes??0;
 if(!Number.isInteger(timeLimitMinutes)||timeLimitMinutes<0||timeLimitMinutes>240)throw Error('Choose untimed or a whole-number time limit of 1–240 minutes.');
 return {title:input.title.trim(),subject:input.subject.trim(),description:input.description.trim(),questions,timeLimitMinutes};
}
export function answerOptions(answer: Answer): number[] {
 return Array.isArray(answer) ? answer : answer >= 0 ? [answer] : [];
}

export function validAnswer(answer: unknown, multiSelect: boolean, allowBlank = false): answer is Answer {
 const validIndex = (index: unknown) => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 4;
 if (allowBlank && answer === -1) return true;
 if (!multiSelect) return validIndex(answer);
 return Array.isArray(answer) && answer.length >= (allowBlank ? 0 : 1) &&
  answer.length <= 4 && answer.every(validIndex) && new Set(answer).size === answer.length;
}

export function toggleAnswer(answer: Answer, index: number): number[] {
 const options = answerOptions(answer);
 return options.includes(index) ? options.filter(option => option !== index) : [...options, index].sort((a,b) => a-b);
}

export function matchesAnswer(correct: Answer, selected: Answer): boolean {
 if (!Array.isArray(correct)) return selected === correct;
 return Array.isArray(selected) && selected.length === correct.length && correct.every(index => selected.includes(index));
}

export function publicQuestion(q: Question) {
 return {prompt:q.prompt,options:q.options,multiSelect:Array.isArray(q.correct),...(q.image?{image:q.image}:{}),...(q.diagram?{diagram:q.diagram}:{})};
}

export function grade(questions: Question[], answers: unknown, allowBlank = false) {
 if (!Array.isArray(answers) || answers.length !== questions.length ||
     !questions.every((q,i) => validAnswer(answers[i],Array.isArray(q.correct),allowBlank))) {
  throw Error('Answer every question before submitting.');
 }
 const feedback = questions.map((q,i) => ({...q,selected:answers[i] as Answer,isCorrect:matchesAnswer(q.correct,answers[i])}));
 return {score:feedback.filter(q=>q.isCorrect).length,total:questions.length,feedback};
}
