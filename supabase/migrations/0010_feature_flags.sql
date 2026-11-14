-- Release gate: which stage each feature is at, per project. A feature with no row here uses the default stage
-- set in lib/features.ts. Stages: off (nobody), studio (studio staff only), beta (the client too, marked Beta),
-- live (everyone). Read and written by the server only.
create table if not exists project_features (
  project_id uuid not null references projects(id) on delete cascade,
  feature text not null,
  stage text not null check (stage in ('off', 'studio', 'beta', 'live')),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (project_id, feature)
);
alter table project_features enable row level security;
do $$ begin
  create policy project_features_staff on project_features for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
