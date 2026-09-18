begin;

create index if not exists interests_tracking_status on public.interests ((data->>'trackingStatus'));

with mapped as (
  select id,
         coalesce(data->>'updatedAt',updated_at::text,created_at::text) as tracked_at,
         case
           when data->>'status'='completed' then 'completed'
           when data->>'status'='cancelled' then 'cancelled'
           when data->>'status' in ('coordinating','accepted') then 'payment_confirmation'
           else 'received'
         end as tracking_status
  from public.interests
  where data->>'trackingStatus' is null
)
update public.interests i
set data = i.data
  || jsonb_build_object(
       'trackingStatus',m.tracking_status,
       'trackingUpdatedAt',m.tracked_at,
       'trackingNote',coalesce(i.data->>'trackingNote',''),
       'trackingHistory',coalesce(i.data->'trackingHistory',jsonb_build_array(jsonb_build_object('at',m.tracked_at,'status',m.tracking_status,'note',''))),
       'status',case when m.tracking_status='completed' then 'completed' when m.tracking_status='cancelled' then 'cancelled' else 'active' end
     )
from mapped m
where i.id=m.id;

update public.interests
set data=jsonb_set(data,'{status}',to_jsonb(case when data->>'trackingStatus'='completed' then 'completed' when data->>'trackingStatus'='cancelled' then 'cancelled' else 'active' end),true)
where data->>'status' in ('pending','coordinating','accepted');

commit;
