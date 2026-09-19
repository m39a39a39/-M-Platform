begin;

-- Allow a customer to intentionally place another order from the same public offer.
-- The API still blocks accidental duplicates unless repeatedFromInterestId is supplied.
alter table public.interests
  drop constraint if exists interests_owner_id_offer_id_key;

create index if not exists interests_owner_offer
  on public.interests(owner_id,offer_id,created_at desc);

commit;
