begin;

create or replace function public.enqueue_push_notification() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.push_devices d where d.user_id=new.user_id and d.active) then
    insert into public.push_outbox(notification_id,user_id)
    values(new.id,new.user_id)
    on conflict(notification_id) do nothing;
  end if;
  return new;
end; $$;

update public.push_outbox o
set status='cancelled',updated_at=now(),last_error='No active push device'
where o.status='pending'
  and not exists(
    select 1 from public.push_devices d
    where d.user_id=o.user_id and d.active
  );

commit;
