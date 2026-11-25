-- The iOS app (mobile/): each phone that allowed notifications, so the platform can send a push (an approval waiting,
-- a reply from Lost Property). One row per device token; a token moves to whoever signed in on that phone last.
create table if not exists app_devices (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null default 'ios',
  app_version text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists app_devices_user on app_devices (user_id);
alter table app_devices enable row level security;
