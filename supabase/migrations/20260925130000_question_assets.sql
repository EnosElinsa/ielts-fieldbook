insert into storage.buckets (id, name, public)
values ('question-assets', 'question-assets', true)
on conflict (id) do nothing;

create policy question_assets_public_read on storage.objects
  for select to public
  using (bucket_id = 'question-assets');
