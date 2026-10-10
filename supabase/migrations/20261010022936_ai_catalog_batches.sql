begin;
create table public.ai_catalog_batches (
 id uuid primary key,
 owner_id uuid not null references public.profiles(id),
 status text not null default 'draft' check(status in ('draft','submitting','queued','completed','failed')),
 provider_id text, input_file_id text,
 items jsonb not null default '[]',
 error text not null default '',
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index ai_catalog_batches_owner_created on public.ai_catalog_batches(owner_id,created_at desc);
alter table public.ai_catalog_batches enable row level security;
revoke all on public.ai_catalog_batches from public,anon,authenticated;
grant select,insert,update,delete on public.ai_catalog_batches to service_role;

create function public.apply_ai_catalog_batch(p_id uuid,p_actor uuid,p_version integer,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare job public.ai_catalog_batches; actor public.profiles; item jsonb; product public.public_offers;
 updated_items jsonb:='[]'; next_data jsonb; before_data jsonb; changed integer:=0; conflicts integer:=0;
 k text; target jsonb;
begin
 select * into actor from public.profiles where id=p_actor for share;
 if actor.id is null or actor.role<>'admin' or actor.blocked_at is not null or actor.deleted_at is not null
 or not(actor.is_owner or array['settings','offers.edit','translate','publish'] <@ actor.permissions) then raise exception 'Forbidden';end if;
 if p_action not in ('apply','revert') then raise exception 'Invalid action';end if;
 select * into job from public.ai_catalog_batches where id=p_id for update;
 if job.id is null or (job.owner_id<>p_actor and not actor.is_owner) then raise exception 'Forbidden';end if;
 if job.version<>p_version then raise exception 'Conflict';end if;
 if job.status<>'completed' then raise exception 'Batch not complete';end if;
 -- A consistent order prevents deadlocks between different batches on the same products.
 for item in select value from jsonb_array_elements(job.items) order by value->>'id' loop
  if (p_action='apply' and item->>'status'='ready') or (p_action='revert' and item->>'status'='applied') then
   select * into product from public.public_offers where id=item->>'id' for update;
   if product.id is null or product.data->>'deletedAt' is not null or
      product.version<>(case when p_action='apply' then (item->>'version')::integer else (item->>'appliedVersion')::integer end) then
    item:=item||jsonb_build_object('status',case when p_action='apply' then 'conflict' else 'revert_conflict' end);
    conflicts:=conflicts+1;
   else
    before_data:=product.data;
    next_data:=product.data;
    if p_action='apply' then
     target:=item->'proposal';
     if coalesce(target->>'titleAr','')='' or coalesce(target->>'titleEn','')='' or coalesce(target->>'descriptionAr','')='' or coalesce(target->>'descriptionEn','')='' then raise exception 'Invalid proposal';end if;
     next_data:=next_data||jsonb_build_object('product',target->>'titleAr','specs',target->>'descriptionAr','shortDescription',target->>'shortDescription',
      'translation',coalesce(next_data->'translation','{}')||jsonb_build_object('titleAr',target->>'titleAr','titleEn',target->>'titleEn','descriptionAr',target->>'descriptionAr','descriptionEn',target->>'descriptionEn'));
     item:=item||jsonb_build_object('status','applied','appliedVersion',product.version+1,'before',before_data);
    else
     -- Restore only fields changed by this feature; never prices, inventory or fulfillment.
     foreach k in array array['product','specs','shortDescription','translation'] loop
      if item->'before' ? k then next_data:=jsonb_set(next_data,array[k],item->'before'->k,true);else next_data:=next_data-k;end if;
     end loop;
     item:=item||jsonb_build_object('status','reverted');
    end if;
    next_data:=next_data||jsonb_build_object('updatedAt',now());
    update public.public_offers set data=next_data,version=version+1,updated_at=now() where id=product.id;
    insert into public.audit_logs(actor_id,entity,entity_id,action,reason,before_data,after_data)
     values(p_actor,'public_offers',product.id,'ai_copy_'||p_action,'AI batch '||p_id,before_data,next_data);
    changed:=changed+1;
   end if;
  end if;
  updated_items:=updated_items||jsonb_build_array(item);
 end loop;
 update public.ai_catalog_batches set items=updated_items,version=version+1,updated_at=now() where id=p_id;
 return jsonb_build_object('changed',changed,'conflicts',conflicts);
end;$$;
revoke all on function public.apply_ai_catalog_batch(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.apply_ai_catalog_batch(uuid,uuid,integer,text) to service_role;
commit;
