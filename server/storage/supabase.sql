-- SELAE tables. In your Supabase project open SQL Editor, paste this, and run it once.
-- Each row keeps one record as JSON; `seq` preserves the order records were added in.

create table if not exists events (
  id text primary key, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());
create table if not exists registrations (
  id text primary key, event_id text, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());
create table if not exists logs (
  uid text primary key, event_id text, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());
create table if not exists ocr_scans (
  id text primary key, event_id text, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());
create table if not exists directory (
  id text primary key, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());
-- One per Google account: student number, name, section, face signature
create table if not exists profiles (
  id text primary key, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());
create table if not exists state (
  key text primary key, data jsonb not null, seq bigserial, updated_at timestamptz not null default now());

create index if not exists registrations_event on registrations (event_id);
create index if not exists logs_event on logs (event_id);
create index if not exists ocr_scans_event on ocr_scans (event_id);

-- Only the server talks to these tables, with the service role key. Row level security
-- stays on so the public anon key cannot read them.
alter table events enable row level security;
alter table registrations enable row level security;
alter table logs enable row level security;
alter table ocr_scans enable row level security;
alter table directory enable row level security;
alter table profiles enable row level security;
alter table state enable row level security;

-- Cover photos and event photos. Public, so phones can load them straight from Supabase.
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;
