-- Planning baseline conflicts are deterministic, so a retry can never succeed.
-- SQLSTATE 40001 makes PostgREST 14 retry the transaction without limit (Supabase KB:
-- "SQLSTATE 40001 in an RPC function causes infinite retries"). PT409 returns HTTP 409
-- without a retry. The messages are unchanged; the client matches them by text.
do $$
declare definition text; old_code text := 'using errcode=''40001'''; new_code text := 'using errcode=''PT409''';
  old_count integer; new_count integer;
begin
  select pg_get_functiondef('public.commit_workspace_changes_neutral_rows(jsonb)'::regprocedure) into definition;
  old_count := (length(definition) - length(replace(definition, old_code, ''))) / length(old_code);
  if old_count > 0 then
    if old_count <> 4 then raise exception 'Expected 4 planning conflict raises, found %; review conflict status migration', old_count; end if;
    execute replace(definition, old_code, new_code);
    select pg_get_functiondef('public.commit_workspace_changes_neutral_rows(jsonb)'::regprocedure) into definition;
  end if;
  new_count := (length(definition) - length(replace(definition, new_code, ''))) / length(new_code);
  if position('40001' in definition) > 0 or new_count <> 4 then
    raise exception 'Planning conflict status migration did not apply cleanly (% PT409 raises)', new_count;
  end if;
end $$;
