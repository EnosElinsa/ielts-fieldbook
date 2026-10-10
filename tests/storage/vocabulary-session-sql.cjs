// Standalone PostgreSQL validation. Set PGLITE_MODULE to a temporary PGlite
// installation when the package is not installed in this project.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated;
      create table public.lexicon(user_id uuid, id text, payload jsonb, primary key(user_id,id));
      alter table public.lexicon enable row level security;
      create policy lexicon_own on public.lexicon for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
      grant select,insert,update,delete on public.lexicon to authenticated;
      create function public.keep_newer_row() returns trigger language plpgsql as $$ begin
        if tg_op='UPDATE' and new.updated_at<old.updated_at then return null; end if; return new; end; $$;`);
    const migrations = path.resolve(__dirname, '../../supabase/migrations');
    await db.exec(fs.readFileSync(path.join(migrations, '20261010090000_unified_vocabulary.sql'), 'utf8'));
    if (!process.env.SKIP_SESSION_MIGRATION) {
      await db.exec(fs.readFileSync(path.join(migrations, '20261010170000_vocabulary_sessions.sql'), 'utf8'));
    }
    const account = '00000000-0000-0000-0000-000000000001';
    const other = '00000000-0000-0000-0000-000000000002';
    await db.exec(`insert into auth.users values('${account}'),('${other}'); set role authenticated; set request.jwt.claim.sub='${account}';`);
    const keys = ['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularySessions'];
    const batch = id => ({
      id, updatedAt: '2026-10-10T01:00:00Z',
      session: { id, mode: 'learn', status: 'submitted', summary: { total: 1, correct: 1, incorrect: 0, pending: 0 }, results: [{ cardId: 'word-1', entryId: 'word-1', term: 'mitigate', response: 'reduce harm', result: 'correct' }], reviewIds: [`${id}:review-1`] },
      lists: Object.fromEntries(keys.map(key => [key, []])),
    });
    const commit = value => db.query('select public.commit_vocabulary_session($1::jsonb) as result', [JSON.stringify(value)]);
    const count = async (table, id) => (await db.query(`select count(*)::int as n from public.${table} where id=$1`, [id])).rows[0].n;

    const valid = batch('practice-1');
    valid.lists.vocabulary.push({ id: 'word-1', payload: { id: 'word-1', term: 'mitigate' } });
    valid.lists.vocabularyStates.push({ id: 'word-1', payload: { id: 'word-1', recognition: 1 } });
    valid.lists.vocabularyEvidence.push({ id: 'practice-1:evidence-1', payload: { id: 'practice-1:evidence-1', sessionId: 'practice-1', response: 'reduce harm' } });
    valid.lists.vocabularyReviews.push({ id: 'practice-1:review-1', payload: { id: 'practice-1:review-1', sessionId: 'practice-1', rating: 'good' } });
    valid.lists.vocabularySessions.push({ id: valid.id, payload: valid.session });
    assert.deepEqual((await commit(valid)).rows[0].result, { id: 'practice-1', alreadyCommitted: false });
    assert.equal(await count('vocabulary_sessions', 'practice-1'), 1);
    assert.equal(await count('vocabulary_reviews', 'practice-1:review-1'), 1);
    assert.equal(await count('vocabulary_import_batches', 'practice-1'), 0);
    const replay = structuredClone(valid);
    replay.lists.vocabulary.push({ id: 'replay-only-word', payload: { id: 'replay-only-word' } });
    assert.deepEqual((await commit(replay)).rows[0].result, { id: 'practice-1', alreadyCommitted: true });
    assert.equal(await count('vocabulary', 'replay-only-word'), 0);

    const malformed = batch('bad-row');
    malformed.lists.vocabulary.push({ id: 'rollback-word', payload: { id: 'rollback-word' } });
    malformed.lists.vocabularyStates.push({ id: 'broken', payload: { id: 'mismatch' } });
    await assert.rejects(() => commit(malformed), /Invalid row/);
    assert.equal(await count('vocabulary', 'rollback-word'), 0);
    assert.equal(await count('vocabulary_sessions', 'bad-row'), 0);

    const foreignSession = batch('wrong-session');
    foreignSession.lists.vocabularyReviews.push({ id: 'foreign-review', payload: { id: 'foreign-review', sessionId: 'practice-1' } });
    await assert.rejects(() => commit(foreignSession), /different session/);
    assert.equal(await count('vocabulary_reviews', 'foreign-review'), 0);
    const extraMarker = batch('wrong-marker');
    extraMarker.lists.vocabularySessions.push({ id: 'other-marker', payload: { ...extraMarker.session, id: 'other-marker' } });
    await assert.rejects(() => commit(extraMarker), /does not match/);
    const arbitrary = batch('arbitrary-table');
    arbitrary.lists.word_entries = [{ id: 'catalog-write', payload: { id: 'catalog-write' } }];
    await assert.rejects(() => commit(arbitrary), /Unknown vocabulary session collection/);
    const imported = batch('fake-import');
    imported.lists.vocabularyImportBatches = [];
    await assert.rejects(() => commit(imported), /Unknown vocabulary session collection/);
    const unfinished = batch('unfinished'); unfinished.session.status = 'active';
    await assert.rejects(() => commit(unfinished), /Invalid completed/);
    const missingSummary = batch('missing-summary'); delete missingSummary.session.summary;
    await assert.rejects(() => commit(missingSummary), /Invalid completed/);
    await assert.rejects(() => db.query('insert into vocabulary_sessions(user_id,id,payload) values($1,$2,$3::jsonb)', [account, 'missing-direct', JSON.stringify({ id: 'missing-direct', status: 'submitted' })]), /check constraint/);

    const changed = structuredClone(valid); changed.session.summary.correct = 0;
    await assert.rejects(() => commit(changed), /already exists with different content/);
    await db.exec("update vocabulary_sessions set payload=payload where id='practice-1'");
    await assert.rejects(() => db.exec("update vocabulary_sessions set payload=jsonb_set(payload,'{summary,correct}','0') where id='practice-1'"), /immutable/);
    await assert.rejects(() => db.exec("delete from vocabulary_sessions where id='practice-1'"), /permission denied/);
    const conflictingHistory = batch('conflict');
    conflictingHistory.lists.vocabulary.push({ id: 'conflict-rollback', payload: { id: 'conflict-rollback' } });
    conflictingHistory.lists.vocabularyEvidence.push({ id: 'practice-1:evidence-1', payload: { id: 'practice-1:evidence-1', response: 'different' } });
    await assert.rejects(() => commit(conflictingHistory), /immutable/);
    assert.equal(await count('vocabulary', 'conflict-rollback'), 0);
    assert.equal(await count('vocabulary_sessions', 'conflict'), 0);

    const older = batch('older'); older.updatedAt = '2026-10-09T01:00:00Z';
    older.lists.vocabularyStates.push({ id: 'word-1', payload: { id: 'word-1', recognition: 0 } });
    await commit(older);
    assert.equal((await db.query("select payload from vocabulary_states where id='word-1'")).rows[0].payload.recognition, 1);
    await assert.rejects(() => db.query('insert into vocabulary_sessions(user_id,id,payload) values($1,$2,$3::jsonb)', [other, 'foreign', JSON.stringify({ ...valid.session, id: 'foreign' })]), /row-level security/);
    await db.exec(`set request.jwt.claim.sub='${other}'`);
    assert.equal(await count('vocabulary_sessions', 'practice-1'), 0);
    assert.equal((await commit(valid)).rows[0].result.alreadyCommitted, false);
    await db.exec("set request.jwt.claim.sub=''");
    await assert.rejects(() => commit(batch('signed-out')), /Sign in/);
    await db.exec('reset role; set role anon');
    await assert.rejects(() => commit(batch('anonymous')), /permission denied/);
    await db.exec('reset role');
    await db.exec(`delete from auth.users where id='${account}'`);
    assert.equal((await db.query('select count(*)::int as n from vocabulary_sessions where user_id=$1', [account])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int as n from vocabulary_sessions where user_id=$1', [other])).rows[0].n, 1);
    console.log('Vocabulary session PostgreSQL checks passed: atomic rollback, idempotent replay, immutable history, exact session linkage, table allowlist, newer rows, account isolation, sign-in, and cascade.');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
