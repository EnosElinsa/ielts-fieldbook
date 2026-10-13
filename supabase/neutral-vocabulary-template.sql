-- Generated fixed aliases are inserted below by the builder.
begin;
create table if not exists public.vocabulary_identity_aliases (
  kind text not null check(kind in ('book','unit','membership')),
  old_id text not null,
  neutral_id text not null,
  primary key(kind,old_id)
);
alter table public.vocabulary_identity_aliases enable row level security;
create index if not exists vocabulary_identity_old_id on public.vocabulary_identity_aliases(old_id);
drop policy if exists vocabulary_identity_read on public.vocabulary_identity_aliases;
create policy vocabulary_identity_read on public.vocabulary_identity_aliases for select to authenticated using(true);
revoke all on public.vocabulary_identity_aliases from public,anon,authenticated;
grant select on public.vocabulary_identity_aliases to authenticated;
grant all on public.vocabulary_identity_aliases to service_role;
__IDENTITY_VALUES__

create or replace function public.neutral_vocabulary_id(value text, identity_kind text default null)
returns text language plpgsql stable security invoker set search_path=public as $$
declare mapped text; source_book text; source_unit text;
begin
  -- Canonical ids and ordinary content never need a mapping-table lookup.
  if value is null or value !~ '^(guixue:|[0-9]+$|starter:|import-enrollment:|guixue-progress:)' then return value; end if;
  select neutral_id into mapped from public.vocabulary_identity_aliases
    where old_id=value and (identity_kind is null or kind=identity_kind)
    order by case kind when 'book' then 0 when 'unit' then 1 else 2 end limit 1;
  if mapped is not null then return mapped; end if;
  if value like 'import-enrollment:%' then return 'import-enrollment:' || public.neutral_vocabulary_id(substr(value,19),'book'); end if;
  if value ~ '^guixue:[0-9]+:[0-9]+:ve-[^:]+(:membership)?$' and identity_kind is distinct from 'book' and identity_kind is distinct from 'unit' then
    source_book:=substring(value from '^(guixue:[0-9]+):');
    source_unit:=substring(value from '^guixue:[0-9]+:([0-9]+):');
    return public.neutral_vocabulary_id(source_book,'book') || ':' || public.neutral_vocabulary_id(source_unit,'unit') || ':' || substring(value from '^guixue:[0-9]+:[0-9]+:(.*)$');
  end if;
  if value ~ '^guixue-progress:.*:[0-9]+:[0-9]+$' then
    source_unit:=substring(value from '[0-9]+$');
    mapped:=public.neutral_vocabulary_id(source_unit,'unit');
    if mapped is distinct from source_unit then return regexp_replace(value,'^guixue-progress:(.*):[0-9]+:([0-9]+)$','imported-progress:\1:') || mapped; end if;
  end if;
  return value;
end;
$$;
create or replace function public.neutral_vocabulary_route(value text)
returns text language plpgsql stable security invoker set search_path=public as $$
declare result text:=value; alias record; encoded text;
begin
  if value not like '/vocabulary%' then return value; end if;
  if value !~ '(guixue|starter|[?&](bookId|unitId)=[0-9]|/(wordbooks|groups)/[0-9])' then return value; end if;
  for alias in select * from public.vocabulary_identity_aliases where kind in ('book','unit') loop
    encoded := replace(alias.old_id,':','%3A');
    if alias.kind='book' then
      result := regexp_replace(result,'(/wordbooks/)(' || alias.old_id || '|' || encoded || ')(/|[?#]|$)','\1' || alias.neutral_id || '\3','gi');
      result := regexp_replace(result,'([?&]bookId=)(' || alias.old_id || '|' || encoded || ')(&|#|$)','\1' || alias.neutral_id || '\3','gi');
    else
      result := regexp_replace(result,'(/groups/)(' || alias.old_id || '|' || encoded || ')(/|[?#]|$)','\1' || alias.neutral_id || '\3','gi');
      result := regexp_replace(result,'([?&]unitId=)(' || alias.old_id || '|' || encoded || ')(&|#|$)','\1' || alias.neutral_id || '\3','gi');
    end if;
  end loop;
  return result;
