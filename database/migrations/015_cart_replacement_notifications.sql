begin;

create or replace function public.filter_cart_quote_notifications() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.event='quote_published' and exists(
    select 1
    from public.quotes q
    join public.requests r on r.id=q.request_id
    where q.id=new.entity_id
      and r.data->>'orderType'='cart'
  ) then
    return null;
  end if;
  return new;
end; $$;

drop trigger if exists notifications_filter_cart_quote on public.notifications;
create trigger notifications_filter_cart_quote
before insert on public.notifications
for each row execute function public.filter_cart_quote_notifications();

create or replace function public.notify_cart_replacement_approval() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.data->>'orderType'='cart'
     and new.data->'pendingCartReplacement' is distinct from old.data->'pendingCartReplacement'
     and new.data ? 'pendingCartReplacement'
     and jsonb_typeof(new.data->'pendingCartReplacement')='object' then
    insert into public.notifications(user_id,entity_id,event)
    values(new.owner_id,new.id,'cart_replacement_approval');
  end if;
  return new;
end; $$;

drop trigger if exists requests_notify_cart_replacement_approval on public.requests;
create trigger requests_notify_cart_replacement_approval
after update on public.requests
for each row execute function public.notify_cart_replacement_approval();

commit;
