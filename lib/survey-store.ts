import {env} from 'cloudflare:workers';
import {db} from './server';

type SurveyRow = {survey:string;active:number};
type SurveyListRow = SurveyRow & {id:string;created:number;responses:number};
type ResponseRow = {identifier:string|null;answers:string;seen:string;created:number};
type Submission = ResponseRow & {id:string;surveyId:string;expected:string};

interface SurveyStore {
 list(owner:string):Promise<SurveyListRow[]>;
 get(id:string,owner?:string):Promise<SurveyRow|null>;
 results(id:string,owner:string):Promise<(SurveyRow & {count:number;responses:ResponseRow[]})|null>;
 create(id:string,owner:string,survey:string,now:number):Promise<void>;
 setActive(id:string,owner:string,active:boolean,now:number):Promise<boolean>;
 update(id:string,owner:string,expected:string,survey:string,lockedFields:boolean,now:number):Promise<'updated'|'missing'|'conflict'>;
 submit(input:Submission):Promise<boolean>;
 remove(id:string,owner:string):Promise<boolean>;
}

const workerStore:SurveyStore = {
 async list(owner){
  return (await db().prepare('SELECT s.id,s.survey,s.active,s.created,(SELECT COUNT(*) FROM survey_responses r WHERE r.survey_id=s.id) responses FROM surveys s WHERE owner_id=? ORDER BY created DESC,id DESC LIMIT 100').bind(owner).all<SurveyListRow>()).results;
 },
 get(id,owner){return owner===undefined?db().prepare('SELECT survey,active FROM surveys WHERE id=?').bind(id).first<SurveyRow>():db().prepare('SELECT survey,active FROM surveys WHERE id=? AND owner_id=?').bind(id,owner).first<SurveyRow>();},
 async results(id,owner){
  const row=await db().prepare('SELECT survey,active,(SELECT COUNT(*) FROM survey_responses WHERE survey_id=surveys.id) AS response_count FROM surveys WHERE id=? AND owner_id=?').bind(id,owner).first<SurveyRow & {response_count:number}>();
  if(!row)return null;
  const {results}=await db().prepare('SELECT identifier,answers,seen,created FROM survey_responses WHERE survey_id=? ORDER BY created DESC,id DESC LIMIT 1000').bind(id).all<ResponseRow>();
  return {survey:row.survey,active:row.active,count:row.response_count,responses:results};
 },
 async create(id,owner,survey,now){
  await db().prepare('INSERT INTO surveys(id,owner_id,survey,created,updated) VALUES(?,?,?,?,?)').bind(id,owner,survey,now,now).run();
 },
 async setActive(id,owner,active,now){
  const result=await db().prepare('UPDATE surveys SET active=?,updated=? WHERE id=? AND owner_id=?').bind(active?1:0,now,id,owner).run();
  return changed(result);
 },
 async update(id,owner,expected,survey,lockedFields,now){
  const row=await db().prepare('SELECT id FROM surveys WHERE id=? AND owner_id=?').bind(id,owner).first();
  if(!row)return 'missing';
  const filter=lockedFields?' AND NOT EXISTS(SELECT 1 FROM survey_responses WHERE survey_id=?)':'';
  const result=await db().prepare('UPDATE surveys SET survey=?,updated=? WHERE id=? AND owner_id=? AND survey=?'+filter)
   .bind(survey,now,id,owner,expected,...(lockedFields?[id]:[])).run();
  return changed(result)?'updated':'conflict';
 },
 async submit({id,surveyId,expected,identifier,answers,seen,created}){
  await db().prepare('INSERT OR IGNORE INTO survey_responses(id,survey_id,identifier,answers,seen,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM surveys WHERE id=? AND active=1 AND survey=?)')
   .bind(id,surveyId,identifier,answers,seen,created,surveyId,expected).run();
  return Boolean(await db().prepare('SELECT id FROM survey_responses WHERE id=? AND survey_id=?').bind(id,surveyId).first());
 },
 async remove(id,owner){
  const [,result]=await db().batch([
   db().prepare('DELETE FROM survey_responses WHERE survey_id IN (SELECT id FROM surveys WHERE id=? AND owner_id=?)').bind(id,owner),
   db().prepare('DELETE FROM surveys WHERE id=? AND owner_id=?').bind(id,owner),
  ]);
  return changed(result);
 },
};
function changed(result:{meta?:{changes?:number};changes?:number}) {
 return Boolean(result.meta?.changes||result.changes);
}

let mariaStore:Promise<SurveyStore>|undefined;
export function surveyStore():Promise<SurveyStore>{
 if((env as any).QUIZMINT_RUNTIME!=='namecheap')return Promise.resolve(workerStore);
 if(!mariaStore)mariaStore=Promise.all([import('../db/namecheap.mjs'),import('../db/namecheap-surveys.mjs')])
  .then(async ([database,surveys])=>surveys.surveyRepository(await database.namecheapDatabase()) as SurveyStore)
  .catch(error=>{mariaStore=undefined;throw error;});
 return mariaStore;
}
