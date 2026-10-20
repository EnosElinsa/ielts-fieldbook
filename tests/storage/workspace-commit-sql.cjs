// Isolated PostgreSQL verification; no Supabase connection or credentials are used.
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
      create table public.profiles(id uuid primary key references auth.users(id), settings jsonb, active_plan_id text, reviewed_at timestamptz, updated_at timestamptz default now());
      alter table public.profiles enable row level security;
      create policy own on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
      grant select,insert,update on public.profiles to authenticated;
      create function public.keep_newer_row() returns trigger language plpgsql as $$ begin
        if tg_op='UPDATE' and new.updated_at<old.updated_at then return null; end if; return new; end; $$;`);
    for (const table of ['sessions', 'assessments', 'errors', 'plans', 'stories', 'drafts', 'lexicon', 'exam_attempts', 'intensive_sessions']) {
      await db.exec(`create table public.${table}(user_id uuid references auth.users(id), id text, payload jsonb, updated_at timestamptz default now(), primary key(user_id,id));
        alter table public.${table} enable row level security;
        create policy own on public.${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
        grant select,insert,update,delete on public.${table} to authenticated;`);
    }
    const migrationDir = path.resolve(__dirname, '../../supabase/migrations');
    for (const migration of ['20261010090000_unified_vocabulary.sql', '20261010170000_vocabulary_sessions.sql', '20261013120000_workspace_commits.sql', '20261013160000_neutral_vocabulary_identities.sql', '20261014120000_exam_annotations.sql', '20261020120000_planning_conflict_guards.sql', '20261020140000_planning_schedule_baseline.sql']) {
      await db.exec(fs.readFileSync(path.join(migrationDir, migration), 'utf8'));
    }
    const indexNames = (await db.query("select indexname from pg_indexes where schemaname='public' and indexname in ('wordbook_memberships_book_unit_id','wordbook_units_book_id','word_entries_term_id') order by indexname")).rows.map(row => row.indexname);
    assert.deepEqual(indexNames, ['word_entries_term_id','wordbook_memberships_book_unit_id','wordbook_units_book_id']);
    const account = '00000000-0000-0000-0000-000000000001';
    const other = '00000000-0000-0000-0000-000000000002';
    await db.exec(`insert into auth.users values('${account}'),('${other}'); set role authenticated; set request.jwt.claim.sub='${account}';`);
    const diff = (id, payload = { id }) => ({ upserts: [{ id, payload }], deletes: [] });
    const commit = batch => db.query('select public.commit_workspace_changes($1::jsonb) as result', [JSON.stringify(batch)]);
    const count = async (table, id) => (await db.query(`select count(*)::int as n from public.${table} where id=$1`, [id])).rows[0].n;

    const batch = { id: 'save-1', lists: { sessions: diff('session'), plans: diff('plan'), examAttempts: diff('exam') }, drafts: diff('question', { text: 'Response' }), profile: { settings: { activeSkill: 'reading' }, activePlanId: 'plan', reviewedAt: null } };
    assert.deepEqual((await commit(batch)).rows[0].result, { id: 'save-1', alreadyCommitted: false });
    assert.equal(await count('sessions', 'session'), 1);
    const profileBefore=(await db.query("select jsonb_build_object('settings',settings,'activePlanId',active_plan_id,'reviewedAt',reviewed_at) as value from profiles where id=$1",[account])).rows[0].value;
    const guarded={id:'guarded-task',lists:{plans:diff('guarded',{id:'guarded',status:'pending'})},baseline:{plans:{guarded:null},profile:profileBefore},profile:{settings:{activeSkill:'writing'},activePlanId:null,reviewedAt:null}};
    await commit(guarded);
    assert.equal((await commit(guarded)).rows[0].result.alreadyCommitted,true);
    await assert.rejects(()=>commit({...guarded,id:'stale-task',profile:undefined}),/Planning baseline conflict/);
    await assert.rejects(()=>commit({id:'stale-profile',lists:{sessions:diff('must-rollback')},profile:guarded.profile,baseline:{profile:profileBefore}}),/Planning baseline conflict/);
    assert.equal(await count('sessions','must-rollback'),0);
    assert.equal(await count('workspace_commit_receipts','stale-profile'),0);
    await commit({id:'restore-profile-after-guards',lists:{},profile:profileBefore});
    await commit({id:'timestamp-profile',lists:{},profile:{...profileBefore,reviewedAt:'2026-10-20T12:00:00Z'}});
    await commit({id:'same-timestamp-profile',lists:{},profile:profileBefore,baseline:{profile:{...profileBefore,reviewedAt:'2026-10-20T12:00:00.000Z'}}});
    const planSet=(await db.query("select coalesce(jsonb_object_agg(id,payload),'{}'::jsonb) as value from plans")).rows[0].value;
    const firstDevice={id:'device-one',lists:{plans:diff('device-one-task')},baseline:{planSet,plans:{'device-one-task':null}}};
    await commit(firstDevice);
    assert.equal((await commit(firstDevice)).rows[0].result.alreadyCommitted,true);
    await assert.rejects(()=>commit({id:'device-two',lists:{plans:diff('device-two-task')},baseline:{planSet,plans:{'device-two-task':null}}}),/schedule changed on another device/);
    assert.equal(await count('plans','device-two-task'),0);
    assert.equal(await count('workspace_commit_receipts','device-two'),0);
    const annotation = { id: 'source-note', sourceId: 'section', skill: 'reading', quote: 'garden', note: 'initial' };
    const annotationBatch = { id: 'annotation-save', lists: { examAnnotations: diff(annotation.id, annotation) } };
    assert.deepEqual((await commit(annotationBatch)).rows[0].result, { id: 'annotation-save', alreadyCommitted: false });
    assert.deepEqual((await commit(annotationBatch)).rows[0].result, { id: 'annotation-save', alreadyCommitted: true });
    await db.exec(`set request.jwt.claim.sub='${other}';`);
    assert.equal(await count('exam_annotations', annotation.id), 0);
    await assert.rejects(() => db.query('insert into exam_annotations(user_id,id,payload) values($1,$2,$3)', [account, 'foreign', { id: 'foreign' }]), /row-level security/);
    await db.exec(`set request.jwt.claim.sub='${account}';`);
    await commit({ id: 'annotation-edit', lists: { examAnnotations: diff(annotation.id, { ...annotation, note: 'edited' }) } });
    assert.equal((await db.query('select payload from exam_annotations where id=$1', [annotation.id])).rows[0].payload.note, 'edited');
    await commit({ id: 'annotation-delete', lists: { examAnnotations: { upserts: [], deletes: [annotation.id] } } });
    assert.equal(await count('exam_annotations', annotation.id), 0);
    await commit({ id: 'annotation-cascade', lists: { examAnnotations: diff('cascade-note') } });
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(migrationDir, '20261014120000_exam_annotations.sql'), 'utf8'));
    const deletedAccount = '00000000-0000-0000-0000-000000000003';
    await db.query('insert into auth.users values($1)', [deletedAccount]);
    await db.query('insert into exam_annotations(user_id,id,payload) values($1,$2,$3)', [deletedAccount, 'removed-with-account', { id: 'removed-with-account' }]);
    await db.query('delete from auth.users where id=$1', [deletedAccount]);
    assert.equal(await count('exam_annotations', 'removed-with-account'), 0);
    await db.exec('set role authenticated');
    assert.equal(await count('drafts', 'question'), 1);
    assert.equal((await db.query("select updated_at > clock_timestamp()-interval '1 minute' as recent from sessions where id='session'")).rows[0].recent, true);
    assert.equal((await db.query('select settings from profiles')).rows[0].settings.activeSkill, 'reading');
    assert.deepEqual((await commit(batch)).rows[0].result, { id: 'save-1', alreadyCommitted: true });
    await assert.rejects(() => commit({ ...batch, lists: { sessions: diff('changed') } }), /different content/);
    assert.equal(await count('sessions', 'changed'), 0);

    const invalid = { id: 'rollback', lists: { sessions: diff('rollback-session'), vocabulary: diff('bad-word', { id: 'mismatch' }) } };
    await assert.rejects(() => commit(invalid), /Invalid workspace row/);
    assert.equal(await count('sessions', 'rollback-session'), 0);
    assert.equal(await count('workspace_commit_receipts', 'rollback'), 0);
    const profileError = { id: 'profile-rollback', lists: { sessions: diff('profile-rollback-session') }, profile: { settings: {}, reviewedAt: 'invalid' } };
    await assert.rejects(() => commit(profileError), /invalid input syntax/);
    assert.equal(await count('sessions', 'profile-rollback-session'), 0);

    for (const key of ['word_entries', 'writing_questions', 'speaking_samples', 'lexicon', 'profiles', 'drafts']) {
      await assert.rejects(() => commit({ id: `unknown-${key}`, lists: { [key]: diff('unwanted') } }), /Unknown workspace collection/);
    }
    await assert.rejects(() => commit({ id: 'bad-user', user_id: other, lists: {} }), /Unknown workspace batch field/);
    await assert.rejects(() => commit({ id: 'bad-deletion', lists: { plans: { upserts: [], deletes: [{}] } } }), /Invalid workspace deletion/);

    await db.exec("insert into vocabulary(user_id,id,payload,updated_at) values(auth.uid(),'future-word','{\"id\":\"future-word\",\"term\":\"before\"}','2099-01-01');");
    await commit({ id: 'future-clock', lists: { vocabulary: diff('future-word', { id: 'future-word', term: 'after' }) } });
    assert.equal((await db.query("select payload->>'term' as term from vocabulary where id='future-word'")).rows[0].term, 'after');

    await commit({ id: 'server-clock', lists: { vocabularyStates: diff('learning', { id: 'learning', recognition: 1 }) } });
    const sessionLists = Object.fromEntries(['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularySessions'].map(key => [key, []]));
    sessionLists.vocabularyStates = diff('learning', { id: 'learning', recognition: 2 }).upserts;
    const session = { id: 'slow-client-session', status: 'submitted', summary: { completed: 1 } };
    const sessionBatch = { id: session.id, session, lists: sessionLists, updatedAt: '2000-01-01T00:00:00Z' };
    const sessionCommit = value => db.query('select public.commit_vocabulary_session($1::jsonb) as result', [JSON.stringify(value)]);
    assert.deepEqual((await sessionCommit(sessionBatch)).rows[0].result, { id: session.id, alreadyCommitted: false });
    assert.equal((await db.query("select payload->>'recognition' as recognition from vocabulary_states where id='learning'")).rows[0].recognition, '2');
    const replaySession = structuredClone(sessionBatch);
    replaySession.lists.vocabularyStates = diff('learning', { id: 'learning', recognition: 99 }).upserts;
    assert.deepEqual((await sessionCommit(replaySession)).rows[0].result, { id: session.id, alreadyCommitted: true });
    assert.equal((await db.query("select payload->>'recognition' as recognition from vocabulary_states where id='learning'")).rows[0].recognition, '2');
    const importLists = Object.fromEntries(['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularyImportBatches'].map(key => [key, []]));
    importLists.vocabulary = diff('future-word', { id: 'future-word', term: 'imported' }).upserts;
    importLists.vocabularyStates = diff('learning', { id: 'learning', recognition: 3 }).upserts;
    const importBatch = { id: 'slow-client-import', lists: importLists, importBatch: { id: 'slow-client-import' }, updatedAt: '2000-01-01T00:00:00Z' };
    const importCommit = value => db.query('select public.commit_vocabulary_import($1::jsonb) as result', [JSON.stringify(value)]);
    assert.deepEqual((await importCommit(importBatch)).rows[0].result, { id: importBatch.id, alreadyCommitted: false });
    assert.equal((await db.query("select payload->>'term' as term from vocabulary where id='future-word'")).rows[0].term, 'imported');
    assert.equal((await db.query("select payload->>'recognition' as recognition from vocabulary_states where id='learning'")).rows[0].recognition, '3');
    assert.deepEqual((await importCommit(importBatch)).rows[0].result, { id: importBatch.id, alreadyCommitted: true });
    await assert.rejects(() => sessionCommit({ ...sessionBatch, id: 'bad-specialized', session: { ...session, id: 'bad-specialized' }, lists: { ...sessionLists, word_entries: [] } }), /Unknown vocabulary session collection/);

    await commit({ id: 'history', lists: { vocabularyReviews: diff('review', { id: 'review', rating: 'good' }) } });
    await assert.rejects(() => commit({ id: 'rewrite-history', lists: { vocabularyReviews: diff('review', { id: 'review', rating: 'again' }) } }), /immutable/);
    await assert.rejects(() => commit({ id: 'delete-history', lists: { vocabularyReviews: { upserts: [], deletes: ['review'] } } }), /immutable/);
    assert.equal(await count('workspace_commit_receipts', 'rewrite-history'), 0);
    await commit({ id: 'delete-plan', lists: { plans: { upserts: [], deletes: ['plan'] } } });
    assert.equal(await count('plans', 'plan'), 0);
    await assert.rejects(() => db.exec("update workspace_commit_receipts set payload_hash='changed'"), /permission denied/);

    await db.exec(`set request.jwt.claim.sub='${other}';`);
    assert.equal(await count('sessions', 'session'), 0);
    assert.equal(await count('workspace_commit_receipts', 'save-1'), 0);
    assert.deepEqual((await commit(batch)).rows[0].result, { id: 'save-1', alreadyCommitted: false });
    assert.equal(await count('sessions', 'session'), 1);
    await db.exec("set request.jwt.claim.sub='';");
    await assert.rejects(() => commit({ id: 'anonymous', lists: {} }), /Sign in/);
    console.log('Workspace commit SQL checks passed: atomic rollback, replay conflicts, RLS isolation, immutable history, server timestamps, whitelist, catalog indexes.');
  } finally {
    await db.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
