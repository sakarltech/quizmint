import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {namecheapDatabase,closeNamecheapDatabase} from '../db/namecheap.mjs';

const tables = {
  surveys: ['id','owner_id','survey','active','created','updated'],
  survey_responses: ['id','survey_id','identifier','answers','seen','created'],
};

try {
  const args = process.argv.slice(2);
  const expected = args.find(arg => arg.startsWith('--database='))?.slice('--database='.length);
  const apply = args.includes('--apply');
  if (!expected || new Set(args).size !== args.length || args.length !== (apply ? 2 : 1)) {
    throw Error('Usage: npm run db:migrate:surveys:namecheap -- --database=YOUR_DATABASE [--apply]');
  }
  const connection = await (await namecheapDatabase()).getConnection();
  const lock = 'quizmint-surveys:' + createHash('sha256').update(expected).digest('hex').slice(0,32);
  let acquired = false;
  try {
    const [[selected]] = await connection.execute('SELECT DATABASE() AS name');
    if(selected.name !== expected || process.env.DB_NAME !== expected)throw Error('The selected database does not match --database.');
    const [[lease]] = await connection.execute('SELECT GET_LOCK(?, 10) AS acquired',[lock]);
    acquired = Number(lease.acquired) === 1;
    if(!acquired)throw Error('Could not acquire the survey migration lock.');
    const [base] = await connection.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('creator_users','quizzes','attempts') AND ENGINE='InnoDB'");
    if (base.length !== 3) throw Error('The selected database is missing the existing QuizMint tables.');

    async function check(table,columns){
      const [found] = await connection.execute('SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION',[table]);
      if(!found.length)return false;
      if(found.map(row=>row.name).join(',')!==columns.join(','))throw Error('Unexpected schema for '+table+'. Inspect before migrating.');
      return true;
    }
    const present=[];
    for(const [table,columns] of Object.entries(tables))if(await check(table,columns))present.push(table);
    async function verifyForeignKey(table,column,parent,deleteRule){
      const [keys]=await connection.execute('SELECT k.REFERENCED_TABLE_NAME AS parent,k.REFERENCED_COLUMN_NAME AS parent_column,r.DELETE_RULE AS delete_rule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME=? AND k.COLUMN_NAME=?',[table,column]);
      if(!keys.some(key=>key.parent===parent&&key.parent_column==='id'&&(!deleteRule||key.delete_rule===deleteRule)))throw Error('Unexpected foreign key for '+table+'. Inspect before migrating.');
    }
    async function verifyConstraints(){
      if(await check('surveys',tables.surveys))await verifyForeignKey('surveys','owner_id','creator_users');
      if(await check('survey_responses',tables.survey_responses))await verifyForeignKey('survey_responses','survey_id','surveys','CASCADE');
    }
    await verifyConstraints();
    if(apply){
      const sql=await readFile(new URL('../migrations/mariadb/0002_surveys.sql',import.meta.url),'utf8');
      for(const statement of sql.split(';').map(part=>part.trim()).filter(Boolean))await connection.execute(statement);
      await verifyConstraints();
      console.log('Survey migration 0002 verified on '+expected+'.');
    }else{
      console.log('Survey migration preview for '+expected+'. Existing survey tables: '+(present.join(', ')||'none')+'. No schema changes applied.');
    }
  }finally{
    try{if(acquired)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}
  }
}catch(error){
  const code=error?.code;
  console.error('Survey migration failed. '+(typeof code==='string'?'Database error '+code+'.':error.message));
  process.exitCode=1;
}finally{
  await closeNamecheapDatabase();
}
