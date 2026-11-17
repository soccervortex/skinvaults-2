-- Steam sign-in and the inventory cache.
-- users: one row per Steam account that signed in. We keep only what Steam shows publicly plus two timestamps.
-- sessions: the cookie holds a random token; only its SHA-256 hash is stored, so a database leak does not leak sessions.
-- inventory_cache: the last parsed inventory per Steam account, so a refresh does not hit Steam's strict rate limit.
create table users (
  steam_id text primary key check (steam_id ~ '^[0-9]{17}$'),
  persona_name text not null default '',
  avatar_url text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  steam_id text not null references users (steam_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_steam_id_idx on sessions (steam_id);
create index sessions_expires_at_idx on sessions (expires_at);

create table inventory_cache (
  steam_id text primary key check (steam_id ~ '^[0-9]{17}$'),
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);
