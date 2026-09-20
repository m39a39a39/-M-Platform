begin;

alter table public.interests add column if not exists display_no bigint;
update public.interests
set display_no=nextval('public.request_display_no_seq')
where display_no is null;
alter table public.interests alter column display_no set default nextval('public.request_display_no_seq');
alter table public.interests alter column display_no set not null;
create unique index if not exists interests_display_no_unique on public.interests(display_no);

create sequence if not exists public.proforma_invoice_no_seq start with 10001;
create sequence if not exists public.final_invoice_no_seq start with 10001;

create or replace function public.allocate_invoice_number(invoice_kind text)
returns text
language plpgsql
security definer
set search_path=public
as $$
declare
  n bigint;
  y text:=to_char(now(),'YYYY');
begin
  if invoice_kind='proforma' then
    n:=nextval('public.proforma_invoice_no_seq');
    return format('PI-%s-%s',y,n);
  elsif invoice_kind='final' then
    n:=nextval('public.final_invoice_no_seq');
    return format('INV-%s-%s',y,n);
  end if;
  raise exception 'Invalid invoice kind';
end;
$$;

revoke all on function public.allocate_invoice_number(text) from public,anon,authenticated;
grant execute on function public.allocate_invoice_number(text) to service_role;
grant usage,select on sequence public.proforma_invoice_no_seq to service_role;
grant usage,select on sequence public.final_invoice_no_seq to service_role;

commit;
