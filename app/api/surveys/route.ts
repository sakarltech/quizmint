import {creator} from '../../../lib/accounts';
import {body,db,response,sameOrigin} from '../../../lib/server';
import {validateSurvey} from '../../../lib/survey';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Sign in required.'},401);
 const rows=await db().prepare('SELECT s.id,s.survey,s.active,s.created,(SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id=s.id) responses FROM surveys s WHERE owner_id=? ORDER BY created DESC,id DESC LIMIT 100').bind(user.id).all();
 return response({surveys:rows.results.map((row:any)=>({...row,survey:JSON.parse(row.survey)}))});
}
export async function POST(req:Request){
 if(!sameOrigin(req))return response({error:'Invalid origin.'},403);const user=await creator(req.headers.get('cookie'));if(!user)return response({error:'Sign in required.'},401);
 try{const survey=validateSurvey(await body(req,500000)),id=crypto.randomUUID().replaceAll('-',''),now=Date.now();await db().prepare('INSERT INTO surveys(id,owner_id,survey,created,updated) VALUES(?,?,?,?,?)').bind(id,user.id,JSON.stringify(survey),now,now).run();return response({id},201);}catch(e){return response({error:e instanceof Error?e.message:'Unable to save survey.'},400);}
}
