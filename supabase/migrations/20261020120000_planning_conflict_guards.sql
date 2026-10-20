-- Optional optimistic baselines for newer clients. Legacy batches remain readable.
-- Validate inside the same account lock and after replay checks, before any writes.
do $$
declare definition text; marker text := '  for list_key, changes in';
begin
  select pg_get_functiondef('public.commit_workspace_changes_neutral_rows(jsonb)'::regprocedure) into definition;
  if position('Planning baseline conflict' in definition)=0 then
    if position(marker in definition)=0 or position('''id'', ''lists'', ''drafts'', ''profile''' in definition)=0 then
      raise exception 'Workspace transaction changed; review planning guard migration';
    end if;
    definition:=replace(definition,'''id'', ''lists'', ''drafts'', ''profile''','''id'', ''lists'', ''drafts'', ''profile'', ''baseline''');
    definition:=replace(definition,marker,$guard$
  if batch ? 'baseline' then
    if jsonb_typeof(batch->'baseline') is distinct from 'object' then raise exception 'Invalid planning baseline'; end if;
    if batch->'baseline' ? 'profile' and batch ? 'profile' then
      if (select jsonb_build_object('settings',coalesce(settings,'{}'::jsonb),'activePlanId',active_plan_id,'reviewedAt',reviewed_at) from public.profiles where id=uid)
        is distinct from nullif(batch->'baseline'->'profile','null'::jsonb) then
        raise exception 'Planning baseline conflict: settings changed on another device' using errcode='40001';
      end if;
    end if;
    if batch->'baseline' ? 'plans' then
      if jsonb_typeof(batch->'baseline'->'plans') is distinct from 'object' then raise exception 'Invalid planning baseline'; end if;
      for row_id,row_payload in select key,value from jsonb_each(batch->'baseline'->'plans') loop
        if (select payload from public.plans where user_id=uid and id=row_id) is distinct from nullif(row_payload,'null'::jsonb) then
          raise exception 'Planning baseline conflict: task changed on another device' using errcode='40001';
        end if;
      end loop;
    end if;
  end if;
$guard$ || marker);
    execute definition;
  end if;
end $$;
