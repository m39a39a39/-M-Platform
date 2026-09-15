begin;

create table if not exists public.push_devices (
  device_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  token text not null unique,
  app_version text,
  locale text,
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_devices_user on public.push_devices(user_id,active);

create table if not exists public.push_outbox (
  id bigint generated always as identity primary key,
  notification_id bigint not null unique references public.notifications(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_outbox_pending on public.push_outbox(status,next_attempt_at,created_at);
create index if not exists push_outbox_user on public.push_outbox(user_id,created_at desc);

alter table public.push_devices enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_devices from anon,authenticated;
revoke all on public.push_outbox from anon,authenticated;
grant all on public.push_devices to service_role;
grant all on public.push_outbox to service_role;
grant usage,select on all sequences in schema public to service_role;

create or replace function public.register_push_device(
  actor uuid,
  p_device_id text,
  p_platform text,
  p_token text,
  p_app_version text default null,
  p_locale text default null
) returns void
language plpgsql security definer set search_path=public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=actor for share;
  if p.id is null or p.blocked_at is not null or p.deleted_at is not null then raise exception 'Account unavailable'; end if;
  if p_platform not in ('ios','android') then raise exception 'Invalid platform'; end if;
  delete from public.push_devices where token=p_token and device_id<>p_device_id;
  insert into public.push_devices(device_id,user_id,platform,token,app_version,locale,active,last_seen_at,updated_at)
  values(p_device_id,actor,p_platform,p_token,p_app_version,p_locale,true,now(),now())
  on conflict(device_id) do update set
    user_id=excluded.user_id,
    platform=excluded.platform,
    token=excluded.token,
    app_version=excluded.app_version,
    locale=excluded.locale,
    active=true,
    last_seen_at=now(),
    updated_at=now();
end; $$;

create or replace function public.unregister_push_device(actor uuid,p_device_id text) returns void
language plpgsql security definer set search_path=public as $$
begin
  update public.push_devices set active=false,updated_at=now()
  where device_id=p_device_id and user_id=actor;
end; $$;

revoke all on function public.register_push_device(uuid,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.unregister_push_device(uuid,text) from public,anon,authenticated;
grant execute on function public.register_push_device(uuid,text,text,text,text,text) to service_role;
grant execute on function public.unregister_push_device(uuid,text) to service_role;

create or replace function public.enqueue_push_notification() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.push_outbox(notification_id,user_id)
  values(new.id,new.user_id)
  on conflict(notification_id) do nothing;
  return new;
end; $$;

revoke all on function public.enqueue_push_notification() from public,anon,authenticated;
drop trigger if exists notifications_enqueue_push on public.notifications;
create trigger notifications_enqueue_push after insert on public.notifications
for each row execute function public.enqueue_push_notification();

insert into public.push_outbox(notification_id,user_id)
select n.id,n.user_id from public.notifications n
left join public.push_outbox o on o.notification_id=n.id
where o.notification_id is null;

commit;
