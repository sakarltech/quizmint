import {creator,throttle} from '../../../../lib/accounts';
import {body,db,response,sameOrigin} from '../../../../lib/server';
import {validateSurvey,validateSurveyResponse} from '../../../../lib/survey';
type Context={params:Promise<{id:string}>};
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:Context){
 const {id}=await params,user=await creator(req.headers.get('cookie'));
 if(new URL(req.url).searchParams.has('owner')){
  if(!user)return response({error:'Sign in required.'},401);
  const row:any=await db().prepare('SELECT *, (SELECT COUNT(*) FROM survey_responses WHERE survey_id=surveys.id) count FROM surveys WHERE id=? AND owner_id=?').bind(id,user.id).first();if(!row)return response({error:'Survey not found.'},404);
  const rows=await db().prepare('SELECT identifier,answers,seen,created FROM survey_responses WHERE survey_id=? ORDER BY created DESC,id DESC LIMIT 1000').bind(id).all();return response({id,active:!!row.active,survey:JSON.parse(row.survey),count:row.count,responses:rows.results.map((r:any)=>({...r,answers:JSON.parse(r.answers),seen:JSON.parse(r.seen)}))});
 }
 const row:any=await db().prepare('SELECT survey,active FROM surveys WHERE id=?').bind(id).first();if(!row)return response({error:'Survey not found.'},404);if(!row.active)return response({error:'This survey is closed.'},410);return response({survey:JSON.parse(row.survey)});
}
export async function POST(req:Request,{params}:Context){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const {id}=await params;
 try{if(!await throttle('survey-submit:'+id+':'+(req.headers.get('cf-connecting-ip')||'unknown'),120))return response({error:'Too many submissions. Please try later.'},429);const row:any=await db().prepare('SELECT survey FROM surveys WHERE id=? AND active=1').bind(id).first();if(!row)return response({error:'This survey is unavailable or closed.'},410);const x=await body(req,400000),survey=validateSurvey(JSON.parse(row.survey)),result=validateSurveyResponse(survey,x.identifier,x.answers);const idempotency=x.responseId;if(typeof idempotency!=='string'||!/^[a-f0-9-]{36}$/.test(idempotency))throw Error('Invalid submission.');
 await db().prepare('INSERT OR IGNORE INTO survey_responses(id,survey_id,identifier,answers,seen,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM surveys WHERE id=? AND active=1 AND survey=?)').bind(idempotency,id,result.identifier,JSON.stringify(result.answers),JSON.stringify(result.seen),Date.now(),id,row.survey).run();const saved=await db().prepare('SELECT id FROM survey_responses WHERE id=? AND survey_id=?').bind(idempotency,id).first();if(!saved)return response({error:'Survey changed or closed. Reload and try again.'},409);return response({ok:true,closingMessage:survey.closingMessage});
 }catch(e){return response({error:e instanceof Error?e.message:'Unable to submit survey.'},400);}
}
export async function PATCH(req:Request,{params}:Context){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Sign in required.'},401);const {id}=await params;
 try{const x=await body(req,500000);if(typeof x.active==='boolean'){const changed:any=await db().prepare('UPDATE surveys SET active=?,updated=? WHERE id=? AND owner_id=?').bind(x.active?1:0,Date.now(),id,user.id).run();if(!(changed.meta?.changes||changed.changes))return response({error:'Survey not found.'},404);return response({ok:true});}
 const survey=validateSurvey(x.survey),row:any=await db().prepare('SELECT survey FROM surveys WHERE id=? AND owner_id=?').bind(id,user.id).first();if(!row)return response({error:'Survey not found.'},404);const old=validateSurvey(JSON.parse(row.survey));
 if(JSON.stringify(old.questions)!==JSON.stringify(survey.questions)||old.identifierLabel!==survey.identifierLabel){const changed:any=await db().prepare('UPDATE surveys SET survey=?,updated=? WHERE id=? AND owner_id=? AND survey=? AND NOT EXISTS(SELECT 1 FROM survey_responses WHERE survey_id=?)').bind(JSON.stringify(survey),Date.now(),id,user.id,row.survey,id).run();if(!(changed.meta?.changes||changed.changes))return response({error:'Questions and identifier settings are locked after the first response. Duplicate the survey to change them.'},409);}
 else {const changed:any=await db().prepare('UPDATE surveys SET survey=?,updated=? WHERE id=? AND owner_id=? AND survey=?').bind(JSON.stringify(survey),Date.now(),id,user.id,row.survey).run();if(!(changed.meta?.changes||changed.changes))return response({error:'Survey changed. Reload and retry.'},409);}
 return response({ok:true});}catch(e){return response({error:e instanceof Error?e.message:'Unable to update survey.'},400);}
}
export async function DELETE(req:Request,{params}:Context){if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Sign in required.'},401);const {id}=await params;const exists=await db().prepare('SELECT id FROM surveys WHERE id=? AND owner_id=?').bind(id,user.id).first();if(!exists)return response({error:'Survey not found.'},404);await db().batch([db().prepare('DELETE FROM survey_responses WHERE survey_id=?').bind(id),db().prepare('DELETE FROM surveys WHERE id=? AND owner_id=?').bind(id,user.id)]);return response({ok:true});}
