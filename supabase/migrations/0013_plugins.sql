-- Plug-ins: the brand inside the tools a client already uses (Canva, Microsoft Office, Google Workspace), and their
-- own file storage (Google Drive, Dropbox, SharePoint, GitHub). Read and written by the server only, after its own
-- access checks. The code works without these tables: plug-ins then show as not set up.

-- A client's connected account for one plug-in (a Canva team, a Dropbox account...). Tokens are encrypted at rest.
create table if not exists plugin_connections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  plugin text not null,
  account text,
  secret text,
  settings jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, plugin)
);

-- The LP panel signs in to the platform like any app signing in with an account: each client's panel, in each app,
-- gets its own credentials, so a panel can only ever see the brand it was set up for. Only the secret's hash is kept.
create table if not exists panel_clients (
  client_id text primary key,
  project_id uuid not null references projects(id) on delete cascade,
  host text not null check (host in ('canva', 'office', 'google')),
  secret_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists panel_clients_project on panel_clients (project_id, host);

-- One person signed in to a panel: the short-lived code, then the access and refresh tokens (hashes only)
create table if not exists panel_grants (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references panel_clients(client_id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  code_hash text unique,
  code_challenge text,
  redirect_uri text,
  code_expires timestamptz,
  access_hash text unique,
  refresh_hash text unique,
  access_expires timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table plugin_connections enable row level security;
alter table panel_clients enable row level security;
alter table panel_grants enable row level security;
do $$ begin
  create policy plugin_connections_staff on plugin_connections for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy panel_clients_staff on panel_clients for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
do $$ begin
  create policy panel_grants_staff on panel_grants for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
