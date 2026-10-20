-- =====================================================================
-- DEV_SKILL  |  FULL SCHEMA  |  PostgreSQL (Supabase)
-- Run top to bottom, once. Order matters (foreign keys).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 0. HELPERS
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create sequence if not exists centre_seq;

create or replace function next_centre_code() returns text
language sql as $$
  select 'DSK-WB-' || lpad(nextval('centre_seq')::text, 4, '0')
$$;

-- Tracking code for public applications, e.g. APP-7K3M9XQ2
create or replace function gen_tracking_code() returns text
language plpgsql as $$
declare chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text := ''; i int;
begin
  for i in 1..8 loop
    code := code || substr(chars, 1 + floor(random()*length(chars))::int, 1);
  end loop;
  return 'APP-' || code;
end $$;

-- ---------------------------------------------------------------------
-- 1. SCHEMES AND TRADE TEMPLATES (govt-defined, drive the detector)
-- ---------------------------------------------------------------------
create table schemes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table trade_templates (
  id               uuid primary key default gen_random_uuid(),
  scheme_id        uuid not null references schemes(id) on delete restrict,
  trade_name       text not null,
  -- ["person","chair","sewing machine"]
  detector_classes jsonb not null check (jsonb_typeof(detector_classes) = 'array'),
  -- [{"class":"sewing machine","label":"Sewing machine",
  --   "min_units_per_trainee":0.5,"operability":"in_use","required":true}]
  equipment_rules  jsonb not null check (jsonb_typeof(equipment_rules) = 'array'),
  presence_rule    text not null default 'seated'
                   check (presence_rule in ('seated','workstation','any')),
  count_tolerance  int  not null default 1  check (count_tolerance between 0 and 5),
  agree_ratio      numeric(3,2) not null default 0.60 check (agree_ratio between 0.50 and 1.00),
  min_confidence   numeric(3,2) not null default 0.35 check (min_confidence between 0.05 and 0.95),
  base_frames      int  not null default 10 check (base_frames >= 5),
  step_frames      int  not null default 5  check (step_frames >= 1),
  max_frames       int  not null default 40,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (scheme_id, trade_name),
  check (max_frames >= base_frames)
);

