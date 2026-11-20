-- Adds any table or column a newer SELAE needs to a project that already has its tables.
-- Run it in the SQL Editor when the server says a column is missing, before deploying that server.
-- It only adds; nothing is changed or deleted. Safe to run again.

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
  "disabled_at" timestamptz,
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

alter table events
  add column if not exists "title" text,
  add column if not exists "host_name" text,
  add column if not exists "org_id" text,
  add column if not exists "venue" text,
  add column if not exists "description" text,
  add column if not exists "category" text,
  add column if not exists "color" text,
  add column if not exists "capacity" integer,
  add column if not exists "starts_at" timestamptz,
  add column if not exists "ends_at" timestamptz,
  add column if not exists "visibility" text,
  add column if not exists "registration_open" boolean,
  add column if not exists "cover_image" text,
  add column if not exists "created_at" timestamptz,
  add column if not exists "created_by" text,
  add column if not exists "host_key_hash" text,
  add column if not exists "simulated" boolean;

alter table event_photos
  add column if not exists "event_id" text,
  add column if not exists "url" text,
  add column if not exists "uploaded_at" timestamptz,
  add column if not exists "position" integer;

alter table registrations
  add column if not exists "event_id" text,
  add column if not exists "code" text,
  add column if not exists "student_id" text,
  add column if not exists "user_id" text,
  add column if not exists "email" text,
  add column if not exists "status" text,
  add column if not exists "walk_in" boolean,
  add column if not exists "created_at" timestamptz,
  add column if not exists "promoted_at" timestamptz,
  add column if not exists "promoted_by" text,
  add column if not exists "student_first" text,
  add column if not exists "student_middle" text,
  add column if not exists "student_last" text,
  add column if not exists "student_suffix" text,
  add column if not exists "student_section" text,
  add column if not exists "face_descriptor" double precision[],
  add column if not exists "checkin_time" timestamptz,
  add column if not exists "checkin_method" text,
  add column if not exists "checkin_confidence" double precision;

alter table logs
  add column if not exists "event_id" text,
  add column if not exists "time" timestamptz,
  add column if not exists "student_id" text,
  add column if not exists "outcome" text,
  add column if not exists "method" text,
  add column if not exists "confidence" double precision;

alter table ocr_scans
  add column if not exists "event_id" text,
  add column if not exists "time" timestamptz,
  add column if not exists "read" text,
  add column if not exists "conf" double precision[],
  add column if not exists "source" text,
  add column if not exists "decision" text,
  add column if not exists "p_unknown" double precision,
  add column if not exists "candidate_ids" text[],
  add column if not exists "candidate_ps" double precision[],
  add column if not exists "resolution" text,
  add column if not exists "truth" text,
  add column if not exists "rank" integer,
  add column if not exists "learned" text[];

alter table directory
  add column if not exists "first" text,
  add column if not exists "middle" text,
  add column if not exists "last" text,
  add column if not exists "suffix" text,
  add column if not exists "section" text,
  add column if not exists "face_descriptor" double precision[];

alter table profiles
  add column if not exists "user_id" text,
  add column if not exists "email" text,
  add column if not exists "sign_in" text,
  add column if not exists "student_id" text,
  add column if not exists "first" text,
  add column if not exists "middle" text,
  add column if not exists "last" text,
  add column if not exists "suffix" text,
  add column if not exists "section" text,
  add column if not exists "face_descriptor" double precision[],
  add column if not exists "face_consent_at" timestamptz,
  add column if not exists "saved_at" timestamptz;

alter table orgs
  add column if not exists "name" text,
  add column if not exists "email" text,
  add column if not exists "type" text,
  add column if not exists "disabled" boolean,
  add column if not exists "logo" text,
  add column if not exists "cover" text,
  add column if not exists "created_at" timestamptz,
  add column if not exists "created_by" text,
  add column if not exists "edited_at" timestamptz,
  add column if not exists "disabled_at" timestamptz;

alter table org_members
  add column if not exists "org_id" text,
  add column if not exists "email" text,
  add column if not exists "status" text,
  add column if not exists "user_id" text,
  add column if not exists "invited_at" timestamptz,
  add column if not exists "accepted_at" timestamptz;

alter table notices
  add column if not exists "to_email" text,
  add column if not exists "time" timestamptz,
  add column if not exists "kind" text,
  add column if not exists "text" text,
  add column if not exists "org_id" text;

alter table settings
  add column if not exists "rev" integer,
  add column if not exists "matcher_learned" double precision[],
  add column if not exists "matcher_columns" integer,
  add column if not exists "matcher_insertions" double precision,
  add column if not exists "matcher_ops" double precision,
  add column if not exists "matcher_corrections" double precision,
  add column if not exists "matcher_auto_at" double precision,
  add column if not exists "matcher_confirm_at" double precision,
  add column if not exists "matcher_updated_at" timestamptz;

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
