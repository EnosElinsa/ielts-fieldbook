-- Scoped scheduling reads and history pages share the existing account/RLS boundary.
-- A compact whole-schedule stamp preserves optimistic concurrency without sending
-- every historical payload to the browser. Replay returns its original stamp.
alter table public.workspace_commit_receipts add column if not exists plan_stamp text;

create or replace function public.planning_state_stamp()
returns text language sql stable security invoker set search_path=public as $$
  select md5(coalesce(jsonb_object_agg(id,payload order by id),'{}'::jsonb)::text)
  from public.plans where user_id=auth.uid();
$$;

create or replace function public.load_planning_workspace(options jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare today text:=coalesce(options->>'today',current_date::text); result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to load planning'; end if;
  perform today::date;
  with own as materialized (select id,payload from public.plans where user_id=auth.uid()),
  anchors as (
    (select id from own where coalesce(payload->>'originalDateKey',payload->>'dateKey')<today
      and jsonb_typeof(payload->'rotationIndex')='number'
      order by coalesce(payload->>'originalDateKey',payload->>'dateKey') desc,(payload->>'rotationIndex')::numeric desc,id desc limit 1)
    union
    (select id from own where payload->>'status' is distinct from 'skipped'
      and payload->'target'->>'mode'='learning-batch' and payload->>'dateKey'<=today
      order by payload->>'dateKey' desc,
        case when payload->>'order' ~ '^-?[0-9]+([.][0-9]+)?$' then (payload->>'order')::numeric else 0 end desc,id desc limit 1)
  )
  select jsonb_build_object(
    'profile',(select jsonb_build_object('settings',settings,'active_plan_id',active_plan_id,'reviewed_at',reviewed_at) from public.profiles where id=auth.uid()),
    'plans',coalesce((select jsonb_agg(jsonb_build_object('id',id,'payload',payload) order by id) from own
      where coalesce((options->>'full')::boolean,false)
        or payload->>'status' is null or payload->>'status' not in ('completed','skipped')
        or payload->>'dateKey'>=today or id in (select id from anchors)
        or id=(select active_plan_id from public.profiles where id=auth.uid())),'[]'::jsonb),
    'historyCount',(select count(*) from own where payload->>'status' in ('completed','skipped') and payload->>'archivedAt' is null),
    'planStamp',md5(coalesce((select jsonb_object_agg(id,payload order by id) from own),'{}'::jsonb)::text)
  ) into result;
  return result;
end $$;

create or replace function public.load_planning_history(options jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb; page_size integer:=least(100,greatest(1,coalesce((options->>'limit')::integer,20)));
  page_offset integer:=greatest(0,coalesce((options->>'offset')::integer,0));
  view_status text:=coalesce(options->>'status','all');
begin
  if auth.uid() is null then raise exception 'Sign in to load planning history'; end if;
  if view_status not in ('all','completed','skipped','system','archived') then raise exception 'Invalid history status'; end if;
  with filtered as materialized (
    select id,payload from public.plans where user_id=auth.uid() and payload->>'status' in ('completed','skipped')
      and case view_status
        when 'archived' then payload->>'archivedAt' is not null
        when 'system' then payload->>'archivedAt' is null and payload->>'skipReason' in ('merged-review','no-longer-due')
        when 'skipped' then payload->>'archivedAt' is null and payload->>'status'='skipped' and coalesce(payload->>'skipReason','') not in ('merged-review','no-longer-due')
        when 'completed' then payload->>'archivedAt' is null and payload->>'status'='completed'
        else payload->>'archivedAt' is null end
      and (coalesce(options->>'skill','all')='all' or payload->>'skill'=options->>'skill')
      and (coalesce(options->>'origin','all')='all' or coalesce(payload->>'origin','automatic')=options->>'origin')
      and (coalesce(options->>'reason','all')='all' or payload->>'skipReason'=options->>'reason')
      and (coalesce(options->>'from','')='' or payload->>'dateKey'>=options->>'from')
      and (coalesce(options->>'to','')='' or payload->>'dateKey'<=options->>'to')
      and (not coalesce((options->>'skippedOnly')::boolean,false) or payload->>'status'='skipped')
  ), ranked as materialized (
    select *,row_number() over(order by payload->>'dateKey' desc,
      case when payload->>'order' ~ '^-?[0-9]+([.][0-9]+)?$' then (payload->>'order')::numeric else 0 end desc,id desc)-1 as position from filtered
  ), bounds as (
    select coalesce((select (position/page_size)*page_size from ranked where id=options->>'targetId'),
      least(page_offset,greatest(0,((select count(*) from ranked)-1)/page_size*page_size))) as start
  )
  select jsonb_build_object('total',(select count(*) from ranked),'offset',(select start from bounds),'planStamp',public.planning_state_stamp(),
    'ids',case when coalesce((options->>'allIds')::boolean,false) then coalesce((select jsonb_agg(id order by position) from ranked),'[]'::jsonb) else null end,
    'plans',case when coalesce((options->>'allIds')::boolean,false) then '[]'::jsonb else
      coalesce((select jsonb_agg(jsonb_build_object('id',id,'payload',payload) order by position) from ranked,bounds where position>=start and position<start+page_size),'[]'::jsonb) end
  ) into result;
  return result;
end $$;

do $$
declare definition text; marker text := '    if batch->''baseline'' ? ''planSet'' then';
begin
  select pg_get_functiondef('public.commit_workspace_changes_neutral_rows(jsonb)'::regprocedure) into definition;
  if position('Invalid schedule stamp' in definition)=0 then
    if position(marker in definition)=0 then raise exception 'Schedule guard changed; review history migration'; end if;
    definition:=replace(definition,marker,$guard$
    if batch->'baseline' ? 'planStamp' then
      if jsonb_typeof(batch->'baseline'->'planStamp') is distinct from 'string' then raise exception 'Invalid schedule stamp'; end if;
      if public.planning_state_stamp() is distinct from batch->'baseline'->>'planStamp' then
        raise exception 'Planning baseline conflict: schedule changed on another device' using errcode='40001';
      end if;
    end if;
$guard$ || marker);
    definition:=replace(definition,
      'workspace_commit_receipts(user_id,id,payload_hash,committed_at)',
      'workspace_commit_receipts(user_id,id,payload_hash,committed_at,plan_stamp)');
    definition:=replace(definition,'values(uid,operation_id,operation_hash,committed_at);',
      'values(uid,operation_id,operation_hash,committed_at,case when batch->''baseline'' ? ''planStamp'' then public.planning_state_stamp() end);');
    definition:=replace(definition,$old$return jsonb_build_object('id',operation_id,'alreadyCommitted',false);$old$,
      $new$return jsonb_build_object('id',operation_id,'alreadyCommitted',false) || case when batch->'baseline' ? 'planStamp' then jsonb_build_object('planStamp',public.planning_state_stamp()) else '{}'::jsonb end;$new$);
    definition:=replace(definition,$old$return jsonb_build_object('id', operation_id, 'alreadyCommitted', true);$old$,
      $new$return jsonb_build_object('id', operation_id, 'alreadyCommitted', true) || case when batch->'baseline' ? 'planStamp' then jsonb_build_object('planStamp',(select plan_stamp from public.workspace_commit_receipts where user_id=uid and id=operation_id)) else '{}'::jsonb end;$new$);
    execute definition;
  end if;
end $$;

create or replace function public.commit_workspace_changes(batch jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare old_hash text; saved_stamp text;
begin
  if auth.uid() is null then raise exception 'Sign in to save'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':workspace',0));
  select payload_hash,plan_stamp into old_hash,saved_stamp from public.workspace_commit_receipts where user_id=auth.uid() and id=batch->>'id';
  if old_hash=encode(sha256(convert_to((batch-'id')::text,'UTF8')),'hex') then
    return jsonb_build_object('id',batch->>'id','alreadyCommitted',true)
      || case when saved_stamp is not null then jsonb_build_object('planStamp',saved_stamp) else '{}'::jsonb end;
  end if;
  return public.commit_workspace_changes_neutral_rows(public.neutral_vocabulary_batch(batch));
end $$;

revoke all on function public.planning_state_stamp(),public.load_planning_workspace(jsonb),public.load_planning_history(jsonb) from public,anon;
grant execute on function public.planning_state_stamp(),public.load_planning_workspace(jsonb),public.load_planning_history(jsonb) to authenticated;
