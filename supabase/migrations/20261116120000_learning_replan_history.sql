-- Keep automatic learning reallocation distinct from a learner's explicit skip.
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
        when 'system' then payload->>'archivedAt' is null and payload->>'skipReason' in ('merged-review','no-longer-due','replanned-learning')
        when 'skipped' then payload->>'archivedAt' is null and payload->>'status'='skipped' and coalesce(payload->>'skipReason','') not in ('merged-review','no-longer-due','replanned-learning')
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
