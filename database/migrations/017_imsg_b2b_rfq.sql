-- IMSG B2B RFQ storage. Additive migration: preserves historical storefront orders and pricing.
create sequence if not exists public.imsg_rfq_number_seq start with 10001 increment by 1;

create table if not exists public.imsg_rfq_customers (
  id uuid primary key default gen_random_uuid(),
  whatsapp text not null unique check (whatsapp ~ '^\\+[1-9][0-9]{7,14}$'),
  name text not null,
  country text not null,
  company text not null default '',
  notes text not null default '',
  first_request_at timestamptz not null default now(),
  last_request_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.imsg_rfq_requests (
  id uuid primary key default gen_random_uuid(),
  number bigint not null default nextval('public.imsg_rfq_number_seq') unique,
  customer_id uuid not null references public.imsg_rfq_customers(id),
  source text not null check (source in ('website','admin')),
  status text not null default 'new' check (status in ('new','contacted','agreed','closed')),
  notes text not null default '',
  internal_notes text not null default '',
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  idempotency_key uuid unique,
  version integer not null default 1,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists imsg_rfq_requests_created_idx on public.imsg_rfq_requests(created_at desc);
create index if not exists imsg_rfq_requests_customer_idx on public.imsg_rfq_requests(customer_id,created_at desc);
create table if not exists public.imsg_rfq_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.imsg_rfq_requests(id) on delete cascade,
  offer_id text not null references public.public_offers(id),
  quantity bigint not null check (quantity > 0 and quantity <= 1000000000),
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(request_id,offer_id)
);
create table if not exists public.imsg_rfq_audit (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.imsg_rfq_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  action text not null check(action in ('created','updated')),
  before_data jsonb,
  after_data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists imsg_rfq_audit_request_idx on public.imsg_rfq_audit(request_id,created_at desc);
create table if not exists public.imsg_rfq_rate_limits (
  origin_hash text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.imsg_rfq_customers enable row level security;
alter table public.imsg_rfq_requests enable row level security;
alter table public.imsg_rfq_items enable row level security;
alter table public.imsg_rfq_audit enable row level security;
alter table public.imsg_rfq_rate_limits enable row level security;
revoke all on table public.imsg_rfq_customers,public.imsg_rfq_requests,public.imsg_rfq_items,public.imsg_rfq_audit,public.imsg_rfq_rate_limits from public,anon,authenticated;
revoke all on sequence public.imsg_rfq_number_seq from public,anon,authenticated;
grant select,insert,update,delete on table public.imsg_rfq_customers,public.imsg_rfq_requests,public.imsg_rfq_items,public.imsg_rfq_audit,public.imsg_rfq_rate_limits to service_role;
grant usage,select on sequence public.imsg_rfq_number_seq to service_role;
grant usage,select on sequence public.imsg_rfq_audit_id_seq to service_role;

-- Called by the server only. A single Postgres transaction saves the customer, request,
-- products and audit record. Failed validations roll back the entire request.
create or replace function public.imsg_rfq_save(p_payload jsonb, p_actor uuid default null, p_remote_hash text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_customer jsonb := p_payload->'customer';
  v_items jsonb := p_payload->'items';
  v_phone text := trim(coalesce(v_customer->>'whatsapp',''));
  v_name text := trim(coalesce(v_customer->>'name',''));
  v_country text := trim(coalesce(v_customer->>'country',''));
  v_company text := trim(coalesce(v_customer->>'company',''));
  v_source text := coalesce(p_payload->>'source','website');
  v_status text := coalesce(p_payload->>'status','new');
  v_request_id uuid;
  v_existing public.imsg_rfq_requests%rowtype;
  v_customer_id uuid;
  v_customer_row public.imsg_rfq_customers%rowtype;
  v_offer public.public_offers%rowtype;
  v_line jsonb;
  v_quantity bigint;
  v_offer_id text;
  v_before jsonb;
  v_after jsonb;
  v_snapshot jsonb;
  v_idem uuid;
  v_count integer;
  v_version integer := nullif(p_payload->>'expectedVersion','')::integer;
begin
  if v_name = '' or length(v_name)>140 or v_country='' or length(v_country)>120
     or v_phone !~ '^\\+[1-9][0-9]{7,14}$' or length(v_company)>200
     or length(coalesce(p_payload->>'notes',''))>2000
     or length(coalesce(p_payload->>'internalNotes',''))>4000 then
    raise exception 'Invalid customer or note data' using errcode='22023';
  end if;
  if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>100 then
    raise exception 'Invalid RFQ product list' using errcode='22023';
  end if;
  if v_source not in ('website','admin') or v_status not in ('new','contacted','agreed','closed') then
    raise exception 'Invalid RFQ status/source' using errcode='22023';
  end if;
  if v_source='admin' and p_actor is null then raise exception 'Admin identity required' using errcode='42501'; end if;
  if v_source='website' and p_actor is not null then raise exception 'Unexpected actor' using errcode='22023'; end if;
  if p_payload ? 'idempotencyKey' and coalesce(p_payload->>'idempotencyKey','')<>'' then
    v_idem := (p_payload->>'idempotencyKey')::uuid;
    select id into v_request_id from public.imsg_rfq_requests where idempotency_key=v_idem;
    if found then
      select number into v_count from public.imsg_rfq_requests where id=v_request_id;
      return jsonb_build_object('id',v_request_id,'number','RFQ-'||v_count,'duplicate',true);
    end if;
    v_request_id := null;
  end if;
  if nullif(p_payload->>'requestId','') is not null then
    if p_actor is null or v_source<>'admin' then raise exception 'Admin editing required' using errcode='42501'; end if;
    v_request_id:=(p_payload->>'requestId')::uuid;
    select * into v_existing from public.imsg_rfq_requests where id=v_request_id for update;
    if not found then raise exception 'RFQ not found' using errcode='P0002'; end if;
    if v_version is null or v_version<>v_existing.version then raise exception 'RFQ was modified elsewhere' using errcode='40001'; end if;
    v_before := jsonb_build_object('customerId',v_existing.customer_id,'status',v_existing.status,'notes',v_existing.notes,'internalNotes',v_existing.internal_notes,
      'items',(select coalesce(jsonb_agg(jsonb_build_object('offerId',offer_id,'quantity',quantity) order by offer_id),'[]'::jsonb)
               from public.imsg_rfq_items where request_id=v_request_id));
    v_source:=v_existing.source;
  elsif v_source='website' and p_remote_hash is not null then
    insert into public.imsg_rfq_rate_limits(origin_hash,window_start,attempts)
      values (p_remote_hash,now(),1)
      on conflict (origin_hash) do update
        set window_start=case when imsg_rfq_rate_limits.window_start<now()-interval '1 hour' then now() else imsg_rfq_rate_limits.window_start end,
            attempts=case when imsg_rfq_rate_limits.window_start<now()-interval '1 hour' then 1 else imsg_rfq_rate_limits.attempts+1 end
      returning attempts into v_count;
    if v_count>8 then raise exception 'Too many requests' using errcode='P0001'; end if;
  end if;
  select * into v_customer_row from public.imsg_rfq_customers where whatsapp=v_phone for update;
  if found then
    v_customer_id:=v_customer_row.id;
    update public.imsg_rfq_customers set name=v_name,country=v_country,company=v_company,
      notes=case when v_source='admin' then coalesce(v_customer->>'notes','') else notes end,
      last_request_at=case when v_request_id is null then now() else last_request_at end,updated_at=now()
      where id=v_customer_id;
  else
    insert into public.imsg_rfq_customers(whatsapp,name,country,company,notes)
    values(v_phone,v_name,v_country,v_company,case when v_source='admin' then coalesce(v_customer->>'notes','') else '' end)
    returning id into v_customer_id;
  end if;
  if v_request_id is null then
    insert into public.imsg_rfq_requests(customer_id,source,status,notes,internal_notes,created_by,updated_by,idempotency_key)
    values(v_customer_id,v_source,v_status,coalesce(p_payload->>'notes',''),coalesce(p_payload->>'internalNotes',''),
      p_actor,p_actor,v_idem) returning id into v_request_id;
  else
    update public.imsg_rfq_requests set customer_id=v_customer_id,status=v_status,notes=coalesce(p_payload->>'notes',''),
      internal_notes=coalesce(p_payload->>'internalNotes',''),updated_by=p_actor,updated_at=now(),version=version+1,
      status_changed_at=case when status is distinct from v_status then now() else status_changed_at end
      where id=v_request_id;
    delete from public.imsg_rfq_items where request_id=v_request_id;
  end if;
  for v_line in select value from jsonb_array_elements(v_items) loop
    v_offer_id:=trim(coalesce(v_line->>'offerId',''));
    if v_offer_id='' or length(v_offer_id)>100 or (v_line->>'quantity') !~ '^[0-9]{1,10}$' then
      raise exception 'Invalid RFQ product' using errcode='22023';
    end if;
    v_quantity:=(v_line->>'quantity')::bigint;
    select * into v_offer from public.public_offers where id=v_offer_id;
    if not found or v_offer.data->>'status'<>'published' or (v_offer.data ? 'deletedAt' and v_offer.data->>'deletedAt' is not null) then
      raise exception 'Unavailable product' using errcode='22023';
    end if;
    if v_quantity<greatest(1,ceil(coalesce(nullif(v_offer.data->>'moq','')::numeric,1))::bigint) or v_quantity>1000000000 then
      raise exception 'Quantity below MOQ or above limit' using errcode='22023';
    end if;
    v_snapshot:=jsonb_build_object('sku',coalesce(v_offer.data->>'sku',''),
      'model',coalesce(v_offer.data->>'sku',''),'product',coalesce(v_offer.data->>'product',''),
      'translation',coalesce(v_offer.data->'translation','{}'::jsonb),
      'image',coalesce(v_offer.data->'images'->>0,''));
    insert into public.imsg_rfq_items(request_id,offer_id,quantity,snapshot)
      values(v_request_id,v_offer_id,v_quantity,v_snapshot);
  end loop;
  select jsonb_build_object('customerId',v_customer_id,'status',r.status,'notes',r.notes,'internalNotes',r.internal_notes,
      'items',(select coalesce(jsonb_agg(jsonb_build_object('offerId',offer_id,'quantity',quantity) order by offer_id),'[]'::jsonb)
               from public.imsg_rfq_items where request_id=v_request_id))
    into v_after from public.imsg_rfq_requests r where r.id=v_request_id;
  insert into public.imsg_rfq_audit(request_id,actor_id,action,before_data,after_data)
    values(v_request_id,p_actor,case when v_before is null then 'created' else 'updated' end,v_before,v_after);
  select number into v_count from public.imsg_rfq_requests where id=v_request_id;
  return jsonb_build_object('id',v_request_id,'number','RFQ-'||v_count,'duplicate',false);
end;
$$;
revoke all on function public.imsg_rfq_save(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.imsg_rfq_save(jsonb,uuid,text) to service_role;
