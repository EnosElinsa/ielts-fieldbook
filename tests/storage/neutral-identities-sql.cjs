const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const migrations = path.resolve(__dirname, '../../supabase/migrations');
const neutral = fs.readFileSync(path.join(migrations, '20261013160000_neutral_vocabulary_identities.sql'), 'utf8');
const account = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
const stamp = '2026-10-01T12:34:56Z';
const old = { id:'history', bookId:'guixue:10174', unitId:'21795', response:'guixue:10174 21795', score:7, occurredAt:stamp, sourceRecord:{ id:'21795', book_id:'10174', book_hierarchy_id:'21795',correct_rate:80 } };
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema public,auth to authenticated;
      create function public.keep_newer_row() returns trigger language plpgsql as $$ begin if new.updated_at<old.updated_at then return null; end if; return new; end $$;
      create table public.profiles(id uuid primary key references auth.users,settings jsonb,active_plan_id text,reviewed_at timestamptz,updated_at timestamptz default now());
      create table public.lexicon(user_id uuid,id text,payload jsonb,primary key(user_id,id));`);
    for (const table of ['sessions','assessments','errors','plans','stories','drafts','exam_attempts','intensive_sessions']) {
      await db.exec(`create table public.${table}(user_id uuid references auth.users,id text,payload jsonb,updated_at timestamptz default now(),primary key(user_id,id));
        alter table public.${table} enable row level security;
        create policy own on public.${table} for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
        grant select,insert,update,delete on public.${table} to authenticated;
        create trigger keep_newer before update on public.${table} for each row execute function public.keep_newer_row();`);
    }
    for (const file of ['20261010090000_unified_vocabulary.sql','20261010170000_vocabulary_sessions.sql','20261013120000_atomic_workspace_commits.sql']) {
      const target = file.includes('atomic') ? fs.readdirSync(migrations).find(name=>name.startsWith('20261013120000')) : file;
      await db.exec(fs.readFileSync(path.join(migrations,target),'utf8'));
    }
    await db.query('insert into auth.users values($1),($2)',[account,other]);
    if (process.env.IDENTITY_BACKUP_DIRECTORY) {
      const ts=require('typescript');
      const identityDirectory=path.resolve(__dirname,'../../src/domain/vocabulary');
      const mapping=JSON.parse(fs.readFileSync(path.join(identityDirectory,'identityMapping.json'),'utf8'));
      const source=fs.readFileSync(path.join(identityDirectory,'identities.ts'),'utf8').replace(/^import mapping from .*;$/m,`const mapping = ${JSON.stringify(mapping)};`);
      const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
      const {normalizeVocabularyIdentities,normalizeVocabularyRowId}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
      const tables=['profiles','plans','drafts','vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','wordbooks','wordbook_units','wordbook_memberships'];
      const originals=new Map();
      for(const table of tables) {
        const rows=JSON.parse(fs.readFileSync(path.join(process.env.IDENTITY_BACKUP_DIRECTORY,table+'.json'),'utf8'));
        originals.set(table,rows);
        for(const user of new Set(rows.map(row=>row.user_id || (table==='profiles'?row.id:null)).filter(Boolean))) await db.query('insert into auth.users values($1) on conflict do nothing',[user]);
        await db.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table},$1)`,[rows]);
      }
      const start=performance.now();
      await db.exec(neutral);
      console.log('Backup-volume migration first application milliseconds:',Math.round(performance.now()-start));
      const repeatStart=performance.now();
      await db.exec(neutral);
      console.log('Backup-volume migration second application milliseconds:',Math.round(performance.now()-repeatStart));
      for(const table of tables) {
        const started=performance.now();
        const count=(await db.query(`select count(*)::int n from public.${table}`)).rows[0].n;
        assert.equal(count,originals.get(table).length);
        const column=table==='profiles'?'settings':'payload';
        const mismatches=(await db.query(`select count(*)::int n from public.${table} where ${column} is distinct from neutral_vocabulary_json(${column})`)).rows[0].n;
        assert.equal(mismatches,0,`${table} must be a normalization fixed point`);
        const expected=originals.get(table).map(row=>{
          const next={...row,[column]:normalizeVocabularyIdentities(row[column])};
          if(['wordbooks','wordbook_units','wordbook_memberships','wordbook_enrollments','wordbook_progress'].includes(table)) {
            next.id=normalizeVocabularyRowId(row.id);
            next.payload={...next.payload,id:next.id};
          }
          return next;
        });
        const differences=(await db.query(`with expected as (select * from jsonb_populate_recordset(null::public.${table},$1)),
          original_hashes as (select sha256(convert_to(to_jsonb(t)::text,'UTF8')) hash from expected t),
          actual_hashes as (select sha256(convert_to(to_jsonb(t)::text,'UTF8')) hash from public.${table} t)
          select count(*)::int n from ((select hash from original_hashes except all select hash from actual_hashes)
            union all (select hash from actual_hashes except all select hash from original_hashes)) differences`,[expected])).rows[0].n;
        assert.equal(differences,0,`${table} full rows must match the client normalization and preserve all other fields`);
        console.log('Backup-volume verification',table,'rows',count,'milliseconds',Math.round(performance.now()-started));
      }
      return;
    }
    for (const user of [account,other]) await db.query('insert into vocabulary_evidence(user_id,id,payload,updated_at) values($1,$2,$3,$4)',[user,old.id,old,stamp]);
    await db.query('insert into wordbooks values($1,$2,$3)',['guixue:10174',{id:'guixue:10174',sourceBookId:'10174'},stamp]);
    await db.query('insert into wordbook_units values($1,$2,$3)',['guixue:10174:21795',{id:'guixue:10174:21795',bookId:'guixue:10174',sourceUnitId:'21795',parentId:'21794',kind:'group'},stamp]);
    await db.query('insert into wordbook_memberships values($1,$2,$3)',['guixue:10174:21795:81184',{id:'guixue:10174:21795:81184',bookId:'guixue:10174',unitId:'21795',entryId:'ve-80bbb46b',sourceWordId:'81184'},stamp]);
    await db.query('insert into wordbook_enrollments(user_id,id,payload,updated_at) values($1,$2,$3,$4)',[account,'import-enrollment:guixue:10174',{id:'import-enrollment:guixue:10174',bookId:'guixue:10174'},stamp]);
    await db.query('insert into wordbook_progress(user_id,id,payload,updated_at) values($1,$2,$3,$4)',[account,'guixue-progress:123:10174:21795',{...old,id:'guixue-progress:123:10174:21795'},stamp]);
    await db.exec(neutral);
    assert.equal((await db.query("select neutral_vocabulary_json('{\"id\":\"21953\",\"bookId\":\"guixue:10177\",\"kind\":\"group\"}') value")).rows[0].value.id,'ielts-listening-essentials-chapter-01-group-06');
    assert.equal((await db.query("select neutral_vocabulary_json('{\"id\":\"21953\",\"answers\":{\"21795\":\"guixue:10174\"}}') value")).rows[0].value.id,'21953');
    assert.equal((await db.query("select neutral_vocabulary_json('{\"books\":[{\"sourceBookId\":\"10174\",\"units\":[{\"id\":\"21795\"}]}]}') value")).rows[0].value.books[0].units[0].id,'ielts-vocabulary-chapter-01-group-01');
    assert.equal((await db.query("select neutral_vocabulary_json('{\"id\":\"21953\",\"type\":\"wordbook\"}') value")).rows[0].value.id,'ielts-listening-practice-21');
    assert.equal((await db.query("select neutral_vocabulary_route('/vocabulary/wordbooks/guixue%3A10174/groups/21795/learn?bookId=guixue%3A10174&unitId=21795') value")).rows[0].value,'/vocabulary/wordbooks/ielts-vocabulary/groups/ielts-vocabulary-chapter-01-group-01/learn?bookId=ielts-vocabulary&unitId=ielts-vocabulary-chapter-01-group-01');
    const first = (await db.query('select user_id,id,payload,updated_at from vocabulary_evidence order by user_id')).rows;
    assert.equal(first.length,2);
    assert.equal(first[0].payload.bookId,'ielts-vocabulary');
    assert.equal(first[0].payload.unitId,'ielts-vocabulary-chapter-01-group-01');
    assert.deepEqual(first[0].payload.sourceRecord,old.sourceRecord);
    assert.equal(first[0].payload.response,old.response);
    assert.equal(new Date(first[0].updated_at).toISOString(),new Date(stamp).toISOString());
    assert.equal((await db.query("select id from wordbook_progress")).rows[0].id,'imported-progress:123:ielts-vocabulary-chapter-01-group-01');
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='immutable_history' and tgenabled='O'")).rows[0].n,5);
    await db.exec(neutral);
    assert.deepEqual((await db.query('select user_id,id,payload,updated_at from vocabulary_evidence order by user_id')).rows,first);
    await db.exec(`set role authenticated; set request.jwt.claim.sub='${account}'`);
    await db.query('update vocabulary_evidence set payload=$1 where id=$2',[old,'history']);
    await assert.rejects(()=>db.query('update vocabulary_evidence set payload=$1 where id=$2',[{...old,response:'changed'},'history']),/immutable/);
    const session = {id:'session-old',status:'submitted',selection:{kind:'unit',bookId:old.bookId,unitId:old.unitId},summary:{total:1},results:[old]};
    const lists=Object.fromEntries(['vocabulary','vocabularyStates','vocabularyEvidence','vocabularyReviews','vocabularyActivities','wordbookProgress','wordbookEnrollments','vocabularySessions'].map(key=>[key,[]]));
    const batch={id:session.id,session,updatedAt:stamp,lists};
    assert.equal((await db.query('select commit_vocabulary_session($1) result',[batch])).rows[0].result.alreadyCommitted,false);
    assert.equal((await db.query('select commit_vocabulary_session($1) result',[batch])).rows[0].result.alreadyCommitted,true);
    const enrollment={id:'import-enrollment:guixue:10174',bookId:old.bookId};
    const workspace={id:'workspace-old',lists:{wordbookEnrollments:{upserts:[{id:enrollment.id,payload:enrollment}],deletes:[]}}};
    await db.query('select commit_workspace_changes($1)',[workspace]);
    assert.equal((await db.query('select commit_workspace_changes($1) result',[workspace])).rows[0].result.alreadyCommitted,true);
    const removal={id:'remove-old',lists:{wordbookEnrollments:{upserts:[],deletes:[enrollment.id]}}};
    await db.query('select commit_workspace_changes($1)',[removal]);
    assert.equal((await db.query('select count(*)::int n from wordbook_enrollments')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from vocabulary_evidence')).rows[0].n,1);
    const importLists=Object.fromEntries(['vocabulary','vocabularyStates','vocabularyEvidence','vocabularyReviews','vocabularyActivities','wordbookProgress','wordbookEnrollments','vocabularyImportBatches'].map(key=>[key,[]]));
    const importBatch={id:'old-import',bookId:old.bookId,unitId:old.unitId};
    const imported={id:importBatch.id,importBatch,updatedAt:stamp,lists:importLists};
    assert.equal((await db.query('select commit_vocabulary_import($1) result',[imported])).rows[0].result.alreadyCommitted,false);
    assert.equal((await db.query('select commit_vocabulary_import($1) result',[imported])).rows[0].result.alreadyCommitted,true);
    await db.exec('reset role');
    await db.query('insert into wordbooks values($1,$2,$3)',['guixue:10174',{id:'guixue:10174'},stamp]).catch(error=>assert.match(error.message,/duplicate/));
    await db.exec('alter table wordbooks disable trigger a_neutral_vocabulary_write');
    await db.query('insert into wordbooks values($1,$2,$3)',['guixue:10174',{id:'guixue:10174'},stamp]);
    await db.exec('alter table wordbooks enable trigger a_neutral_vocabulary_write');
    await assert.rejects(()=>db.exec(neutral),/collision/);
    await db.exec('rollback');
    assert.equal((await db.query("select count(*)::int n from pg_trigger where tgname='immutable_history' and tgenabled='O'")).rows[0].n,5);
    assert.deepEqual((await db.query('select user_id,id,payload,updated_at from vocabulary_evidence order by user_id')).rows,first);
    console.log('Neutral SQL: twice-run conversion, timestamps/content/provenance, five triggers, old immutable writes/RPC replay/deletion and RLS verified.');
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
