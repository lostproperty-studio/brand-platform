-- Studio-wide settings, such as the guidelines playbook. Read and written by the server only.
create table if not exists studio_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table studio_settings enable row level security;
do $$ begin
  create policy studio_settings_staff on studio_settings for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
