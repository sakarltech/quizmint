import assert from 'node:assert/strict';
export async function exerciseImageReferences({ store, execute }) {
  const id = 'a'.repeat(32), other = 'b'.repeat(32), now = Date.now();
  assert.equal(await store.used(id, now), false);
  const questions = JSON.stringify([{ prompt: 'Image check', image: { id } }]);
  await execute('INSERT INTO quizzes(id,title,subject,description,questions,created,owner_id) VALUES(?,?,?,?,?,?,?)', ['image-quiz', 'Images', 'Test', 'Check', questions, 'now', 'owner']);
  assert.equal(await store.used(id, now), true);
  assert.equal(await store.used(other, now), false);
  await execute('UPDATE quizzes SET active=0 WHERE id=?', ['image-quiz']);
  assert.equal(await store.used(id, now), true, 'Closed quizzes still protect saved images');
  await execute('DELETE FROM quizzes WHERE id=?', ['image-quiz']);
  await execute("INSERT INTO arena_rooms(code,owner_id,title,quiz_id,questions,mode,seconds,status,question_index,deadline,remaining,version,created,expires) VALUES(?,?,?,?,?,?,?,'lobby',-1,0,0,0,?,?)", ['ABCDEF', 'owner', 'Images', 'deleted-quiz', questions, 'team', 30, now, now + 86400000]);
  assert.equal(await store.used(id, now), true, 'Lobby snapshots protect even future images');
  assert.equal(await store.used(other, now), false);
  await execute('UPDATE arena_rooms SET expires=? WHERE code=?', [now, 'ABCDEF']);
  assert.equal(await store.used(id, now), false, 'Expired rooms no longer pin images');
  // An equal id in another field is not an image reference.
  await execute('INSERT INTO quizzes(id,title,subject,description,questions,created,owner_id) VALUES(?,?,?,?,?,?,?)', ['unrelated', 'Images', 'Test', 'Check', JSON.stringify([{ prompt: id, diagram: { id }, image: { id: other } }]), 'now', 'owner']);
  assert.equal(await store.used(id, now), false);
  assert.equal(await store.used(other, now), true);
  await assert.rejects(store.used('%', now), /identifier/);
}
