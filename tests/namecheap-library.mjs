import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryRepository } from '../db/namecheap-library.mjs';
import { libraryTestTables } from '../db/namecheap-library-test-tables.mjs';

test('search normalizes case, supports short words, binds parameters and rejects operators', async () => {
  const store=libraryRepository({execute:async(sql,values)=>{
    assert.match(sql,/LOWER\(CONCAT_WS/);assert.deepEqual(values,['%math%','%ai%',0]);return [[]];
  }});
  await store.list(['MATH','AI'],0);
  await assert.rejects(store.list(['math*'],0),/Invalid/);
  await assert.rejects(store.list(Array(11).fill('word'),0),/Invalid/);
});

test('copy refuses a changed snapshot without inserting or incrementing', async () => {
  const lifecycle=[];
  const connection={execute:async sql=>{assert.match(sql,/SELECT quiz.*FOR UPDATE$/);return [[{quiz:'new snapshot'}]];},beginTransaction:async()=>lifecycle.push('begin'),commit:async()=>lifecycle.push('commit'),rollback:async()=>lifecycle.push('rollback'),release:()=>lifecycle.push('release')};
  const store=libraryRepository({getConnection:async()=>connection});
  assert.equal(await store.copy({sourceId:'source',sourceSnapshot:'old snapshot'}),false);
  assert.deepEqual(lifecycle,['begin','commit','release']);
});

test('temporary library schema preserves unique keys and excludes unsupported FULLTEXT', async()=>{
  const tables=await libraryTestTables('abcdef123456');
  assert.equal(tables.definitions.length,3);
  for(const definition of tables.definitions){assert.match(definition,/^CREATE TEMPORARY TABLE `qm_check_/);assert.match(definition,/PRIMARY KEY/);assert.ok(!definition.includes('FULLTEXT'));}
  assert.doesNotMatch(tables.sql('SELECT * FROM quizzes JOIN public_quizzes JOIN creator_profiles'),/\b(quizzes|public_quizzes|creator_profiles)\b/);
});
