-- Submitted vocabulary practice is account-owned, immutable completion history.
create table public.vocabulary_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) > 0),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ->> 'id' is not distinct from id
    and payload ->> 'status' is not distinct from 'submitted'
    and jsonb_typeof(payload -> 'summary') is not distinct from 'object'
  ),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.vocabulary_sessions enable row level security;
create policy vocabulary_sessions_read on public.vocabulary_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy vocabulary_sessions_insert on public.vocabulary_sessions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy vocabulary_sessions_update on public.vocabulary_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.vocabulary_sessions from anon, authenticated;
grant select, insert, update on public.vocabulary_sessions to authenticated;
grant all on public.vocabulary_sessions to service_role;
create trigger immutable_history before update on public.vocabulary_sessions
  for each row execute function public.keep_vocabulary_history();

-- Persist practice effects and the completion marker together; no import batch is
-- created and no shared catalog, writing record, draft, or profile is touched.
create or replace function public.commit_vocabulary_session(batch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  session_id text := batch ->> 'id';
  session_payload jsonb := batch -> 'session';
  existing_payload jsonb;
  list_key text;
  table_name text;
  row_data jsonb;
  row_payload jsonb;
  row_id text;
  committed_at timestamptz;
  immutable boolean;
begin
  if uid is null then raise exception 'Sign in to save vocabulary practice'; end if;
  if jsonb_typeof(batch) is distinct from 'object'
    or jsonb_typeof(batch -> 'id') is distinct from 'string'
    or coalesce(length(session_id), 0) = 0 then
    raise exception 'A vocabulary session id is required';
  end if;
  if jsonb_typeof(batch -> 'lists') is distinct from 'object'
    or jsonb_typeof(session_payload) is distinct from 'object'
    or session_payload ->> 'id' is distinct from session_id
    or session_payload ->> 'status' is distinct from 'submitted'
    or jsonb_typeof(session_payload -> 'summary') is distinct from 'object' then
    raise exception 'Invalid completed vocabulary session';
  end if;
  committed_at := (batch ->> 'updatedAt')::timestamptz;
  if committed_at is null or not isfinite(committed_at) then raise exception 'Session timestamp is required'; end if;

  -- A deterministic account/session id serializes overlapping retries.
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':vocabulary-session:' || session_id, 0));
  select payload into existing_payload from public.vocabulary_sessions where user_id = uid and id = session_id;
  if existing_payload is not null then
    if existing_payload is distinct from session_payload then
      raise exception 'Vocabulary session already exists with different content: %', session_id;
    end if;
    return jsonb_build_object('id', session_id, 'alreadyCommitted', true);
  end if;

  for list_key in select jsonb_object_keys(batch -> 'lists') loop
    if not list_key = any(array['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews',
      'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularySessions']) then
      raise exception 'Unknown vocabulary session collection: %', list_key;
    end if;
  end loop;
  foreach list_key in array array['vocabulary', 'vocabularyStates', 'vocabularyEvidence', 'vocabularyReviews',
    'vocabularyActivities', 'wordbookProgress', 'wordbookEnrollments', 'vocabularySessions'] loop
    if jsonb_typeof(batch -> 'lists' -> list_key) is distinct from 'array' then
      raise exception 'Vocabulary session collection must be an array: %', list_key;
    end if;
    table_name := case list_key
      when 'vocabulary' then 'vocabulary'
      when 'vocabularyStates' then 'vocabulary_states'
      when 'vocabularyEvidence' then 'vocabulary_evidence'
      when 'vocabularyReviews' then 'vocabulary_reviews'
      when 'vocabularyActivities' then 'vocabulary_activities'
      when 'wordbookProgress' then 'wordbook_progress'
      when 'wordbookEnrollments' then 'wordbook_enrollments'
      when 'vocabularySessions' then 'vocabulary_sessions'
    end;
    immutable := list_key = any(array['vocabularyEvidence', 'vocabularyReviews', 'vocabularyActivities', 'vocabularySessions']);
    for row_data in select value from jsonb_array_elements(batch -> 'lists' -> list_key) loop
      row_id := row_data ->> 'id';
      row_payload := row_data -> 'payload';
      if jsonb_typeof(row_data) is distinct from 'object'
        or jsonb_typeof(row_data -> 'id') is distinct from 'string'
        or coalesce(length(row_id), 0) = 0
        or jsonb_typeof(row_payload) is distinct from 'object'
        or row_payload ->> 'id' is distinct from row_id then
        raise exception 'Invalid row in vocabulary session collection: %', list_key;
      end if;
      if list_key = 'vocabularySessions' then
        if row_id is distinct from session_id or row_payload is distinct from session_payload then
          raise exception 'Vocabulary session does not match its row';
        end if;
        continue;
      end if;
      if list_key = any(array['vocabularyEvidence', 'vocabularyReviews'])
        and row_payload ->> 'sessionId' is not null
        and row_payload ->> 'sessionId' is distinct from session_id then
        raise exception 'Vocabulary history row belongs to a different session: %', row_id;
      end if;
      if immutable then
        -- The immutable-history trigger rejects conflicting content, including
        -- a row inserted by a concurrent request between validation and insert.
        execute format('insert into public.%I(user_id, id, payload, updated_at) values ($1, $2, $3, $4)
          on conflict (user_id, id) do update set payload = excluded.payload, updated_at = excluded.updated_at', table_name)
          using uid, row_id, row_payload, committed_at;
      else
        execute format('insert into public.%I(user_id, id, payload, updated_at) values ($1, $2, $3, $4)
          on conflict (user_id, id) do update set payload = excluded.payload, updated_at = excluded.updated_at
          where public.%I.updated_at <= excluded.updated_at', table_name, table_name)
          using uid, row_id, row_payload, committed_at;
      end if;
    end loop;
  end loop;
  insert into public.vocabulary_sessions(user_id, id, payload, updated_at)
    values (uid, session_id, session_payload, committed_at);
  return jsonb_build_object('id', session_id, 'alreadyCommitted', false);
end;
$$;

revoke all on function public.commit_vocabulary_session(jsonb) from public, anon;
grant execute on function public.commit_vocabulary_session(jsonb) to authenticated;
