begin;
-- Store catalog records no longer depend on a supplier account.
alter table public.public_offers alter column owner_id drop not null;
create table public.supply_sources (
 id text primary key,
 owner_id uuid not null references public.profiles(id),
 data jsonb not null,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint supply_source_status check (data->>'status' in ('pending','approved','rejected'))
);
alter table public.supply_sources enable row level security;
revoke all on public.supply_sources from public, anon, authenticated;
grant select,insert,update,delete on public.supply_sources to service_role;
create index supply_sources_owner on public.supply_sources(owner_id);
create index supply_sources_product on public.supply_sources((data->>'productId'));
create unique index supply_sources_one_per_supplier on public.supply_sources(owner_id,(data->>'productId')) where data->>'productId' is not null;

-- Preserve the original supply terms separately from catalog sale prices.
insert into public.supply_sources(id,owner_id,data)
select gen_random_uuid()::text,p.owner_id,jsonb_build_object(
 'productId',case when p.data->>'status'='published' then p.id else null end,
 'legacyProductId',p.id,
 'status',case when p.data->>'status'='published' then 'approved' else 'pending' end,
 'proposal',p.data - 'translation' - 'moderationHistory',
 'terms',jsonb_build_object('unitPrice',coalesce(nullif(p.data->>'unitPrice','')::numeric,0),
 'currency',coalesce(p.data->>'currency','SAR'),'moq',coalesce(nullif(p.data->>'moq','')::numeric,1),
 'stock',coalesce(nullif(p.data->>'stock','')::numeric,0),'leadTime',coalesce(nullif(p.data->>'leadTime','')::numeric,1),
 'country',coalesce(p.data->>'country','')), 'migratedAt',now())
from public.public_offers p join public.profiles a on a.id=p.owner_id and a.role='supplier'
where p.data->>'deletedAt' is null;

-- Preserve explicitly/in-progress assigned legacy orders before removing catalog owners.
-- New v2 stage-zero orders remain exclusively with administration until assignment.
update public.interests i set data=i.data||jsonb_build_object(
 'assignedSupplierId',coalesce(nullif(i.data->>'assignedSupplierId',''),p.owner_id::text),
 'requiresAssignment',true,
 'supplyTerms',s.data->'terms','supplySourceId',s.id)
from public.public_offers p,public.supply_sources s
where p.id=i.offer_id and s.data->>'legacyProductId'=p.id
 and s.owner_id::text=coalesce(nullif(i.data->>'assignedSupplierId',''),p.owner_id::text)
 and (i.data->>'assignedSupplierId' is not null or coalesce(i.data->>'orderStage','0')::integer>0
 or (i.data->>'orderFlowVersion' is distinct from '2' and coalesce(i.data->>'trackingStatus','received')<>'received'));

update public.requests set data=data||'{"requiresAssignment":true}'::jsonb,version=version+1 where data->>'orderFlowVersion'='2';
update public.interests set data=data||'{"requiresAssignment":true}'::jsonb,version=version+1;

update public.public_offers set owner_id=null,data=data||jsonb_build_object('storeOwned',true,
 'status',case when data->>'status'='published' then 'published' else 'source_review' end),version=version+1
