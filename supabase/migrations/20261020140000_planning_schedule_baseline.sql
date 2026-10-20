-- Bind a preview to the complete schedule, including concurrent inserts.
-- Older clients without planSet keep the preceding compatible behavior.
do $$
declare definition text; marker text := '    if batch->''baseline'' ? ''plans'' then';
old_profile text := $old$if (select jsonb_build_object('settings',coalesce(settings,'{}'::jsonb),'activePlanId',active_plan_id,'reviewedAt',reviewed_at) from public.profiles where id=uid)
        is distinct from nullif(batch->'baseline'->'profile','null'::jsonb) then$old$;
new_profile text := $new$if (select jsonb_build_object('settings',coalesce(settings,'{}'::jsonb),'activePlanId',active_plan_id) from public.profiles where id=uid)
        is distinct from (nullif(batch->'baseline'->'profile','null'::jsonb) - 'reviewedAt')
        or (select reviewed_at from public.profiles where id=uid)
          is distinct from nullif(batch->'baseline'->'profile'->>'reviewedAt','')::timestamptz then$new$;
begin
  select pg_get_functiondef('public.commit_workspace_changes_neutral_rows(jsonb)'::regprocedure) into definition;
  if position('schedule changed on another device' in definition)=0 then
    if position(marker in definition)=0 then raise exception 'Planning guard changed; review schedule baseline migration'; end if;
    definition:=replace(definition,marker,$guard$
    if batch->'baseline' ? 'planSet' then
      if jsonb_typeof(batch->'baseline'->'planSet') is distinct from 'object' then raise exception 'Invalid schedule baseline'; end if;
      if coalesce((select jsonb_object_agg(id,payload) from public.plans where user_id=uid),'{}'::jsonb)
        is distinct from batch->'baseline'->'planSet' then
        raise exception 'Planning baseline conflict: schedule changed on another device' using errcode='40001';
      end if;
    end if;
$guard$ || marker);
  end if;
  -- JSON strings can encode the same timestamp with Z or +00:00. Compare the
  -- timestamp itself while retaining exact settings and active task baselines.
  if position(old_profile in definition)>0 then
    definition:=replace(definition,old_profile,new_profile);
  elsif position(new_profile in definition)=0 then
    raise exception 'Profile guard changed; review timestamp baseline migration';
  end if;
  execute definition;
end $$;
