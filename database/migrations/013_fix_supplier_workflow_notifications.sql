begin;

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
      select owner_id into supplier from public.quotes where id=new_selected and request_id=new.id;
      if supplier is not null then
        insert into public.notifications(user_id,entity_id,event)
        values(supplier,new.id,'supplier_selected');
      end if;
    end if;

    if new_payment='confirmed' and old_payment<>'confirmed' and coalesce(new.data->>'orderType','')<>'cart' then
      select owner_id into supplier from public.quotes where id=new.data->>'selectedQuoteId' and request_id=new.id;
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

-- Restore declined orders to the supplier-confirmation workflow instead of "on hold".
update public.requests r
set data=jsonb_set(
  jsonb_set(r.data,'{trackingStatus}','"supplier_confirmation"'::jsonb,true),
  '{trackingUpdatedAt}',to_jsonb(now()::text),true
)
where r.data->>'trackingStatus'='on_hold'
  and coalesce(r.data->>'orderType','')<>'cart'
  and exists(
    select 1 from public.quotes q
    where q.id=r.data->>'selectedQuoteId'
      and q.data->>'supplierOrderStatus'='cannot_fulfill'
  );

update public.interests i
set data=jsonb_set(
  jsonb_set(i.data,'{trackingStatus}','"supplier_confirmation"'::jsonb,true),
  '{trackingUpdatedAt}',to_jsonb(now()::text),true
)
where i.data->>'trackingStatus'='on_hold'
  and i.data->>'supplierOrderStatus'='cannot_fulfill';

update public.requests r
set data=jsonb_set(
  jsonb_set(r.data,'{trackingStatus}','"supplier_confirmation"'::jsonb,true),
  '{trackingUpdatedAt}',to_jsonb(now()::text),true
)
where r.data->>'trackingStatus'='on_hold'
  and r.data->>'orderType'='cart'
  and exists(
    select 1 from public.interests i
    where i.data->>'cartOrderId'=r.id
      and i.data->>'supplierOrderStatus'='cannot_fulfill'
  );

-- Backfill actionable supplier notifications so current orders are visible immediately.
insert into public.notifications(user_id,entity_id,event)
select q.owner_id,r.id,'supplier_selected'
from public.requests r
join public.quotes q on q.id=r.data->>'selectedQuoteId'
where q.data->>'supplierOrderStatus' in ('pending_confirmation','confirmed')
  and coalesce(r.data->>'deletedAt','')=''
  and not exists(
    select 1 from public.notifications n
    where n.user_id=q.owner_id and n.entity_id=r.id and n.event='supplier_selected'
  );

insert into public.notifications(user_id,entity_id,event)
select coalesce((i.data->>'assignedSupplierId')::uuid,o.owner_id),i.id,'supplier_assigned'
from public.interests i
join public.public_offers o on o.id=i.offer_id
where coalesce(i.data->>'trackingStatus','received')='supplier_confirmation'
  and coalesce(i.data->>'supplierOrderStatus','pending_confirmation')='pending_confirmation'
  and not exists(
    select 1 from public.notifications n
    where n.user_id=coalesce((i.data->>'assignedSupplierId')::uuid,o.owner_id)
      and n.entity_id=i.id and n.event='supplier_assigned'
  );

insert into public.notifications(user_id,entity_id,event)
select q.owner_id,r.id,'supplier_payment_confirmed_request'
from public.requests r
join public.quotes q on q.id=r.data->>'selectedQuoteId'
where r.data->>'paymentStatus'='confirmed'
  and coalesce(r.data->>'orderType','')<>'cart'
  and not exists(
    select 1 from public.notifications n
    where n.user_id=q.owner_id and n.entity_id=r.id and n.event='supplier_payment_confirmed_request'
  );

insert into public.notifications(user_id,entity_id,event)
select coalesce((i.data->>'assignedSupplierId')::uuid,o.owner_id),i.id,'supplier_payment_confirmed_interest'
from public.interests i
join public.public_offers o on o.id=i.offer_id
where i.data->>'paymentStatus'='confirmed'
  and not exists(
    select 1 from public.notifications n
    where n.user_id=coalesce((i.data->>'assignedSupplierId')::uuid,o.owner_id)
      and n.entity_id=i.id and n.event='supplier_payment_confirmed_interest'
  );

commit;
