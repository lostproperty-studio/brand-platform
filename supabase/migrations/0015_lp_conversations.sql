-- Working with Lost Property: a request becomes a conversation. Each one has messages from the client and from the
-- Lost Property team, and a thread in the studio's Slack channel (slack_ts), so anyone in the team can reply there.
-- Code works without this: requests then stay as one-off forms.

alter table requests drop constraint if exists requests_kind_check;
alter table requests add constraint requests_kind_check check (kind in ('edit', 'asset', 'domain', 'access', 'other', 'chat', 'feedback', 'session'));
alter table requests add column if not exists slack_ts text;
alter table requests add column if not exists last_message_at timestamptz;
create index if not exists requests_slack on requests (slack_ts);

create table if not exists request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  author text not null check (author in ('client', 'lp')),
  user_id uuid,
  name text not null default '',
  body text not null,
  slack_ts text,
  created_at timestamptz not null default now()
);
create index if not exists request_messages_req on request_messages (request_id, created_at);
create unique index if not exists request_messages_slack on request_messages (slack_ts) where slack_ts is not null;

alter table request_messages enable row level security;
do $$ begin
  create policy request_messages_staff on request_messages for all using (is_staff()) with check (is_staff());
exception when duplicate_object then null; end $$;
