-- Last step of moving to columns. Run it only after migrate-to-columns.sql, the new server has
-- started at least once, and the app works: by then every `data` column is empty and `state` has
-- nothing left the server needs. This check stops with an error if any record is still in `data`.
do $$
declare c record; n bigint;
begin
  for c in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'data'
             and table_name in ('events', 'event_photos', 'registrations', 'logs', 'ocr_scans', 'directory', 'profiles', 'orgs', 'org_members', 'notices', 'settings')
  loop
    execute format('select count(*) from %I where data is not null', c.table_name) into n;
    if n > 0 then
      raise exception '% still has % record(s) in data. Start the new server once, then run this again.', c.table_name, n;
    end if;
  end loop;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'state') then
    execute 'select count(*) from state where key in (''rev'', ''matcher'', ''orgs'', ''orgMembers'', ''notices'')' into n;
    if n > 0 then
      raise exception 'state still has % row(s) the server moves on start. Start the new server once, then run this again.', n;
    end if;
  end if;
end $$;

alter table events drop column if exists data;
alter table event_photos drop column if exists data;
alter table registrations drop column if exists data;
alter table logs drop column if exists data;
alter table ocr_scans drop column if exists data;
alter table directory drop column if exists data;
alter table profiles drop column if exists data;
alter table orgs drop column if exists data;
alter table org_members drop column if exists data;
alter table notices drop column if exists data;
alter table settings drop column if exists data;
drop table if exists state;
