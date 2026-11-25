-- The LP panel in Office, Google Workspace and Figma signs in by link: the panel shows a short code and opens a page
-- on the platform; the person signs in there, checks the code matches and chooses the brand. The panel then picks up
-- its tokens. (Canva signs in with OAuth instead: see panel_clients.) Hashes only; links last ten minutes.
create table if not exists panel_links (
  id text primary key,
  poll_hash text not null,
  host text not null,
  words text not null,
  hint text,
  project_id uuid references projects(id) on delete cascade,
  user_id uuid,
  approved_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table panel_links enable row level security;
do $$ begin
  create policy panel_links_staff on panel_links for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;

-- Panels that sign in by link use a credential the platform keeps for itself, per brand and app
alter table panel_clients drop constraint if exists panel_clients_host_check;
alter table panel_clients add constraint panel_clients_host_check check (host in ('canva', 'office', 'google', 'figma'));
