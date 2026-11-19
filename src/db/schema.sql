-- Applied on every start. Idempotent by design; a real product would use
-- versioned migrations instead.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  prefix text not null unique,
  secret_hash bytea not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

create index if not exists api_keys_project_idx on api_keys (project_id);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  project_id uuid not null references projects (id) on delete cascade,
  api_key_id uuid not null references api_keys (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists sessions_project_idx on sessions (project_id);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  status text not null default 'running',
  created_at timestamptz not null default now()
);

create index if not exists runs_project_created_idx on runs (project_id, created_at desc, id);

create table if not exists metric_events (
  run_id uuid not null references runs (id) on delete cascade,
  seq bigint not null check (seq > 0),
  event_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  value double precision not null
    check (value <> 'NaN'::float8 and value <> 'Infinity'::float8 and value <> '-Infinity'::float8),
  ts timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (run_id, seq),
  constraint metric_events_run_event_key unique (run_id, event_id)
);
