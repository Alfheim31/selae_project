-- SELAE tables. In your Supabase project open the SQL Editor, paste this, and run it once.
-- One row per record and one column per field. `seq` keeps the order records were added in.
-- (A project made before the columns: run migrate-to-columns.sql instead.)

-- events
create table if not exists events (
  "id" text primary key,
  "title" text,
  "host_name" text,
  "org_id" text,
  "venue" text,
  "description" text,
  "category" text,
  "color" text,
  "capacity" integer,
  "starts_at" timestamptz,
  "ends_at" timestamptz,
  "visibility" text,
  "registration_open" boolean,
  "cover_image" text,
  "created_at" timestamptz,
  "created_by" text,
  "host_key_hash" text,
  "simulated" boolean,
  seq bigserial,
  updated_at timestamptz not null default now());

-- photos of past events, in the order they were added
create table if not exists event_photos (
  "id" text primary key,
  "event_id" text,
  "url" text,
  "uploaded_at" timestamptz,
  "position" integer,
  seq bigserial,
  updated_at timestamptz not null default now());

-- tickets; student_* is the copy of the student's details on the ticket, checkin_* is filled at the gate
create table if not exists registrations (
  "id" text primary key,
  "event_id" text,
  "code" text,
  "student_id" text,
  "user_id" text,
  "email" text,
  "status" text,
  "walk_in" boolean,
  "created_at" timestamptz,
  "promoted_at" timestamptz,
  "promoted_by" text,
  "student_first" text,
  "student_middle" text,
  "student_last" text,
  "student_suffix" text,
  "student_section" text,
  "face_descriptor" double precision[],
  "checkin_time" timestamptz,
  "checkin_method" text,
  "checkin_confidence" double precision,
  seq bigserial,
  updated_at timestamptz not null default now());

-- every check-in attempt at the gate
create table if not exists logs (
  "uid" text primary key,
  "event_id" text,
  "time" timestamptz,
  "student_id" text,
  "outcome" text,
  "method" text,
  "confidence" double precision,
  seq bigserial,
  updated_at timestamptz not null default now());

-- student ID cards read by the scanner, with the matches it considered
create table if not exists ocr_scans (
  "id" text primary key,
  "event_id" text,
  "time" timestamptz,
  "read" text,
  "conf" double precision[],
  "source" text,
  "decision" text,
  "p_unknown" double precision,
  "candidate_ids" text[],
  "candidate_ps" double precision[],
  "resolution" text,
  "truth" text,
  "rank" integer,
  "learned" text[],
  seq bigserial,
  updated_at timestamptz not null default now());

-- the student list the ID scanner matches against
create table if not exists directory (
  "id" text primary key,
  "first" text,
  "middle" text,
  "last" text,
  "suffix" text,
  "section" text,
  "face_descriptor" double precision[],
  seq bigserial,
  updated_at timestamptz not null default now());

-- one per student account: student number, name, section, face signature
create table if not exists profiles (
  "id" text primary key,
  "user_id" text,
  "email" text,
  "sign_in" text,
  "student_id" text,
  "first" text,
  "middle" text,
  "last" text,
  "suffix" text,
  "section" text,
  "face_descriptor" double precision[],
  "face_consent_at" timestamptz,
  "saved_at" timestamptz,
  seq bigserial,
  updated_at timestamptz not null default now());

-- organizations, added by the superadmin
create table if not exists orgs (
  "id" text primary key,
  "name" text,
  "email" text,
  "type" text,
  "disabled" boolean,
  "logo" text,
  "cover" text,
  "created_at" timestamptz,
  "created_by" text,
  "edited_at" timestamptz,
  seq bigserial,
  updated_at timestamptz not null default now());

-- officers: student accounts an organization invited
create table if not exists org_members (
  "id" text primary key,
  "org_id" text,
  "email" text,
  "status" text,
  "user_id" text,
  "invited_at" timestamptz,
  "accepted_at" timestamptz,
  seq bigserial,
  updated_at timestamptz not null default now());

-- notifications sent to an account
create table if not exists notices (
  "id" text primary key,
  "to_email" text,
  "time" timestamptz,
  "kind" text,
  "text" text,
  "org_id" text,
  seq bigserial,
  updated_at timestamptz not null default now());

-- one row (id 'main'): the data version and the OCR matcher's learned corrections
create table if not exists settings (
  "id" text primary key,
  "rev" integer,
  "matcher_learned" double precision[],
  "matcher_columns" integer,
  "matcher_insertions" double precision,
  "matcher_ops" double precision,
  "matcher_corrections" double precision,
  "matcher_auto_at" double precision,
  "matcher_confirm_at" double precision,
  "matcher_updated_at" timestamptz,
  seq bigserial,
  updated_at timestamptz not null default now());

create index if not exists registrations_event on registrations (event_id);
create index if not exists logs_event on logs (event_id);
create index if not exists ocr_scans_event on ocr_scans (event_id);
create index if not exists event_photos_event on event_photos (event_id);

-- Only the server talks to these tables, with the service role key. Row level security
-- stays on so the public anon key cannot read them.
alter table events enable row level security;
alter table event_photos enable row level security;
alter table registrations enable row level security;
alter table logs enable row level security;
alter table ocr_scans enable row level security;
alter table directory enable row level security;
alter table profiles enable row level security;
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table notices enable row level security;
alter table settings enable row level security;

-- Cover photos and event photos. Public, so phones can load them straight from Supabase.
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true)
on conflict (id) do update set public = true;
