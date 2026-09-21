begin;

create or replace function public.notify_supplier_order_events() returns trigger
language plpgsql security definer set search_path=public as $$
declare supplier uuid; old_selected text; new_selected text; old_payment text; new_payment text; old_assigned text; new_assigned text;
begin
  if tg_table_name='requests' then
    old_selected:=coalesce(old.data->>'selectedQuoteId',''); new_selected:=coalesce(new.data->>'selectedQuoteId','');
    old_payment:=coalesce(old.data->>'paymentStatus',''); new_payment:=coalesce(new.data->>'paymentStatus','');
    if new_selected<>'' and new_selected<>old_selected then
      select owner_id into supplier from public.quotes where id=new_selected and request_id=new.id;
      if supplier is not null then insert into public.notifications(user_id,entity_id,event) values(supplier,new.id,'supplier_selected'); end if;
    end if;
    if new_payment='confirmed' and old_payment<>'confirmed' and coalesce(new.data->>'orderType','')<>'cart' then
      select owner_id into supplier from public.quotes where id=new.data->>'selectedQuoteId' and request_id=new.id;
      if supplier is not null then insert into public.notifications(user_id,entity_id,event) values(supplier,new.id,'supplier_payment_confirmed_request'); end if;
    end if;
  elsif tg_table_name='interests' then
    old_assigned:=coalesce(old.data->>'assignedSupplierId',''); new_assigned:=coalesce(new.data->>'assignedSupplierId','');
    old_payment:=coalesce(old.data->>'paymentStatus',''); new_payment:=coalesce(new.data->>'paymentStatus','');
    if new_assigned<>'' and new_assigned<>old_assigned then
      supplier:=new_assigned::uuid;
      insert into public.notifications(user_id,entity_id,event) values(supplier,new.id,'supplier_assigned');
    end if;
    if new_payment='confirmed' and old_payment<>'confirmed' then
      supplier:=null;
      if new_assigned<>'' then supplier:=new_assigned::uuid; else select owner_id into supplier from public.public_offers where id=new.offer_id; end if;
      if supplier is not null then insert into public.notifications(user_id,entity_id,event) values(supplier,new.id,'supplier_payment_confirmed_interest'); end if;
    end if;
  end if;
  return new;
end; $$;

revoke all on function public.notify_supplier_order_events() from public,anon,authenticated;
grant execute on function public.notify_supplier_order_events() to service_role;
drop trigger if exists requests_notify_supplier_order_events on public.requests;
create trigger requests_notify_supplier_order_events after update on public.requests for each row execute function public.notify_supplier_order_events();
drop trigger if exists interests_notify_supplier_order_events on public.interests;
create trigger interests_notify_supplier_order_events after update on public.interests for each row execute function public.notify_supplier_order_events();

commit;
