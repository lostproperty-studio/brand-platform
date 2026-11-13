-- Comments the studio leaves on the preview of a client portal, picked up in the guidelines editor.
-- Studio only: the service role reads and writes them; clients never see them.
create table if not exists portal_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  path text not null,                 -- the portal page, e.g. /guidelines/logo
  chapter text,                       -- the guidelines chapter id, when on a chapter
  block text,                         -- the section it's pinned to
  x real not null default 0.5,        -- where on the section (0..1)
  y real not null default 0.5,
  body text not null,
  author uuid references auth.users on delete set null,
  author_name text not null,
  replies jsonb not null default '[]', -- [{ body, author_name, at }]
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz not null default now()
);
create index if not exists portal_comments_project on portal_comments (project_id, created_at desc);
alter table portal_comments enable row level security;
