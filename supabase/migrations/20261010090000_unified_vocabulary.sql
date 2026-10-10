-- Personal vocabulary stays separate from the shared, administrator-seeded catalogue.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'vocabulary', 'vocabulary_states', 'vocabulary_evidence', 'vocabulary_reviews',
    'vocabulary_activities', 'wordbook_progress', 'wordbook_enrollments', 'vocabulary_import_batches'
  ] loop
    execute format('create table public.%I (
      user_id uuid not null references auth.users(id) on delete cascade,
      id text not null check (length(id) > 0),
      payload jsonb not null check (jsonb_typeof(payload) = ''object''),
      updated_at timestamptz not null default now(),
      primary key (user_id, id)
    )', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid())', table_name || '_own', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create trigger keep_newer before update on public.%I
      for each row execute function public.keep_newer_row()', table_name);
  end loop;

  foreach table_name in array array[
    'word_entries', 'word_senses', 'word_relations', 'word_enrichments',
    'wordbooks', 'wordbook_units', 'wordbook_memberships'
  ] loop
    execute format('create table public.%I (
      id text primary key check (length(id) > 0),
      payload jsonb not null check (jsonb_typeof(payload) = ''object''),
      updated_at timestamptz not null default now()
    )', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_read', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

-- Old clients can hydrate their rows, but cannot create another legacy vocabulary store.
drop policy if exists lexicon_own on public.lexicon;
create policy lexicon_legacy_read on public.lexicon for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.lexicon from authenticated;

create or replace function public.keep_vocabulary_history()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.payload is distinct from old.payload then
    raise exception 'Vocabulary history is immutable';
  end if;
  return old;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['vocabulary_evidence', 'vocabulary_reviews', 'vocabulary_activities', 'vocabulary_import_batches'] loop
    execute format('create trigger immutable_history before update on public.%I
      for each row execute function public.keep_vocabulary_history()', table_name);
    execute format('revoke delete on public.%I from authenticated', table_name);
  end loop;
end;
$$;

create or replace function public.commit_vocabulary_import(batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  batch_id text := batch ->> 'id';
  list_key text;
  table_name text;
  row_data jsonb;
  row_payload jsonb;
  row_id text;
  existing_payload jsonb;
  batch_payload jsonb := batch -> 'importBatch';
  committed_at timestamptz;
  immutable boolean;
begin
  if uid is null then raise exception 'Sign in to import vocabulary'; end if;
  if jsonb_typeof(batch) is distinct from 'object' or coalesce(length(batch_id), 0) = 0 then
    raise exception 'An import batch id is required';
  end if;
  if jsonb_typeof(batch -> 'lists') is distinct from 'object'
    or jsonb_typeof(batch_payload) is distinct from 'object'
    or batch_payload ->> 'id' is distinct from batch_id then
    raise exception 'Invalid vocabulary import payload';
  end if;
  committed_at := (batch ->> 'updatedAt')::timestamptz;
  if committed_at is null then raise exception 'Import timestamp is required'; end if;
  -- Serialize retries of the same account/batch, including overlapping browser requests.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || batch_id, 0));
  if exists (select 1 from public.vocabulary_import_batches where user_id = uid and id = batch_id) then
    return jsonb_build_object('id', batch_id, 'alreadyCommitted', true);
  end if;
  for list_key in select jsonb_object_keys(batch -> 'lists') loop
    if not list_key = any(array['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews',
      'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularyImportBatches']) then
      raise exception 'Unknown vocabulary collection: %', list_key;
    end if;
  end loop;
  foreach list_key in array array['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews',
    'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularyImportBatches'] loop
    if jsonb_typeof(batch -> 'lists' -> list_key) is distinct from 'array' then
      raise exception 'Vocabulary collection must be an array: %', list_key;
    end if;
    table_name := case list_key
      when 'vocabularyStates' then 'vocabulary_states'
      when 'vocabularyEvidence' then 'vocabulary_evidence'
      when 'vocabularyReviews' then 'vocabulary_reviews'
      when 'vocabularyActivities' then 'vocabulary_activities'
      when 'wordbookProgress' then 'wordbook_progress'
      when 'wordbookEnrollments' then 'wordbook_enrollments'
      when 'vocabularyImportBatches' then 'vocabulary_import_batches'
      else 'vocabulary' end;
    immutable := list_key = any(array['vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'vocabularyImportBatches']);
    for row_data in select value from jsonb_array_elements(batch -> 'lists' -> list_key) loop
      row_id := row_data ->> 'id';
      row_payload := row_data -> 'payload';
      if jsonb_typeof(row_data) is distinct from 'object' or coalesce(length(row_id), 0) = 0
        or jsonb_typeof(row_payload) is distinct from 'object' or row_payload ->> 'id' is distinct from row_id then
        raise exception 'Invalid row in vocabulary collection: %', list_key;
      end if;
      if list_key = 'vocabularyImportBatches' and row_id = batch_id then
        if row_payload is distinct from batch_payload then raise exception 'Import batch does not match its row'; end if;
        continue;
      end if;
      if immutable then
        existing_payload := null;
        execute format('select payload from public.%I where user_id = $1 and id = $2', table_name)
          into existing_payload using uid, row_id;
        if existing_payload is not null and existing_payload is distinct from row_payload then
          raise exception 'Vocabulary history row already exists with different content: %', row_id;
        end if;
        execute format('insert into public.%I(user_id, id, payload, updated_at) values ($1, $2, $3, $4)
          on conflict (user_id, id) do nothing', table_name) using uid, row_id, row_payload, committed_at;
      else
        execute format('insert into public.%I(user_id, id, payload, updated_at) values ($1, $2, $3, $4)
          on conflict (user_id, id) do update set payload = excluded.payload, updated_at = excluded.updated_at
          where public.%I.updated_at <= excluded.updated_at', table_name, table_name)
          using uid, row_id, row_payload, committed_at;
      end if;
    end loop;
  end loop;
  insert into public.vocabulary_import_batches(user_id, id, payload, updated_at)
    values (uid, batch_id, batch_payload, committed_at);
  return jsonb_build_object('id', batch_id, 'alreadyCommitted', false);
end;
$$;

revoke all on function public.commit_vocabulary_import(jsonb) from public, anon;
grant execute on function public.commit_vocabulary_import(jsonb) to authenticated;

-- All personal rows reference auth.users with ON DELETE CASCADE, so the existing
-- delete_own_account RPC and payload-based account exports include these records.
