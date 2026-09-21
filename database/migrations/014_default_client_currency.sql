begin;

create or replace function public.handle_signup() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  next_role text;
  profile_data jsonb;
begin
  next_role := case when new.raw_user_meta_data->>'role'='supplier' then 'supplier' else 'client' end;
  profile_data := jsonb_build_object(
    'name',left(coalesce(new.raw_user_meta_data->>'name',''),200),
    'company',left(coalesce(new.raw_user_meta_data->>'company',''),200),
    'phone',left(coalesce(new.raw_user_meta_data->>'phone',''),200),
    'country',left(coalesce(new.raw_user_meta_data->>'country',''),200),
    'category',left(coalesce(new.raw_user_meta_data->>'category',''),200),
    'email',new.email,
    'createdAt',now()
  );
  if next_role='client' then
    profile_data := profile_data || jsonb_build_object('preferredCurrency','SAR');
  end if;
  insert into public.profiles(id,role,data) values(new.id,next_role,profile_data);
  return new;
end; $$;

update public.profiles
set data=jsonb_set(data,'{preferredCurrency}','"SAR"'::jsonb,true)
where role='client'
  and coalesce(data->>'preferredCurrency','')='';

commit;
