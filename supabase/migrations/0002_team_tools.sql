-- Client teams, saved conversations and creations per person, and Tools.

alter table project_members add column if not exists email text;

-- Ask: each person's conversations, with what they were looking at
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  title text not null default '',
  context text,                          -- page or tool the conversation started on
  tool_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_owner on conversations (project_id, user_id, updated_at desc);

create table if not exists messages (
  id bigserial primary key,
  conversation_id uuid not null references conversations on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  context text,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv on messages (conversation_id, id);

-- Tools: HTML apps the studio uploads (or the built-in layout maker), shown as apps in the portal
create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  kind text not null default 'html' check (kind in ('html', 'layouts')),
  name text not null,
  icon text not null default 'grid',
  description text not null default '',
  html_path text,
  styling text not null default 'full' check (styling in ('full', 'light', 'none')),
  ai_enabled boolean not null default true,
  visible boolean not null default true,
  ord int not null default 0,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tools_project on tools (project_id, ord);

-- Things each person made in a tool, so they can come back to them
create table if not exists creations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  tool_id uuid references tools on delete set null,
  title text not null default 'Untitled',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creations_owner on creations (project_id, user_id, updated_at desc);

alter table conversations enable row level security;
alter table messages enable row level security;
alter table tools enable row level security;
alter table creations enable row level security;

create policy conversations_own on conversations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy messages_own on messages for all using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy creations_own on creations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tools_staff on tools for all using (is_staff()) with check (is_staff());
create policy tools_client on tools for select using (visible and is_member(project_id));

create trigger tools_touch before update on tools for each row execute function touch_updated_at();
create trigger creations_touch before update on creations for each row execute function touch_updated_at();
create trigger conversations_touch before update on conversations for each row execute function touch_updated_at();