end $$;
create or replace function public.neutral_vocabulary_json(value jsonb, field_name text default '')
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; item record; text_value text; next_value jsonb;
begin
  if field_name=any(array['sourceRecord','sourceReports','record','reports','answers','responses']) then return value; end if;
  -- A single structural-key scan skips dictionary content and unchanged account
  -- rows instead of recursing through every definition, example and sense.
  if jsonb_typeof(value) in ('object','array')
    and field_name<>all(array['units','booksById','unitsById','membershipsById'])
    and value::text !~ '"(bookId|unitId|parentId|membershipId|sourceId|returnTo|href|origin|units|booksById|unitsById|membershipsById)"[[:space:]]*:|"id"[[:space:]]*:[[:space:]]*"(guixue:|import-enrollment:|guixue-progress:)|"type"[[:space:]]*:[[:space:]]*"wordbook"' then return value; end if;
  if jsonb_typeof(value)='array' then
    select coalesce(jsonb_agg(public.neutral_vocabulary_json(v,field_name) order by n),'[]') into result from jsonb_array_elements(value) with ordinality as a(v,n);
    return result;
  elsif jsonb_typeof(value)='object' then
    result := '{}';
    for item in select key,val from jsonb_each(value) as e(key,val) loop
      if jsonb_typeof(item.val) in ('object','array') or item.key=any(array['bookId','unitId','parentId','membershipId','sourceId','returnTo','href','origin']) then
        next_value := public.neutral_vocabulary_json(item.val,item.key);
      else next_value:=item.val;
      end if;
      if item.key='id' and jsonb_typeof(item.val)='string' then
        text_value := item.val #>> '{}';
        if text_value like 'guixue:%' and exists(select 1 from public.vocabulary_identity_aliases where old_id=text_value and kind in ('membership','book'))
          or (value ? 'bookId' and (value ? 'kind' or value ? 'parentId')) or field_name='units' or value->>'type'='wordbook' or text_value like 'import-enrollment:%' or text_value like 'guixue-progress:%' then
          next_value := to_jsonb(public.neutral_vocabulary_id(text_value,case when field_name='units' or value ? 'bookId' and (value ? 'kind' or value ? 'parentId') then 'unit' else null end));
        end if;
      end if;
      result := result || jsonb_build_object(case when field_name=any(array['booksById','unitsById','membershipsById']) then public.neutral_vocabulary_id(item.key) else item.key end,next_value);
    end loop;
    return result;
  elsif jsonb_typeof(value)='string' then
    text_value := value #>> '{}';
    if field_name='bookId' then return to_jsonb(public.neutral_vocabulary_id(text_value,'book'));
    elsif field_name=any(array['unitId','parentId']) then return to_jsonb(public.neutral_vocabulary_id(text_value,'unit'));
    elsif field_name=any(array['sourceId','membershipId']) then return to_jsonb(public.neutral_vocabulary_id(text_value,'membership'));
    elsif field_name=any(array['returnTo','href','origin']) then return to_jsonb(public.neutral_vocabulary_route(text_value));
    end if;
  end if;
  return value;
end;
$$;
revoke all on function public.neutral_vocabulary_id(text,text), public.neutral_vocabulary_route(text), public.neutral_vocabulary_json(jsonb,text) from public,anon;
grant execute on function public.neutral_vocabulary_id(text,text), public.neutral_vocabulary_route(text), public.neutral_vocabulary_json(jsonb,text) to authenticated,service_role;

-- Alphabetically first BEFORE trigger normalizes legacy direct writes before
-- immutable_history compares payloads. It does not change ownership or clocks.
create or replace function public.normalize_vocabulary_write()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if tg_table_name='profiles' then
    new.settings:=public.neutral_vocabulary_json(new.settings);
    return new;
  end if;
  new.payload := public.neutral_vocabulary_json(new.payload);
  if tg_table_name=any(array['wordbook_enrollments','wordbook_progress','wordbooks','wordbook_units','wordbook_memberships']) then
    new.id := public.neutral_vocabulary_id(new.id,case tg_table_name when 'wordbook_units' then 'unit' when 'wordbooks' then 'book' when 'wordbook_memberships' then 'membership' else null end);
    if new.payload ? 'id' then new.payload := jsonb_set(new.payload,'{id}',to_jsonb(new.id)); end if;
  end if;
  return new;
end;
$$;
revoke all on function public.normalize_vocabulary_write() from public,anon;
grant execute on function public.normalize_vocabulary_write() to authenticated,service_role;

