begin;

-- Store products default to unlimited inventory.
-- Supplier supply quantities remain tracked separately in supply_sources.
update public.public_offers
set data=jsonb_set(data,'{stockUnlimited}','true'::jsonb,true),
    version=version+1,
    updated_at=now()
where data->>'deletedAt' is null
  and not (data ? 'stockUnlimited');

commit;
