-- Who from the studio works on each project, and in what role. A project with nobody listed is open to the whole
-- studio (as before). People are added by email, so a teammate who hasn't signed in yet can still be added.
create table if not exists project_team (
  project_id uuid not null references projects on delete cascade,
  email text not null,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'editor' check (role in ('lead', 'editor', 'viewer')),
  added_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);
alter table project_team enable row level security;
do $$ begin
  create policy project_team_staff on project_team for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;

-- The last change made in the studio, and by whom
alter table projects add column if not exists last_edited_by uuid references auth.users on delete set null;
alter table projects add column if not exists last_edited_at timestamptz;
