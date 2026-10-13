import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] || 'local/qa/identity-rehearsal.sql');
const migration = (await readFile('supabase/migrations/20261013160000_neutral_vocabulary_identities.sql', 'utf8'))
  .replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
const repeat = (await readFile('supabase/neutral-vocabulary-template.sql','utf8')).replace('__IDENTITY_VALUES__','').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const tables = ['profiles','sessions','assessments','errors','plans','stories','vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','exam_attempts','intensive_sessions','drafts','lexicon','workspace_commit_receipts','word_entries','word_senses','word_relations','word_enrichments','wordbooks','wordbook_units','wordbook_memberships','writing_questions','speaking_topics','speaking_samples','exam_papers','exam_sections','exam_passages','exam_questions','exam_assets'];
const changed = ['plans','vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','drafts','wordbooks','wordbook_units','wordbook_memberships'];
const ids = ['wordbook_progress','wordbook_enrollments','wordbooks','wordbook_units','wordbook_memberships'];
const quoted = values => values.map(value => `'${value}'`).join(',');
const boundary = migration.indexOf('do $$\ndeclare table_name text;');
if (boundary < 0) throw new Error('Migration conversion boundary missing.');
const setup = migration.slice(0,boundary);
const conversion = migration.slice(boundary);
const capture = tables.map(table => {
  let expression='to_jsonb(t)';
  if(table==='profiles')expression="jsonb_set(to_jsonb(t),'{settings}',public.neutral_vocabulary_json(t.settings))";
  else if(changed.includes(table)){
    let payload='public.neutral_vocabulary_json(t.payload)';
    if(ids.includes(table)){
      const kind={wordbooks:'book',wordbook_units:'unit',wordbook_memberships:'membership'}[table];
      const id=`to_jsonb(public.neutral_vocabulary_id(t.id,${kind?`'${kind}'`:'null'}))`;
      payload=`jsonb_set(${payload},'{id}',${id})`;
      expression=`jsonb_set(jsonb_set(to_jsonb(t),'{id}',${id}),'{payload}',${payload})`;
    }else expression=`jsonb_set(to_jsonb(t),'{payload}',${payload})`;
  }
  return `insert into rehearsal_expected select '${table}',sha256(convert_to((${expression})::text,'UTF8')) from public.${table} t;`;
}).join('\n');
const check = `do $check$
declare table_name text; difference bigint;
begin
  foreach table_name in array array[${quoted(tables)}] loop
    execute format('select count(*) from ((select digest from rehearsal_expected where table_name=$1 except all select sha256(convert_to(to_jsonb(t)::text,''UTF8'')) from public.%I t) union all (select sha256(convert_to(to_jsonb(t)::text,''UTF8'')) from public.%I t except all select digest from rehearsal_expected where table_name=$1)) differences',table_name,table_name) into difference using table_name;
    if difference<>0 then raise exception 'Preservation check failed for %: % rows',table_name,difference; end if;
  end loop;
  if exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='immutable_history' and t.tgenabled<>'O') then raise exception 'History constraint left disabled'; end if;
end $check$;`;
const locks=tables.map(table=>`lock table public.${table} in share row exclusive mode;`).join('\n');
const sql = `begin;\nset local statement_timeout='180s';\nset local work_mem='32MB';\ncreate temporary table rehearsal_expected(table_name text,digest bytea) on commit drop;\n${setup}\n${locks}\n${capture}\n${conversion}\n${check}\n${repeat}\n${check}\nselect jsonb_build_object('passed',true,'tables',${tables.length},'applications',2,'rows',(select count(*) from rehearsal_expected),'rolledBack',true) as rehearsal;\nrollback;\n`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, sql);
console.log(`Built rollback rehearsal for ${tables.length} tables: ${output}`);
