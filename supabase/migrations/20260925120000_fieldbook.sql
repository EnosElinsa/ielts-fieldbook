-- Shared catalog and per-user study records for Fieldbook.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  active_plan_id text,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.writing_questions (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.speaking_topics (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.speaking_samples (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.drafts (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.assessments (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.lexicon (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.errors (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.plans (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table public.stories (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create or replace function public.keep_newer_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

do $$
declare
  table_name text;
begin
  foreach table_name in array array['profiles', 'sessions', 'drafts', 'assessments', 'lexicon', 'errors', 'plans', 'stories']
  loop
    execute format(
      'create trigger keep_newer before update on public.%I for each row execute function public.keep_newer_row()',
      table_name
    );
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.writing_questions enable row level security;
alter table public.speaking_topics enable row level security;
alter table public.speaking_samples enable row level security;
alter table public.sessions enable row level security;
alter table public.drafts enable row level security;
alter table public.assessments enable row level security;
alter table public.lexicon enable row level security;
alter table public.errors enable row level security;
alter table public.plans enable row level security;
alter table public.stories enable row level security;

create policy profiles_own on public.profiles
  for all to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy writing_questions_read on public.writing_questions
  for select to authenticated
  using (true);

create policy speaking_topics_read on public.speaking_topics
  for select to authenticated
  using (true);

create policy speaking_samples_read on public.speaking_samples
  for select to authenticated
  using (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['sessions', 'drafts', 'assessments', 'lexicon', 'errors', 'plans', 'stories']
  loop
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      table_name || '_own',
      table_name
    );
  end loop;
end;
$$;

revoke all on table public.profiles from anon;
revoke all on table public.writing_questions from anon, authenticated;
revoke all on table public.speaking_topics from anon, authenticated;
revoke all on table public.speaking_samples from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.drafts from anon, authenticated;
revoke all on table public.assessments from anon, authenticated;
revoke all on table public.lexicon from anon, authenticated;
revoke all on table public.errors from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
revoke all on table public.stories from anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select on table public.writing_questions to authenticated;
grant select on table public.speaking_topics to authenticated;
grant select on table public.speaking_samples to authenticated;
grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert, update, delete on table public.drafts to authenticated;
grant select, insert, update, delete on table public.assessments to authenticated;
grant select, insert, update, delete on table public.lexicon to authenticated;
grant select, insert, update, delete on table public.errors to authenticated;
grant select, insert, update, delete on table public.plans to authenticated;
grant select, insert, update, delete on table public.stories to authenticated;

insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy recordings_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy recordings_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy recordings_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy recordings_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'recordings'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
