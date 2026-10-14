create table if not exists public.exam_annotations (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload ->> 'id' is not distinct from id),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.exam_annotations enable row level security;
drop policy if exists exam_annotations_own on public.exam_annotations;
create policy exam_annotations_own on public.exam_annotations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.exam_annotations from anon, authenticated;
grant select, insert, update, delete on public.exam_annotations to authenticated;
grant all on public.exam_annotations to service_role;
drop trigger if exists keep_newer on public.exam_annotations;
create trigger keep_newer before update on public.exam_annotations
  for each row execute function public.keep_newer_row();
create index if not exists exam_annotations_source
  on public.exam_annotations (user_id, (payload ->> 'skill'), (payload ->> 'sourceId'));

-- Extend the active inner transaction, preserving its replay receipts and the
-- outer vocabulary identity wrapper. Refuse an unexpected function version.
do $$
declare
  definition text;
  marker text := 'when ''intensiveSessions'' then ''intensive_sessions''';
  addition text := 'when ''examAnnotations'' then ''exam_annotations''';
begin
  select pg_get_functiondef('public.commit_workspace_changes_neutral_rows(jsonb)'::regprocedure) into definition;
  if position(addition in definition) = 0 then
    if position(marker in definition) = 0 then
      raise exception 'Workspace collection allowlist was changed; review annotation migration';
    end if;
    execute replace(definition, marker, marker || E'\n      ' || addition);
  end if;
end;
$$;
