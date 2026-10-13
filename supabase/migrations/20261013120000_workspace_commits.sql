-- Every workspace save and its user-scoped replay receipt commit together.
create table public.workspace_commit_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) > 0),
  payload_hash text not null,
  committed_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.workspace_commit_receipts enable row level security;
create policy workspace_receipts_read on public.workspace_commit_receipts for select to authenticated
  using (user_id = (select auth.uid()));
create policy workspace_receipts_insert on public.workspace_commit_receipts for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.workspace_commit_receipts from anon, authenticated;
grant select, insert on public.workspace_commit_receipts to authenticated;
grant all on public.workspace_commit_receipts to service_role;

create or replace function public.commit_workspace_changes(batch jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  operation_id text := batch ->> 'id';
  operation_hash text;
  prior_hash text;
  committed_at timestamptz;
  list_key text;
  table_name text;
  changes jsonb;
  row_data jsonb;
  row_id text;
  row_payload jsonb;
  immutable boolean;
begin
  if uid is null then raise exception 'Sign in to save'; end if;
  if jsonb_typeof(batch) is distinct from 'object'
    or jsonb_typeof(batch -> 'id') is distinct from 'string'
    or coalesce(length(operation_id), 0) = 0
    or jsonb_typeof(batch -> 'lists') is distinct from 'object' then
    raise exception 'Invalid workspace batch';
  end if;
  if exists(select 1 from jsonb_object_keys(batch) k where k not in ('id', 'lists', 'drafts', 'profile')) then
    raise exception 'Unknown workspace batch field';
  end if;
  operation_hash := encode(sha256(convert_to((batch - 'id')::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':workspace', 0));
  committed_at := clock_timestamp();
  select payload_hash into prior_hash from public.workspace_commit_receipts where user_id = uid and id = operation_id;
  if prior_hash is not null then
    if prior_hash is distinct from operation_hash then raise exception 'Workspace operation id has different content'; end if;
    return jsonb_build_object('id', operation_id, 'alreadyCommitted', true);
  end if;
  for list_key, changes in
    select key, value from jsonb_each(batch -> 'lists')
    union all select 'drafts', batch -> 'drafts' where batch ? 'drafts'
  loop
    table_name := case list_key
      when 'sessions' then 'sessions' when 'assessments' then 'assessments'
      when 'errors' then 'errors' when 'plans' then 'plans' when 'stories' then 'stories'
      when 'vocabulary' then 'vocabulary' when 'vocabularyStates' then 'vocabulary_states'
      when 'vocabularyEvidence' then 'vocabulary_evidence' when 'vocabularyReviews' then 'vocabulary_reviews'
      when 'vocabularyActivities' then 'vocabulary_activities' when 'wordbookProgress' then 'wordbook_progress'
      when 'wordbookEnrollments' then 'wordbook_enrollments' when 'vocabularyImportBatches' then 'vocabulary_import_batches'
      when 'vocabularySessions' then 'vocabulary_sessions' when 'examAttempts' then 'exam_attempts'
      when 'intensiveSessions' then 'intensive_sessions' when 'drafts' then 'drafts'
    end;
    if table_name is null or (list_key = 'drafts' and (batch -> 'lists') ? 'drafts') then
      raise exception 'Unknown workspace collection: %', list_key;
    end if;
    if jsonb_typeof(changes) is distinct from 'object'
      or jsonb_typeof(changes -> 'upserts') is distinct from 'array'
      or jsonb_typeof(changes -> 'deletes') is distinct from 'array' then
      raise exception 'Invalid workspace collection: %', list_key;
    end if;
    immutable := list_key = any(array['vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'vocabularyImportBatches', 'vocabularySessions']);
    if immutable and jsonb_array_length(changes -> 'deletes') > 0 then
      raise exception 'Vocabulary history is immutable';
    end if;
    for row_data in select value from jsonb_array_elements(changes -> 'upserts') loop
      row_id := row_data ->> 'id'; row_payload := row_data -> 'payload';
      if jsonb_typeof(row_data) is distinct from 'object'
        or jsonb_typeof(row_data -> 'id') is distinct from 'string'
        or coalesce(length(row_id), 0) = 0
        or jsonb_typeof(row_payload) is distinct from 'object'
        or (list_key <> 'drafts' and row_payload ->> 'id' is distinct from row_id) then
        raise exception 'Invalid workspace row in %', list_key;
      end if;
      -- Existing clients used their local clocks. Preserve a future baseline so
      -- keep_newer_row cannot silently discard an acknowledged workspace edit.
      execute format('insert into public.%I(user_id,id,payload,updated_at) values($1,$2,$3,$4)
        on conflict(user_id,id) do update set payload=excluded.payload,
          updated_at=greatest(excluded.updated_at,public.%I.updated_at)', table_name, table_name)
        using uid, row_id, row_payload, committed_at;
    end loop;
    for row_data in select value from jsonb_array_elements(changes -> 'deletes') loop
      if jsonb_typeof(row_data) is distinct from 'string' or length(row_data #>> '{}') = 0 then
        raise exception 'Invalid workspace deletion';
      end if;
      execute format('delete from public.%I where user_id=$1 and id=$2', table_name) using uid, row_data #>> '{}';
    end loop;
  end loop;
  if batch ? 'profile' then
    if jsonb_typeof(batch -> 'profile') is distinct from 'object'
      or jsonb_typeof(batch -> 'profile' -> 'settings') is distinct from 'object' then
      raise exception 'Invalid workspace profile';
    end if;
    insert into public.profiles(id,settings,active_plan_id,reviewed_at,updated_at)
      values(uid,batch -> 'profile' -> 'settings',batch -> 'profile' ->> 'activePlanId',
        (batch -> 'profile' ->> 'reviewedAt')::timestamptz,committed_at)
      on conflict(id) do update set settings=excluded.settings,active_plan_id=excluded.active_plan_id,
        reviewed_at=excluded.reviewed_at,updated_at=greatest(excluded.updated_at,public.profiles.updated_at);
  end if;
  insert into public.workspace_commit_receipts(user_id,id,payload_hash,committed_at)
    values(uid,operation_id,operation_hash,committed_at);
  return jsonb_build_object('id',operation_id,'alreadyCommitted',false);
end;
$$;
revoke all on function public.commit_workspace_changes(jsonb) from public, anon;
grant execute on function public.commit_workspace_changes(jsonb) to authenticated;

-- The specialized transactions retain their replay and immutable-history rules.
-- Their timestamp must share the workspace clock, including older skewed rows.
alter function public.commit_vocabulary_import(jsonb) rename to commit_vocabulary_import_rows;
alter function public.commit_vocabulary_session(jsonb) rename to commit_vocabulary_session_rows;
revoke all on function public.commit_vocabulary_import_rows(jsonb) from public, anon;
revoke all on function public.commit_vocabulary_session_rows(jsonb) from public, anon;
grant execute on function public.commit_vocabulary_import_rows(jsonb) to authenticated;
grant execute on function public.commit_vocabulary_session_rows(jsonb) to authenticated;

create function public.workspace_vocabulary_timestamp(batch jsonb)
returns timestamptz language plpgsql security invoker set search_path = public as $$
declare
  uid uuid := auth.uid();
  committed_at timestamptz;
  prior_at timestamptz;
  list_key text;
  table_name text;
  rows jsonb;
begin
  if uid is null then raise exception 'Sign in to save vocabulary'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':workspace', 0));
  committed_at := clock_timestamp();
  for list_key, table_name in select * from (values
    ('vocabulary', 'vocabulary'), ('vocabularyStates', 'vocabulary_states'),
    ('wordbookProgress', 'wordbook_progress'), ('wordbookEnrollments', 'wordbook_enrollments')
  ) as mutable_collections(collection_key, collection_table) loop
    rows := coalesce(batch -> 'lists' -> list_key, '[]'::jsonb);
    execute format('select max(updated_at) from public.%I where user_id=$1
      and id in (select value ->> ''id'' from jsonb_array_elements($2))', table_name)
      into prior_at using uid, rows;
    committed_at := greatest(committed_at, prior_at);
  end loop;
  return committed_at;
end;
$$;
revoke all on function public.workspace_vocabulary_timestamp(jsonb) from public, anon;
grant execute on function public.workspace_vocabulary_timestamp(jsonb) to authenticated;

create function public.commit_vocabulary_import(batch jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  select public.commit_vocabulary_import_rows(jsonb_set(batch, '{updatedAt}',
    to_jsonb(public.workspace_vocabulary_timestamp(batch))));
$$;
create function public.commit_vocabulary_session(batch jsonb)
returns jsonb language sql security invoker set search_path = public as $$
  select public.commit_vocabulary_session_rows(jsonb_set(batch, '{updatedAt}',
    to_jsonb(public.workspace_vocabulary_timestamp(batch))));
$$;
revoke all on function public.commit_vocabulary_import(jsonb) from public, anon;
revoke all on function public.commit_vocabulary_session(jsonb) from public, anon;
grant execute on function public.commit_vocabulary_import(jsonb) to authenticated;
grant execute on function public.commit_vocabulary_session(jsonb) to authenticated;
