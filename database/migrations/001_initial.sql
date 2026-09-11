-- Apply once in Supabase SQL Editor, in a NEW project.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id),
 role text not null check(role in ('client','supplier','admin')),
 is_owner boolean not null default false,
 permissions text[] not null default '{}',
 blocked_at timestamptz, deleted_at timestamptz,
 data jsonb not null default '{}', version integer not null default 1,
 check (not is_owner or role='admin')
);
create function public.handle_signup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,role,data) values(new.id,
 case when new.raw_user_meta_data->>'role'='supplier' then 'supplier' else 'client' end,
 jsonb_build_object('name',left(coalesce(new.raw_user_meta_data->>'name',''),200),
 'company',left(coalesce(new.raw_user_meta_data->>'company',''),200),
 'phone',left(coalesce(new.raw_user_meta_data->>'phone',''),200),
 'country',left(coalesce(new.raw_user_meta_data->>'country',''),200),
 'category',left(coalesce(new.raw_user_meta_data->>'category',''),200),
 'email',new.email,'createdAt',now()));
 return new;
end; $$;
create trigger m_signup after insert on auth.users for each row execute function public.handle_signup();

create table public.requests (
 id text primary key, owner_id uuid not null references public.profiles(id),
 data jsonb not null, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.quotes (
 id text primary key, owner_id uuid not null references public.profiles(id),
 request_id text not null references public.requests(id), data jsonb not null,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index quotes_one_active on public.quotes(request_id,owner_id) where data->>'deletedAt' is null;
create table public.public_offers (
 id text primary key, owner_id uuid not null references public.profiles(id), data jsonb not null,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.interests (
 id text primary key, owner_id uuid not null references public.profiles(id),
 offer_id text not null references public.public_offers(id), data jsonb not null,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(owner_id,offer_id)
);
create table public.settings (
 id text primary key default 'site' check(id='site'), data jsonb not null default '{}',version integer not null default 1
);
insert into public.settings(id) values('site');
create table public.media (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id),
 path text not null unique, mime text not null, created_at timestamptz not null default now()
);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid not null references public.profiles(id),
 entity text not null, entity_id text not null, action text not null, reason text,
 before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create table public.notifications (
 id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id),
 entity_id text not null, event text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create index profiles_role on public.profiles(role);
create index requests_owner on public.requests(owner_id,created_at desc);
create index requests_status on public.requests((data->>'status'));
create index requests_suppliers on public.requests using gin ((data->'supplierIds'));
create index quotes_owner on public.quotes(owner_id,created_at desc);
create index quotes_request on public.quotes(request_id);
create index public_offers_owner on public.public_offers(owner_id,created_at desc);
create index public_offers_status on public.public_offers((data->>'status'),created_at desc);
create index interests_owner on public.interests(owner_id);
create index interests_offer on public.interests(offer_id);
create index notifications_user on public.notifications(user_id,created_at desc);
create index audit_entity on public.audit_logs(entity,entity_id,created_at desc);

-- Only our API service role may read/write these tables. Public and authenticated
-- keys cannot bypass the API to discover identities, invitation lists or prices.
do $$ declare t text; begin
 foreach t in array array['profiles','requests','quotes','public_offers','interests','settings','media','audit_logs','notifications'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage,select on all sequences in schema public to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('m-private','m-private',false,1048576,array['image/jpeg','image/png','image/webp']);

-- All writes and audit records in one transaction; optimistic versions prevent
-- two tabs/users silently overwriting each other or choosing two different quotes.
create function public.commit_changes(actor uuid, changes jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare c jsonb; t text; old jsonb; newdata jsonb; oldversion integer; rec_id text; parent text; a public.profiles;
begin
 select * into a from public.profiles where id=actor for share;
 if a.id is null or a.blocked_at is not null or a.deleted_at is not null then raise exception 'Account unavailable'; end if;
 if jsonb_array_length(changes)>20 then raise exception 'Too many changes'; end if;
 for c in select value from jsonb_array_elements(changes) loop
 t:=c->>'table'; rec_id:=c->>'id';
 if not t=any(array['requests','quotes','public_offers','interests','settings','profiles']) then raise exception 'Invalid table'; end if;
 execute format('select data,version from public.%I where id::text=$1 for update',t) into old,oldversion using rec_id;
 if coalesce(oldversion,0)<>(c->>'version')::integer then raise exception 'Conflict'; end if;
 newdata:=c->'data';
 if t='profiles' then
   -- Owner status is not editable through the API. Owner creation is a SQL-only bootstrap.
   if a.role<>'admin' or not(a.is_owner or 'team'=any(a.permissions) or 'moderate'=any(a.permissions) or 'trash'=any(a.permissions)) then raise exception 'Forbidden'; end if;
   if exists(select 1 from public.profiles where id::text=rec_id and is_owner) then raise exception 'Owner protected'; end if;
   update public.profiles set data=newdata,role=coalesce(c->>'role',role),permissions=coalesce(array(select jsonb_array_elements_text(c->'permissions')),permissions),blocked_at=(c->>'blockedAt')::timestamptz,deleted_at=(c->>'deletedAt')::timestamptz,version=version+1 where id::text=rec_id;
 elsif oldversion is not null then
   if t='settings' then
     execute 'update public.settings set data=$1,version=version+1 where id=$2' using newdata,rec_id;
   else
     execute format('update public.%I set data=$1,version=version+1,updated_at=now() where id::text=$2',t) using newdata,rec_id;
   end if;
 else
   if t in ('settings','profiles') then raise exception 'Missing record'; end if;
   if t='quotes' then
     execute 'insert into public.quotes(id,owner_id,request_id,data) values($1,$2,$3,$4)' using rec_id,(c->>'ownerId')::uuid,c->>'requestId',newdata;
   elsif t='interests' then
     execute 'insert into public.interests(id,owner_id,offer_id,data) values($1,$2,$3,$4)' using rec_id,(c->>'ownerId')::uuid,c->>'offerId',newdata;
   else
     execute format('insert into public.%I(id,owner_id,data) values($1,$2,$3)',t) using rec_id,(c->>'ownerId')::uuid,newdata;
   end if;
 end if;
 insert into public.audit_logs(actor_id,entity,entity_id,action,reason,before_data,after_data)
 values(actor,t,rec_id,coalesce(c->>'action','update'),c->>'reason',old,newdata);
 if t='requests' and newdata->>'status'='sent' and coalesce(old->>'status','')<>'sent' then
   insert into public.notifications(user_id,entity_id,event) select value::uuid,rec_id,'invited' from jsonb_array_elements_text(newdata->'supplierIds');
 elsif t='quotes' and newdata->>'status'='published' and coalesce(old->>'status','')<>'published' then
   insert into public.notifications(user_id,entity_id,event) select owner_id,rec_id,'quote_published' from public.requests where id=c->>'requestId';
 end if;
 end loop;
end; $$;
revoke all on function public.commit_changes(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.commit_changes(uuid,jsonb) to service_role;
revoke all on function public.handle_signup() from public,anon,authenticated;
commit;