do $$
declare table_name text; trigger_row record; account uuid; collision boolean; identity_kind text;
begin
  for account in select id from auth.users order by id loop
    perform pg_advisory_xact_lock(hashtextextended(account::text || ':workspace',0));
  end loop;
  -- Lock tables before touching history; concurrent writes resume with
  -- compatibility triggers installed after this transaction commits.
  foreach table_name in array array['wordbooks','wordbook_units','wordbook_memberships','vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','plans','drafts','profiles'] loop
    execute format('lock table public.%I in access exclusive mode',table_name);
  end loop;
  -- Abort collisions instead of merging or dropping any learner records.
  foreach table_name in array array['wordbooks','wordbook_units','wordbook_memberships'] loop
    identity_kind:=case table_name when 'wordbooks' then 'book' when 'wordbook_units' then 'unit' else 'membership' end;
    execute format('select exists(select 1 from public.%I group by public.neutral_vocabulary_id(id,$1) having count(*)>1)',table_name) into collision using identity_kind;
    if collision then raise exception 'Neutral identity collision in %',table_name; end if;
  end loop;
  foreach table_name in array array['wordbook_enrollments','wordbook_progress'] loop
    execute format('select exists(select 1 from public.%I group by user_id,public.neutral_vocabulary_id(id) having count(*)>1)',table_name) into collision;
    if collision then raise exception 'Neutral account identity collision in %',table_name; end if;
  end loop;
  create temporary table if not exists identity_trigger_restore(table_name text,trigger_name text,enabled "char") on commit drop;
  truncate identity_trigger_restore;
  for trigger_row in select c.relname as table_name,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and t.tgname in ('keep_newer','immutable_history')
      and c.relname=any(array['vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','plans','drafts','profiles']) loop
    insert into identity_trigger_restore values(trigger_row.table_name,trigger_row.tgname,trigger_row.tgenabled);
    execute format('alter table public.%I disable trigger %I',trigger_row.table_name,trigger_row.tgname);
  end loop;
  foreach table_name in array array['wordbooks','wordbook_units','wordbook_memberships','wordbook_enrollments','wordbook_progress'] loop
    identity_kind:=case table_name when 'wordbooks' then 'book' when 'wordbook_units' then 'unit' when 'wordbook_memberships' then 'membership' else null end;
    -- Evaluate each normalization once. ctid identifies the unchanged input row
    -- within this statement while the administrator holds an exclusive lock.
    execute format('with converted as materialized (select ctid row_id,public.neutral_vocabulary_id(id,$1) new_id,public.neutral_vocabulary_json(payload) new_payload from public.%I)
      update public.%I t set id=c.new_id,payload=jsonb_set(c.new_payload,''{id}'',to_jsonb(c.new_id)) from converted c
      where t.ctid=c.row_id and (t.id is distinct from c.new_id or t.payload is distinct from jsonb_set(c.new_payload,''{id}'',to_jsonb(c.new_id)))',table_name,table_name) using identity_kind;
  end loop;
  foreach table_name in array array['vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','vocabulary_import_batches','vocabulary_sessions','plans','drafts'] loop
    execute format('with converted as materialized (select ctid row_id,public.neutral_vocabulary_json(payload) new_payload from public.%I)
      update public.%I t set payload=c.new_payload from converted c where t.ctid=c.row_id and t.payload is distinct from c.new_payload',table_name,table_name);
  end loop;
  with converted as materialized (select ctid row_id,public.neutral_vocabulary_json(settings) new_settings from public.profiles)
    update public.profiles t set settings=c.new_settings from converted c where t.ctid=c.row_id and t.settings is distinct from c.new_settings;
  for trigger_row in select * from identity_trigger_restore loop
    execute format('alter table public.%I %s trigger %I',trigger_row.table_name,
      case trigger_row.enabled when 'D' then 'disable' when 'R' then 'enable replica' when 'A' then 'enable always' else 'enable' end,trigger_row.trigger_name);
  end loop;
  foreach table_name in array array['wordbooks','wordbook_units','wordbook_memberships','vocabulary','vocabulary_states','vocabulary_evidence','vocabulary_reviews','vocabulary_activities','wordbook_progress','wordbook_enrollments','vocabulary_import_batches','vocabulary_sessions','plans','drafts','profiles'] loop
    execute format('drop trigger if exists a_neutral_vocabulary_write on public.%I',table_name);
    execute format('create trigger a_neutral_vocabulary_write before insert or update on public.%I for each row execute function public.normalize_vocabulary_write()',table_name);
  end loop;
end;
$$;

-- Normalize entire RPC batches before exact id validation, deletion and conflict
-- checks. Preserve the existing invoker/RLS and atomic receipt implementation.
do $$ begin
  if to_regprocedure('public.commit_workspace_changes_neutral_rows(jsonb)') is null then
    alter function public.commit_workspace_changes(jsonb) rename to commit_workspace_changes_neutral_rows;
  end if;
  if to_regprocedure('public.commit_vocabulary_import_neutral_rows(jsonb)') is null then
    alter function public.commit_vocabulary_import_rows(jsonb) rename to commit_vocabulary_import_neutral_rows;
  end if;
  if to_regprocedure('public.commit_vocabulary_session_neutral_rows(jsonb)') is null then
    alter function public.commit_vocabulary_session_rows(jsonb) rename to commit_vocabulary_session_neutral_rows;
  end if;
end $$;
create or replace function public.neutral_vocabulary_batch(batch jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb := public.neutral_vocabulary_json(batch); list_row record; changes jsonb; rows jsonb;
begin
  for list_row in select key,value from jsonb_each(coalesce(batch->'lists','{}')) loop
    changes := result->'lists'->list_row.key;
    if jsonb_typeof(changes)='object' and changes ? 'deletes' then
      select coalesce(jsonb_agg(case when jsonb_typeof(v)='string' and list_row.key in ('wordbookEnrollments','wordbookProgress') then to_jsonb(public.neutral_vocabulary_id(v #>> '{}')) else v end),'[]') into rows from jsonb_array_elements(changes->'deletes') a(v);
      result := jsonb_set(result,array['lists',list_row.key,'deletes'],rows);
    end if;
    if list_row.key in ('wordbookEnrollments','wordbookProgress') then
      rows := case when jsonb_typeof(changes)='array' then changes else changes->'upserts' end;
      select coalesce(jsonb_agg(jsonb_set(v,'{id}',to_jsonb(public.neutral_vocabulary_id(v->>'id')))),'[]') into rows from jsonb_array_elements(rows) a(v);
      result := jsonb_set(result,case when jsonb_typeof(changes)='array' then array['lists',list_row.key] else array['lists',list_row.key,'upserts'] end,rows);
    end if;
  end loop;
  return result;
end $$;
create or replace function public.commit_vocabulary_import_rows(batch jsonb)
returns jsonb language sql security invoker set search_path=public as $$ select public.commit_vocabulary_import_neutral_rows(public.neutral_vocabulary_batch(batch)); $$;
create or replace function public.commit_vocabulary_session_rows(batch jsonb)
returns jsonb language sql security invoker set search_path=public as $$ select public.commit_vocabulary_session_neutral_rows(public.neutral_vocabulary_batch(batch)); $$;
create or replace function public.commit_workspace_changes(batch jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare old_hash text;
begin
  if auth.uid() is null then raise exception 'Sign in to save'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':workspace',0));
  select payload_hash into old_hash from public.workspace_commit_receipts where user_id=auth.uid() and id=batch->>'id';
  if old_hash=encode(sha256(convert_to((batch-'id')::text,'UTF8')),'hex') then
    return jsonb_build_object('id',batch->>'id','alreadyCommitted',true);
  end if;
  return public.commit_workspace_changes_neutral_rows(public.neutral_vocabulary_batch(batch));
end $$;
revoke all on function public.neutral_vocabulary_batch(jsonb),public.commit_workspace_changes(jsonb),public.commit_vocabulary_import_rows(jsonb),public.commit_vocabulary_session_rows(jsonb),public.commit_workspace_changes_neutral_rows(jsonb),public.commit_vocabulary_import_neutral_rows(jsonb),public.commit_vocabulary_session_neutral_rows(jsonb) from public,anon;
grant execute on function public.neutral_vocabulary_batch(jsonb),public.commit_workspace_changes(jsonb),public.commit_vocabulary_import_rows(jsonb),public.commit_vocabulary_session_rows(jsonb),public.commit_workspace_changes_neutral_rows(jsonb),public.commit_vocabulary_import_neutral_rows(jsonb),public.commit_vocabulary_session_neutral_rows(jsonb) to authenticated,service_role;
commit;
