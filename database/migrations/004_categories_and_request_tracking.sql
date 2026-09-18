begin;

create index if not exists requests_tracking_status on public.requests ((data->>'trackingStatus'));
create index if not exists public_offers_category on public.public_offers ((data->>'categoryId'));

with mapped as (
  select r.id,
         coalesce(r.data->>'updatedAt',r.updated_at::text) as tracked_at,
         case
           when r.data->>'status'='completed' then 'completed'
           when coalesce(r.data->>'selectedQuoteId','')<>'' then 'quote_selected'
           when exists (
             select 1 from public.quotes q
             where q.request_id=r.id
               and q.data->>'status'='published'
               and q.data->>'deletedAt' is null
           ) then 'quotes_available'
           when r.data->>'status'='sent' then 'sourcing'
           when r.data->>'status'='review' then 'reviewing'
           else 'received'
         end as tracking_status
  from public.requests r
  where r.data->>'trackingStatus' is null
)
update public.requests r
set data = r.data || jsonb_build_object(
  'trackingStatus',m.tracking_status,
  'trackingUpdatedAt',m.tracked_at,
  'trackingNote',coalesce(r.data->>'trackingNote',''),
  'trackingHistory',coalesce(r.data->'trackingHistory',jsonb_build_array(jsonb_build_object('at',m.tracked_at,'status',m.tracking_status,'note','')))
)
from mapped m
where r.id=m.id;

commit;
