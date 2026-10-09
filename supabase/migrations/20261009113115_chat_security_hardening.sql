begin;

-- All chat instances share one atomic, bounded counter per identity and scope.
create table public.chat_rate_limits (
  key text primary key check (length(key) between 1 and 100),
  requests integer not null check (requests > 0),
  expires_at timestamptz not null
);
create index chat_rate_limits_expiry on public.chat_rate_limits(expires_at);
alter table public.chat_rate_limits enable row level security;
revoke all on public.chat_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.chat_rate_limits to service_role;

create function public.consume_chat_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cutoff timestamptz := clock_timestamp();
  deadline timestamptz;
begin
  if p_key is null or length(p_key) not between 1 and 100
    or p_limit is null or p_limit not between 1 and 1000
    or p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'Invalid rate limit arguments';
  end if;

  -- Opportunistic bounded cleanup; expired identities cannot grow indefinitely.
  if pg_try_advisory_xact_lock(174832, 1) then
  delete from public.chat_rate_limits where key in (
    select key from public.chat_rate_limits
    where expires_at <= cutoff and key <> p_key
    order by expires_at limit 100 for update skip locked
  );
  end if;

  insert into public.chat_rate_limits as counter(key, requests, expires_at)
  values (p_key, 1, cutoff + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    requests = case when counter.expires_at <= cutoff then 1 else counter.requests + 1 end,
    expires_at = case when counter.expires_at <= cutoff
      then cutoff + make_interval(secs => p_window_seconds) else counter.expires_at end
  where counter.expires_at <= cutoff or counter.requests < p_limit
  returning expires_at into deadline;

  if found then return jsonb_build_object('allowed', true, 'retry_after', 0); end if;
  select expires_at into deadline from public.chat_rate_limits where key = p_key;
  return jsonb_build_object('allowed', false, 'retry_after',
    greatest(1, ceil(extract(epoch from (deadline - cutoff)))::integer));
end;
$$;
revoke all on function public.consume_chat_rate_limit(text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_chat_rate_limit(text,integer,integer) to service_role;

-- Harden installations with these optional legacy/import triggers and tables.
-- Trigger execution itself does not require public direct-execution grants.
do $$
begin
  if to_regprocedure('public.filter_cart_quote_notifications()') is not null then
    revoke execute on function public.filter_cart_quote_notifications() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.notify_cart_replacement_approval()') is not null then
    revoke execute on function public.notify_cart_replacement_approval() from public, anon, authenticated;
  end if;
  if to_regprocedure('public.default_unlimited_store_inventory()') is not null then
    alter function public.default_unlimited_store_inventory() set search_path = '';
  end if;
  if to_regclass('public.admin_image_import_jobs') is not null then
    revoke all on table public.admin_image_import_jobs from public, anon, authenticated;
  end if;
end;
$$;

commit;
