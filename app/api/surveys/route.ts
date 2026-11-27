import {creator} from '../../../lib/accounts';
import {body,response,sameOrigin} from '../../../lib/server';
import {validateSurvey} from '../../../lib/survey';
import {surveyStore} from '../../../lib/survey-store';
export const dynamic='force-dynamic';

export async function GET(req:Request){
 const user=await creator(req.headers.get('cookie'));
 if(!user)return response({error:'Sign in required.'},401);
 const rows=await (await surveyStore()).list(user.id);
 return response({surveys:rows.map(row=>({...row,survey:JSON.parse(row.survey)}))});
}

export async function POST(req:Request){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);
 const user=await creator(req.headers.get('cookie'));
 if(!user)return response({error:'Sign in required.'},401);
 try {
  const survey=validateSurvey(await body(req,500000));
  const id=crypto.randomUUID().replaceAll('-','');
  await (await surveyStore()).create(id,user.id,JSON.stringify(survey),Date.now());
  return response({id},201);
 } catch(e) {
  return response({error:e instanceof Error?e.message:'Unable to save survey.'},400);
 }
}
