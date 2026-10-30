-- Brand platform: core schema
-- Studio staff manage projects. Each project is one client portal with its own link.
-- Client users only ever see the projects they are members of (row-level security).

create extension if not exists "pgcrypto";

-- ---------- people
create type staff_role as enum ('admin', 'editor');
create type member_role as enum ('client_admin', 'client_viewer');

create table staff (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  name text,
  role staff_role not null default 'editor',
  created_at timestamptz not null default now()
);

create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid());
$$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'admin');
$$;

-- ---------- projects
create type project_status as enum ('draft', 'live', 'archived');

create table projects (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  name text not null default 'Brand Guide',
  line text default '',
  slug text not null unique,              -- brand.lostproperty.studio/p/<slug>
  status project_status not null default 'draft',
  figma_key text,                          -- Figma file key
  figma_page_id text,                      -- node id of the guidelines page
  repo_full_name text,                     -- e.g. lostproperty-studio/tileyard-brand-kit
  kit_version text not null default '1.0.0',
  brand jsonb not null default '{}'::jsonb,       -- logo, fonts, core + secondary colours, portal skin
  content jsonb not null default '{}'::jsonb,     -- chapters/blocks (published copy lives in project_versions)
  showcase jsonb not null default '[]'::jsonb,
  ai_provider text,                        -- 'anthropic' (route 1: client brings their own key)
  ai_key_cipher text,                      -- AES-256-GCM, never returned to the browser
  ai_key_hint text,                        -- last 4 characters for display
  mcp_token_hash text,                     -- route 3: token for the client's own Claude connector
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table project_members (
  project_id uuid references projects on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role member_role not null default 'client_viewer',
  invited_by uuid references auth.users,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create or replace function is_member(p uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = p and user_id = auth.uid());
$$;

-- Published snapshot that clients see. Studio edits never reach clients until published.
create table project_versions (
  id bigserial primary key,
  project_id uuid not null references projects on delete cascade,
  version text not null,
  snapshot jsonb not null,
  published_by uuid references auth.users,
  created_at timestamptz not null default now()
);

-- ---------- Figma scan + review (intake)
create type scan_status as enum ('queued', 'running', 'done', 'failed');
create table scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects on delete cascade,
  figma_key text not null,
  page_id text,
  status scan_status not null default 'queued',
  steps jsonb not null default '[]'::jsonb,    -- [{title, desc, state}]
  meta jsonb not null default '{}'::jsonb,     -- file name, page, chapters, detected colours/type
  error text,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create type item_kind as enum ('asset', 'value', 'rule', 'conflict', 'issue', 'question');
create type item_input as enum ('confirm', 'choice', 'multi', 'text');
create type item_status as enum ('open', 'accepted', 'changed', 'answered', 'skipped', 'delegated');
create table review_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references scans on delete cascade,
  ord int not null,
  chapter text not null,
  kind item_kind not null,
  title text not null,
  found text not null default '',
  proposal text not null default '',
  input item_input not null default 'confirm',
  options jsonb not null default '[]'::jsonb,
  recommend text default '',
  node_id text,
  preview_path text,                -- storage path of the exported layer preview
  swatches jsonb not null default '[]'::jsonb,
  status item_status not null default 'open',
  answer text not null default '',
  note text not null default '',
  answered_by uuid references auth.users,
  updated_at timestamptz not null default now()
);
create index on review_items (scan_id, ord);

-- ---------- deliverables (the kit of parts)
create type part_status as enum ('ready', 'in_review', 'in_production', 'not_in_scope');
create table deliverable_parts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  ord int not null,
  key text not null,                -- assets | tokens | guidelines | templates | reference
  title text not null,
  contains text not null default '',
  format text not null default '',
  status part_status not null default 'in_production',
  visible boolean not null default true,
  unique (project_id, key)
);
create table deliverable_files (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references deliverable_parts on delete cascade,
  path text not null,               -- path inside the kit repo, e.g. assets/logo/tileyard-logo-horizontal-dark.svg
  format text not null default '',
  storage_path text,                -- copy in Supabase storage for portal downloads
  bytes int,
  sha text,
  updated_at timestamptz not null default now(),
  unique (part_id, path)
);

-- ---------- chat knowledge
create table kb_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  keys text not null default '',
  answer text not null,
  chapter text,
  label text,
  ord int not null default 0
);

-- ---------- AI usage log (billed to the client's own key; kept for transparency)
create table ai_usage (
  id bigserial primary key,
  project_id uuid not null references projects on delete cascade,
  user_id uuid references auth.users,
  feature text not null,            -- chat | canvas
  input_tokens int, output_tokens int,
  created_at timestamptz not null default now()
);

-- ---------- row-level security
alter table staff enable row level security;
alter table projects enable row level security;
alter table project_members enable row level security;
alter table project_versions enable row level security;
alter table scans enable row level security;
alter table review_items enable row level security;
alter table deliverable_parts enable row level security;
alter table deliverable_files enable row level security;
alter table kb_entries enable row level security;
alter table ai_usage enable row level security;

create policy staff_read on staff for select using (is_staff());
create policy staff_admin on staff for all using (is_admin()) with check (is_admin());

-- Staff do everything on projects; clients read only projects they belong to, via the published snapshot.
create policy projects_staff on projects for all using (is_staff()) with check (is_staff());
create policy members_staff on project_members for all using (is_staff()) with check (is_staff());
create policy members_self on project_members for select using (user_id = auth.uid());
create policy versions_staff on project_versions for all using (is_staff()) with check (is_staff());
create policy versions_client on project_versions for select using (is_member(project_id));
create policy scans_staff on scans for all using (is_staff()) with check (is_staff());
create policy items_staff on review_items for all using (is_staff()) with check (is_staff());
create policy parts_staff on deliverable_parts for all using (is_staff()) with check (is_staff());
create policy parts_client on deliverable_parts for select using (visible and is_member(project_id));
create policy files_staff on deliverable_files for all using (is_staff()) with check (is_staff());
create policy files_client on deliverable_files for select using (exists (select 1 from deliverable_parts d where d.id = part_id and d.visible and is_member(d.project_id)));
create policy kb_staff on kb_entries for all using (is_staff()) with check (is_staff());
create policy usage_staff on ai_usage for select using (is_staff());

-- Never let the browser read the encrypted client key, even for staff.
revoke select (ai_key_cipher, mcp_token_hash) on projects from anon, authenticated;

-- ---------- storage buckets
insert into storage.buckets (id, name, public) values ('kits', 'kits', false), ('previews', 'previews', false), ('uploads', 'uploads', false)
on conflict (id) do nothing;

create or replace function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger projects_touch before update on projects for each row execute function touch_updated_at();
create trigger items_touch before update on review_items for each row execute function touch_updated_at();
