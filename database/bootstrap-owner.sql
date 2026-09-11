-- Run manually in Supabase SQL Editor AFTER registering and verifying your account.
-- Replace the email below. This is intentionally not part of migrations.
-- No default password and no public API can create an owner.
do $$
declare target uuid;
begin
  if exists(select 1 from public.profiles where is_owner) then
    raise exception 'An owner already exists. Do not run bootstrap twice.';
  end if;
  select id into target from auth.users
    where lower(email)=lower('REPLACE_WITH_YOUR_EMAIL') and email_confirmed_at is not null;
  if target is null then raise exception 'Register and verify this email first'; end if;
  update public.profiles set role='admin',is_owner=true,version=version+1 where id=target;
  if not found then raise exception 'Profile missing'; end if;
end $$;
