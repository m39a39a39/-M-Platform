begin;

update storage.buckets
set file_size_limit=5242880
where id='m-private';

commit;
