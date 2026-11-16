-- Waiting list for the launch announcement. Double opt-in: a row is 'pending' until the person clicks the link in the
-- confirmation mail. Unsubscribing deletes the row, so "delete my data" and "unsubscribe" are the same action.
create table waitlist (
  id bigserial primary key,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed')),
  confirm_token text not null unique,
  unsubscribe_token text not null unique,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  last_confirmation_sent_at timestamptz not null default now()
);
create unique index waitlist_email_key on waitlist (lower(email));
