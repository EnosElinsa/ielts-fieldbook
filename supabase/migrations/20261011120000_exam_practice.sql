-- Shared source catalog is administrator seeded; students can only read it.
do $$
declare table_name text;
begin
  foreach table_name in array array['exam_papers', 'exam_sections', 'exam_passages', 'exam_questions', 'exam_assets'] loop
    execute format('create table public.%I (
      id text primary key check (length(id) > 0),
      payload jsonb not null check (jsonb_typeof(payload) = ''object'' and payload ->> ''id'' is not distinct from id),
      updated_at timestamptz not null default now()
    )', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)', table_name || '_read', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;

  foreach table_name in array array['exam_attempts', 'intensive_sessions'] loop
    execute format('create table public.%I (
      user_id uuid not null references auth.users(id) on delete cascade,
      id text not null check (length(id) > 0),
      payload jsonb not null check (jsonb_typeof(payload) = ''object'' and payload ->> ''id'' is not distinct from id),
      updated_at timestamptz not null default now(),
      primary key (user_id, id)
    )', table_name);
    execute format('alter table public.%I enable row level security', table_name);
    execute format('create policy %I on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', table_name || '_own', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
    execute format('create trigger keep_newer before update on public.%I
      for each row execute function public.keep_newer_row()', table_name);
  end loop;
end;
$$;

-- JSON relationship indexes support bounded lazy queries without loading full books.
create index exam_papers_book on public.exam_papers ((payload ->> 'book'));
create index exam_sections_paper_skill on public.exam_sections ((payload ->> 'paperId'), (payload ->> 'skill'));
create index exam_passages_section on public.exam_passages ((payload ->> 'sectionId'));
create index exam_questions_section on public.exam_questions ((payload ->> 'sectionId'));
create index exam_assets_paper on public.exam_assets ((payload ->> 'paperId'));

-- Copyrighted or account-gated media never receives a public bucket URL.
insert into storage.buckets (id, name, public) values ('exam-assets', 'exam-assets', false)
  on conflict (id) do update set public = false;
create policy exam_assets_authenticated_read on storage.objects for select to authenticated
  using (bucket_id = 'exam-assets');
-- No client insert/update/delete policy is granted: only the administrator's
-- service-role ingestion process can upload and replace source media.
