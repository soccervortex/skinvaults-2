-- Platform tables only. Feature tables arrive with their own migrations when a feature is approved.

create table job_runs (
  id          bigserial primary key,
  job         text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null check (status in ('running', 'ok', 'error')),
  error       text,
  duration_ms integer
);
create index job_runs_job_started on job_runs (job, started_at desc);

-- Every outbound message (e-mail, Discord) is a row here, so a failure is recorded, retried and alerted.
create table outbox (
  id              bigserial primary key,
  channel         text        not null check (channel in ('email', 'discord')),
  payload         jsonb       not null,
  status          text        not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts        integer     not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index outbox_due on outbox (next_attempt_at) where status = 'pending';