-- ---------------------------------------------------------------------
-- 2. APPLICATIONS (created before centres; centre_id FK added later)
-- ---------------------------------------------------------------------
create table applications (
  id                    uuid primary key default gen_random_uuid(),
  tracking_code         text not null unique default gen_tracking_code(),
  applicant_name        text not null,
  applicant_type        text not null check (applicant_type in ('municipality','panchayat','ngo','other')),
  contact_phone         text not null,
  contact_email         text,
  centre_name           text not null,
  scheme_id             uuid not null references schemes(id),
  trade_template_id     uuid not null references trade_templates(id),
  trainers              jsonb not null default '[]'::jsonb,     -- [{"name","qualification"}]
  max_trainees          int  not null check (max_trainees > 0),
  equipment             jsonb not null default '[]'::jsonb,     -- [{"class","label","qty"}]
  address               text not null,
  district              text not null,
  state                 text not null,
  lat                   numeric(9,6),
  lng                   numeric(9,6),
  room_info             jsonb,                                  -- {"size_sqft","cameras","resolution"}
  internet_availability text check (internet_availability in ('none','intermittent','stable')),
  proposed_batches      jsonb,
  documents             jsonb,                                  -- [{"name","path","size"}]
  status                text not null default 'submitted'
                        check (status in ('submitted','under_review','query_raised',
                                          'resubmitted','approved','rejected')),
  review_comment        text,
  reviewed_by           uuid,                                   -- FK to profiles added below
  centre_id             uuid,                                   -- FK to centres added below
  created_by_govt       boolean not null default false,
  submitted_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table application_events (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  actor          uuid,                                  -- null for applicant actions
  action         text not null,                         -- submitted|under_review|query|resubmitted|approved|rejected
  comment        text,
  ts             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. CENTRES AND PROFILES
-- ---------------------------------------------------------------------
create table centres (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  application_id      uuid references applications(id) on delete set null,
  name                text not null,
  scheme_id           uuid not null references schemes(id),
  trade_template_id   uuid not null references trade_templates(id),
  max_trainees        int  not null check (max_trainees > 0),
  address             text,
  district            text,
  state               text,
  lat                 numeric(9,6),
  lng                 numeric(9,6),
  contact_phone       text,
  contact_email       text,
  status              text not null default 'pending_setup'
                      check (status in ('pending_setup','awaiting_camera_approval',
                                        'live','suspended','terminated')),
  status_reason       text,
  risk_score          numeric(5,2) not null default 0,
  live_since          timestamptz,
  created_by_govt     boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table applications
  add constraint fk_app_centre foreign key (centre_id) references centres(id) on delete set null;

create table profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  role                     text not null check (role in
                           ('super_admin','scheme_officer','auditor','centre_admin','trainer')),
  centre_id                uuid references centres(id) on delete cascade,
  full_name                text not null,
  login_id                 text unique,               -- DSK-WB-0001 or DSK-WB-0001-T01 (centre side)
  phone                    text,
  must_change_password     boolean not null default true,
  temp_password_expires_at timestamptz,
  active                   boolean not null default true,
  last_login_at            timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- centre roles MUST have a centre, govt roles MUST NOT
  check ((role in ('centre_admin','trainer')) = (centre_id is not null))
);

alter table applications
  add constraint fk_app_reviewer foreign key (reviewed_by) references profiles(id) on delete set null;

-- ---------------------------------------------------------------------
-- 4. CENTRE MASTER DATA
-- ---------------------------------------------------------------------
create table centre_equipment (
  id             uuid primary key default gen_random_uuid(),
  centre_id      uuid not null references centres(id) on delete cascade,
  class          text not null,                      -- detector class name
  label          text,
  sanctioned_qty int  not null check (sanctioned_qty >= 0),
  declared_qty   int  not null default 0 check (declared_qty >= 0),
  updated_at     timestamptz not null default now(),
  unique (centre_id, class)
);

create table staff (
  id               uuid primary key default gen_random_uuid(),
  centre_id        uuid not null references centres(id) on delete cascade,
  profile_id       uuid unique references profiles(id) on delete set null,
  full_name        text not null,
  staff_role       text not null check (staff_role in ('trainer','official')),
  phone            text,
  face_consent     boolean not null default false,
  face_consent_at  timestamptz,
  face_enrolled    boolean not null default false,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  -- cannot be face-enrolled without consent
  check (not face_enrolled or face_consent)
);

-- STAFF ONLY. Encrypted embedding (Fernet). Never trainees. Never images.
-- supabase-py: send bytea as the string '\x' + bytes.hex()
create table staff_faces (
  staff_id      uuid primary key references staff(id) on delete cascade,
  embedding_enc bytea not null,
  model         text,
  created_at    timestamptz not null default now()
);

create table batches (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid not null references centres(id) on delete cascade,
  name        text not null,
  trainer_id  uuid references staff(id) on delete set null,
  weekdays    int[] not null check (weekdays <@ array[1,2,3,4,5,6,7] and cardinality(weekdays) > 0),
  start_time  time not null,
  end_time    time not null,
  start_date  date,
  end_date    date,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table holidays (
  id           uuid primary key default gen_random_uuid(),
  centre_id    uuid not null references centres(id) on delete cascade,
  holiday_date date not null,
  reason       text,
  unique (centre_id, holiday_date)
);

-- NO photo / face columns on trainees, by design.
create table trainees (
  id          uuid primary key default gen_random_uuid(),
  centre_id   uuid not null references centres(id) on delete cascade,
  batch_id    uuid references batches(id) on delete set null,
  full_name   text not null,
  external_id text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. SESSIONS AND ATTENDANCE (CLAIMED side)
-- ---------------------------------------------------------------------
create table sessions (
  id            uuid primary key default gen_random_uuid(),
  centre_id     uuid not null references centres(id) on delete cascade,
  batch_id      uuid not null references batches(id) on delete cascade,
  session_date  date not null,
  start_ts      timestamptz not null,
  end_ts        timestamptz not null,
  status        text not null default 'scheduled'
                check (status in ('scheduled','active','closed','missed')),
  planned_captures int not null default 0,
  done_captures    int not null default 0,
  unique (batch_id, session_date),
  check (end_ts > start_ts)
);

create table attendance_claims (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null unique references sessions(id) on delete cascade,
  centre_id           uuid not null references centres(id) on delete cascade,
  claimed_count       int  not null check (claimed_count >= 0),
  present_trainee_ids uuid[] not null default '{}',
  marked_by           uuid references profiles(id),
  marked_at           timestamptz not null default now(),
  edit_reason         text,
  edit_count          int not null default 0
);

create table staff_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  staff_id   uuid not null references staff(id) on delete cascade,
  method     text not null default 'face' check (method in ('face','manual_override')),
  verified   boolean not null,
  score      numeric(5,4),
  attempts   int not null default 1,
  marked_at  timestamptz not null default now(),
  unique (session_id, staff_id)
);

-- ---------------------------------------------------------------------
-- 6. CAMERAS AND HEALTH
-- ---------------------------------------------------------------------
create table cameras (
  id               uuid primary key default gen_random_uuid(),
  centre_id        uuid not null references centres(id) on delete cascade,
  name             text not null,
  source_uri       text not null,                  -- rtsp://... or sample video file name
  resolution       text,
  roi_polygon      jsonb,                          -- [[x,y],...] normalised 0..1
  zones            jsonb,                          -- [{"name":"WS1","polygon":[[x,y],...]}]
  reference_phash  text,
  setup_status     text not null default 'draft'
                   check (setup_status in ('draft','submitted','approved','rejected')),
  reject_reason    text,
  submitted_at     timestamptz,
  decided_by       uuid references profiles(id),
  decided_at       timestamptz,
  status           text not null default 'unknown'
                   check (status in ('unknown','online','offline','tampered')),
  last_tamper_reason text,
  last_seen        timestamptz,
  created_at       timestamptz not null default now()
);

create table camera_health_events (
  id         bigserial primary key,
  camera_id  uuid not null references cameras(id) on delete cascade,
  status     text not null,
  reason     text,
  ts         timestamptz not null default now()
);

-- Perceptual hashes only (no images). Used for replay detection (C2).
create table frame_fingerprints (
  id          bigserial primary key,
  camera_id   uuid not null references cameras(id) on delete cascade,
  session_id  uuid references sessions(id) on delete cascade,
  dhash       text not null,
  captured_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. EDGE LEDGER AND OBSERVATIONS (OBSERVED side)
-- ---------------------------------------------------------------------
create table edge_devices (
  device_id      text primary key,
  centre_id      uuid references centres(id) on delete set null,
  public_key_hex text not null,
  last_sync      timestamptz,
  chain_ok       boolean not null default true,
  created_at     timestamptz not null default now()
);

create table ledger_entries (
  id        uuid primary key default gen_random_uuid(),
  device_id text   not null references edge_devices(device_id),
  seq       bigint not null,
  kind      text   not null,                       -- observation | flag | claim | ...
  payload   jsonb  not null,
  prev_hash text   not null,
  hash      text   not null unique,
  sig       text   not null,
  ts        timestamptz not null,
  unique (device_id, seq)
);

create table observations (
  id              uuid primary key default gen_random_uuid(),
  centre_id       uuid not null references centres(id) on delete cascade,
  session_id      uuid references sessions(id) on delete cascade,
  camera_id       uuid references cameras(id) on delete set null,
  hour_bucket     timestamptz not null,
  observed_count  int,
  ci_low          int,
  ci_high         int,
  state           text not null check (state in ('ok','uncertain')),
  frames_used     int,
  per_frame_counts int[],
  equipment       jsonb,