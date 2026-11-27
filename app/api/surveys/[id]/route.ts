import {creator,throttle} from '../../../../lib/accounts';
import {body,clientIp,response,sameOrigin} from '../../../../lib/server';
import {validateSurvey,validateSurveyResponse} from '../../../../lib/survey';
import {surveyStore} from '../../../../lib/survey-store';
type Context={params:Promise<{id:string}>};
export const dynamic='force-dynamic';

export async function GET(req:Request,{params}:Context){
 const {id}=await params;
 if(new URL(req.url).searchParams.has('owner')){
  const user=await creator(req.headers.get('cookie'));
  if(!user)return response({error:'Sign in required.'},401);
  const row=await (await surveyStore()).results(id,user.id);
  if(!row)return response({error:'Survey not found.'},404);
  return response({id,active:!!row.active,survey:JSON.parse(row.survey),count:row.count,responses:row.responses.map(r=>({...r,answers:JSON.parse(r.answers),seen:JSON.parse(r.seen)}))});
 }
 const row=await (await surveyStore()).get(id);
 if(!row)return response({error:'Survey not found.'},404);
 if(!row.active)return response({error:'This survey is closed.'},410);
 return response({survey:JSON.parse(row.survey)});
}

export async function POST(req:Request,{params}:Context){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 const {id}=await params;
 try{
  if(!await throttle('survey-submit:'+id+':'+clientIp(req),120))return response({error:'Too many submissions. Please try later.'},429);
  const store=await surveyStore(),row=await store.get(id);
  if(!row?.active)return response({error:'This survey is unavailable or closed.'},410);
  const x=await body(req,400000),survey=validateSurvey(JSON.parse(row.survey));
  const result=validateSurveyResponse(survey,x.identifier,x.answers);
  if(typeof x.responseId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x.responseId))throw Error('Invalid submission.');
  const saved=await store.submit({id:x.responseId,surveyId:id,expected:row.survey,identifier:result.identifier,answers:JSON.stringify(result.answers),seen:JSON.stringify(result.seen),created:Date.now()});
  if(!saved)return response({error:'Survey changed or closed. Reload and try again.'},409);
  return response({ok:true,closingMessage:survey.closingMessage});
 }catch(e){return response({error:e instanceof Error?e.message:'Unable to submit survey.'},400);}
}

export async function PATCH(req:Request,{params}:Context){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 const user=await creator(req.headers.get('cookie'));
 if(!user)return response({error:'Sign in required.'},401);
 const {id}=await params;
 try{
  const x=await body(req,500000),store=await surveyStore(),now=Date.now();
  if(typeof x.active==='boolean'){
   if(!await store.setActive(id,user.id,x.active,now))return response({error:'Survey not found.'},404);
   return response({ok:true});
  }
  const survey=validateSurvey(x.survey);
  const owned=await store.get(id,user.id);
  if(!owned)return response({error:'Survey not found.'},404);
  const old=validateSurvey(JSON.parse(owned.survey));
  const locked=JSON.stringify(old.questions)!==JSON.stringify(survey.questions)||old.identifierLabel!==survey.identifierLabel;
  const outcome=await store.update(id,user.id,owned.survey,JSON.stringify(survey),locked,now);
  if(outcome==='missing')return response({error:'Survey not found.'},404);
  if(outcome==='conflict')return response({error:locked?'Questions and identifier settings are locked after the first response. Duplicate the survey to change them.':'Survey changed. Reload and retry.'},409);
  return response({ok:true});
 }catch(e){return response({error:e instanceof Error?e.message:'Unable to update survey.'},400);}
}

export async function DELETE(req:Request,{params}:Context){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 const user=await creator(req.headers.get('cookie'));
 if(!user)return response({error:'Sign in required.'},401);
 const {id}=await params;
 if(!await (await surveyStore()).remove(id,user.id))return response({error:'Survey not found.'},404);
 return response({ok:true});
}
