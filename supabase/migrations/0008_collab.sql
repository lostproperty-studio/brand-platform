-- Working together on the guidelines: version history, and live presence, cursors and edits for the studio.

create table if not exists guide_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  guide jsonb not null,
  author uuid references auth.users on delete set null,
  author_name text,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists guide_versions_project on guide_versions (project_id, created_at desc);
alter table guide_versions enable row level security;
do $$ begin
  create policy guide_versions_staff on guide_versions for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;

-- Live editing goes over private Realtime channels named guide:<project id>. Only studio staff may join them.
do $$ begin
  create policy guide_channels_staff on realtime.messages for select to authenticated using (is_staff() and realtime.topic() like 'guide:%');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy guide_channels_staff_send on realtime.messages for insert to authenticated with check (is_staff() and realtime.topic() like 'guide:%');
exception when duplicate_object then null; end $$;
