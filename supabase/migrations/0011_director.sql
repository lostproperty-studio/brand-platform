-- Director: short-form video files, one row per video, shared by the project's team. The edit itself (scenes,
-- captions, sound) lives in `data`; generated and uploaded media live in the `previews` bucket under
-- <project id>/director/. Read and written by the server only, after its own access checks.
create table if not exists director_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  created_by uuid,
  title text not null default 'Untitled video',
  aspect text not null default '9:16',
  status text not null default 'edit' check (status in ('plan', 'edit')),
  data jsonb not null default '{}'::jsonb,
  thumb text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists director_files_project on director_files (project_id, updated_at desc);
alter table director_files enable row level security;
do $$ begin
  create policy director_files_staff on director_files for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