where owner_id is not null and data->>'deletedAt' is null;
create or replace function public.commit_changes(actor uuid, changes jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare c jsonb; t text; old jsonb; newdata jsonb; oldversion integer; rec_id text; parent text; a public.profiles;
begin
 select * into a from public.profiles where id=actor for share;
 if a.id is null or a.blocked_at is not null or a.deleted_at is not null then raise exception 'Account unavailable'; end if;
 if jsonb_array_length(changes)>20 then raise exception 'Too many changes'; end if;
 for c in select value from jsonb_array_elements(changes) loop
 t:=c->>'table'; rec_id:=c->>'id';
 if not t=any(array['requests','quotes','public_offers','interests','settings','profiles','supply_sources']) then raise exception 'Invalid table'; end if;
 execute format('select data,version from public.%I where id::text=$1 for update',t) into old,oldversion using rec_id;
 if coalesce(oldversion,0)<>(c->>'version')::integer then raise exception 'Conflict'; end if;
 newdata:=c->'data';
 if t='public_offers' and newdata->>'status'='published' and coalesce(newdata->>'sku','')<>''
    and (oldversion is null or old->>'sku' is distinct from newdata->>'sku' or old->>'status' is distinct from 'published') then
   perform pg_advisory_xact_lock(hashtextextended(lower(newdata->>'sku'),0));
   if exists(select 1 from public.public_offers p where p.id<>rec_id and lower(p.data->>'sku')=lower(newdata->>'sku') and p.data->>'status'='published' and p.data->>'deletedAt' is null) then
     raise exception 'Conflict: product SKU already exists; link the source to the existing product';
   end if;
 end if;
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
create or replace function public.notify_supplier_order_events() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  supplier uuid;
  old_selected text;
  new_selected text;
  old_payment text;
  new_payment text;
  old_assigned text;
  new_assigned text;
  old_tracking text;
  new_tracking text;
begin
  if tg_table_name='requests' then
    old_selected:=coalesce(old.data->>'selectedQuoteId','');
    new_selected:=coalesce(new.data->>'selectedQuoteId','');
    old_payment:=coalesce(old.data->>'paymentStatus','');
    new_payment:=coalesce(new.data->>'paymentStatus','');

    if coalesce(old.data->>'status','')='sent' and coalesce(new.data->>'status','')='sent'
       and coalesce(old.data->'supplierIds','[]'::jsonb) is distinct from coalesce(new.data->'supplierIds','[]'::jsonb) then
      insert into public.notifications(user_id,entity_id,event)
      select value::uuid,new.id,'invited'
      from jsonb_array_elements_text(coalesce(new.data->'supplierIds','[]'::jsonb))
      where not coalesce(old.data->'supplierIds','[]'::jsonb) ? value;
    end if;

    if new_selected<>'' and new_selected<>old_selected then
      select coalesce(nullif(data->>'assignedSupplierId','')::uuid,owner_id) into supplier from public.quotes where id=new_selected and request_id=new.id;
      if supplier is not null then
        insert into public.notifications(user_id,entity_id,event)
        values(supplier,new.id,'supplier_selected');
      end if;
    end if;

    if new_payment='confirmed' and old_payment<>'confirmed' and coalesce(new.data->>'orderType','')<>'cart' then
      select coalesce(nullif(data->>'assignedSupplierId','')::uuid,owner_id) into supplier from public.quotes where id=new.data->>'selectedQuoteId' and request_id=new.id;
      if supplier is not null then
        insert into public.notifications(user_id,entity_id,event)
        values(supplier,new.id,'supplier_payment_confirmed_request');
      end if;
    end if;

  elsif tg_table_name='interests' then
    old_assigned:=coalesce(old.data->>'assignedSupplierId','');
    new_assigned:=coalesce(new.data->>'assignedSupplierId','');
    old_payment:=coalesce(old.data->>'paymentStatus','');
    new_payment:=coalesce(new.data->>'paymentStatus','');
    old_tracking:=coalesce(old.data->>'trackingStatus','received');
    new_tracking:=coalesce(new.data->>'trackingStatus','received');

    if (new_assigned<>'' and new_assigned<>old_assigned)
       or (new_tracking='supplier_confirmation' and old_tracking<>'supplier_confirmation') then
      supplier:=null;
      if new_assigned<>'' then
        supplier:=new_assigned::uuid;
      else
        select owner_id into supplier from public.public_offers where id=new.offer_id;
      end if;
      if supplier is not null then
        insert into public.notifications(user_id,entity_id,event)
        values(supplier,new.id,'supplier_assigned');
      end if;
    end if;

    if new_payment='confirmed' and old_payment<>'confirmed' then
      supplier:=null;
      if new_assigned<>'' then
        supplier:=new_assigned::uuid;
      else
        select owner_id into supplier from public.public_offers where id=new.offer_id;
      end if;
      if supplier is not null then
        insert into public.notifications(user_id,entity_id,event)
        values(supplier,new.id,'supplier_payment_confirmed_interest');
      end if;
    end if;
  end if;
  return new;
end; $$;

revoke all on function public.notify_supplier_order_events() from public,anon,authenticated;
grant execute on function public.notify_supplier_order_events() to service_role;


commit;
