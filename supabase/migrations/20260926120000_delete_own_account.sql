create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in to delete this account';
  end if;

  delete from storage.objects
  where bucket_id = 'recordings'
    and (storage.foldername(name))[1] = uid::text;

  delete from auth.users
  where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
