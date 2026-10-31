-- Client roles (Creator, Manager, Admin), invite links, requests to Lost Property, and usage activity.

alter type member_role add value if not exists 'client_manager';

-- Shareable invite links with a role. Only the hash of the token is stored.
create table if not exists invite_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  role text not null check (role in ('client_admin', 'client_manager', 'client_viewer')),
  token_hash text not null unique,
  label text not null default '',
  created_by uuid references auth.users,
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);

-- Requests from client admins to Lost Property (edits, new assets, hosting on their own domain...)
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  user_id uuid references auth.users on delete set null,
  email text,
  kind text not null default 'edit' check (kind in ('edit', 'asset', 'domain', 'access', 'other')),
  title text not null,
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'declined')),
  reply text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requests_project on requests (project_id, created_at desc);

-- What people do in a portal: visits, downloads, tools, skills. For the studio's view of each client.
create table if not exists activity (
  id bigserial primary key,
  project_id uuid not null references projects on delete cascade,
  user_id uuid references auth.users on delete set null,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists activity_project on activity (project_id, created_at desc);
create index if not exists activity_user on activity (project_id, user_id, created_at desc);

alter table invite_links enable row level security;
alter table requests enable row level security;
alter table activity enable row level security;
do $$ begin
  create policy invite_links_staff on invite_links for all using (is_staff()) with check (is_staff());
  create policy requests_staff on requests for all using (is_staff()) with check (is_staff());
  create policy activity_staff on activity for select using (is_staff());
exception when duplicate_object then null; end $$;

drop trigger if exists requests_touch on requests;
create trigger requests_touch before update on requests for each row execute function touch_updated_at();
