begin;

update storage.buckets
set file_size_limit=5242880,
    allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf']
where id='m-private';

create or replace function public.notify_payment_events() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  kind text;
  old_payment text;
  new_payment text;
  old_tracking text;
  new_tracking text;
begin
  kind := case when tg_table_name='requests' then 'request' else 'interest' end;
  old_payment := coalesce(old.data->>'paymentStatus','');
  new_payment := coalesce(new.data->>'paymentStatus','');
  old_tracking := coalesce(old.data->>'trackingStatus','');
  new_tracking := coalesce(new.data->>'trackingStatus','');

  if new_tracking='payment_confirmation'
     and old_tracking<>'payment_confirmation'
     and new_payment='awaiting_receipt' then
    insert into public.notifications(user_id,entity_id,event)
    values(new.owner_id,new.id,'payment_required_'||kind);
  end if;

  if new_payment<>old_payment then
    if new_payment='receipt_submitted' then
      insert into public.notifications(user_id,entity_id,event)
      select id,new.id,'payment_receipt_submitted_'||kind
      from public.profiles
      where role='admin' and blocked_at is null and deleted_at is null;
    elsif new_payment='confirmed' then
      insert into public.notifications(user_id,entity_id,event)
      values(new.owner_id,new.id,'payment_confirmed_'||kind);
    elsif new_payment='reupload_requested' then
      insert into public.notifications(user_id,entity_id,event)
      values(new.owner_id,new.id,'payment_reupload_'||kind);
    end if;
  end if;

  return new;
end; $$;

revoke all on function public.notify_payment_events() from public,anon,authenticated;

drop trigger if exists requests_payment_notifications on public.requests;
create trigger requests_payment_notifications
after update of data on public.requests
for each row execute function public.notify_payment_events();

drop trigger if exists interests_payment_notifications on public.interests;
create trigger interests_payment_notifications
after update of data on public.interests
for each row execute function public.notify_payment_events();

commit;
