-- Portal v2 apps: one row per file a client team makes in Writer (a doc), Director (a project of videos),
-- Designer (a file of designs) or Photographer (a collection of images). The file's contents live in `data`.
-- Read and written by the server only, after its own access checks (as director_files).
create table if not exists app_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  app text not null check (app in ('writer', 'director', 'designer', 'photographer')),
  title text not null default 'Untitled',
  status text not null default 'draft' check (status in ('draft', 'review', 'signed')),
  data jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_files_project on app_files (project_id, app, updated_at desc);
alter table app_files enable row level security;
do $$ begin
  create policy app_files_staff on app_files for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
