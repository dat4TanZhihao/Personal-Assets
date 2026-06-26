create table if not exists users (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists holdings (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cashflows (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists investment_plans (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prices (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists daily_snapshots (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sync_jobs (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists oauth_tokens (
  _id text primary key,
  data jsonb not null,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists users_data_gin on users using gin (data);
create index if not exists accounts_data_gin on accounts using gin (data);
create index if not exists holdings_data_gin on holdings using gin (data);
create index if not exists cashflows_data_gin on cashflows using gin (data);
create index if not exists investment_plans_data_gin on investment_plans using gin (data);
create index if not exists prices_data_gin on prices using gin (data);
create index if not exists daily_snapshots_data_gin on daily_snapshots using gin (data);
create index if not exists sync_jobs_data_gin on sync_jobs using gin (data);
create index if not exists oauth_tokens_data_gin on oauth_tokens using gin (data);

create index if not exists users_user_id_idx on users (user_id);
create index if not exists accounts_user_id_idx on accounts (user_id);
create index if not exists holdings_user_id_idx on holdings (user_id);
create index if not exists cashflows_user_id_idx on cashflows (user_id);
create index if not exists investment_plans_user_id_idx on investment_plans (user_id);
create index if not exists prices_user_id_idx on prices (user_id);
create index if not exists daily_snapshots_user_id_idx on daily_snapshots (user_id);
create index if not exists sync_jobs_user_id_idx on sync_jobs (user_id);
create index if not exists oauth_tokens_user_id_idx on oauth_tokens (user_id);
