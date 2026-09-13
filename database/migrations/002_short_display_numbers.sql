begin;

create sequence if not exists public.request_display_no_seq start with 10001;
create sequence if not exists public.offer_display_no_seq start with 10001;

alter table public.requests add column if not exists display_no bigint;
alter table public.quotes add column if not exists display_no bigint;
alter table public.public_offers add column if not exists display_no bigint;

do $$
declare
  base_no bigint;
begin
  select max(display_no) into base_no from public.requests;
  base_no := coalesce(base_no, 10000);

  with ranked as (
    select id, base_no + row_number() over (order by created_at, id) as next_no
    from public.requests
    where display_no is null
  )
  update public.requests r
  set display_no = ranked.next_no
  from ranked
  where r.id = ranked.id;

  select max(display_no) into base_no from public.requests;
  if base_no is null then
    perform setval('public.request_display_no_seq', 10001, false);
  else
    perform setval('public.request_display_no_seq', greatest(base_no, 10000), true);
  end if;
end $$;

do $$
declare
  base_no bigint;
begin
  select max(display_no) into base_no
  from (
    select display_no from public.quotes
    union all
    select display_no from public.public_offers
  ) offers;
  base_no := coalesce(base_no, 10000);

  with ranked as (
    select id, base_no + row_number() over (order by created_at, id) as next_no
    from public.quotes
    where display_no is null
  )
  update public.quotes q
  set display_no = ranked.next_no
  from ranked
  where q.id = ranked.id;

  select greatest(
    coalesce((select max(display_no) from public.quotes), 10000),
    coalesce((select max(display_no) from public.public_offers), 10000)
  ) into base_no;

  with ranked as (
    select id, base_no + row_number() over (order by created_at, id) as next_no
    from public.public_offers
    where display_no is null
  )
  update public.public_offers o
  set display_no = ranked.next_no
  from ranked
  where o.id = ranked.id;

  select greatest(
    coalesce((select max(display_no) from public.quotes), 10000),
    coalesce((select max(display_no) from public.public_offers), 10000)
  ) into base_no;

  if base_no <= 10000 then
    perform setval('public.offer_display_no_seq', 10001, false);
  else
    perform setval('public.offer_display_no_seq', base_no, true);
  end if;
end $$;

alter table public.requests alter column display_no set default nextval('public.request_display_no_seq');
alter table public.quotes alter column display_no set default nextval('public.offer_display_no_seq');
alter table public.public_offers alter column display_no set default nextval('public.offer_display_no_seq');

alter table public.requests alter column display_no set not null;
alter table public.quotes alter column display_no set not null;
alter table public.public_offers alter column display_no set not null;

create unique index if not exists requests_display_no_unique on public.requests(display_no);
create unique index if not exists quotes_display_no_unique on public.quotes(display_no);
create unique index if not exists public_offers_display_no_unique on public.public_offers(display_no);

grant usage, select on sequence public.request_display_no_seq to service_role;
grant usage, select on sequence public.offer_display_no_seq to service_role;

commit;
