-- Who can open a file in the portal apps (Writer first).
-- studio: made by Lost Property (in the studio preview). Clients never see these.
-- visibility: 'private' (the maker and anyone added) or 'team' (everyone on that side: the client's team, or the studio).
-- members: people added to the file by name, who can open and edit it whatever the visibility.
alter table app_files add column if not exists studio boolean not null default false;
alter table app_files add column if not exists visibility text not null default 'private';
alter table app_files add column if not exists members uuid[] not null default '{}';
do $$ begin
  alter table app_files add constraint app_files_visibility check (visibility in ('private', 'team'));
exception when duplicate_object then null; end $$;

-- Files that already exist: the studio's stay with whoever made them; the client's stay shared with their team, as before
update app_files set studio = true, visibility = 'private' where created_by in (select user_id from staff);
update app_files set visibility = 'team' where studio = false;

-- Can the signed-in person open this file? Used for the live editing channels (file:<id>)
create or replace function can_open_app_file(f text) returns boolean language sql stable security definer set search_path = public as $$
  select case when f !~ '^[0-9a-f-]{36}$' then false else exists (
    select 1 from app_files a where a.id = f::uuid and (
      a.created_by = auth.uid() or auth.uid() = any(a.members)
      or (a.visibility = 'team' and (is_staff() or (not a.studio and is_member(a.project_id))))
    )) end;
$$;

-- Live editing in a file goes over a private Realtime channel named file:<file id>; only people who can open the file may join
do $$ begin
  create policy file_channels_read on realtime.messages for select to authenticated using (realtime.topic() like 'file:%' and can_open_app_file(substring(realtime.topic() from 6)));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy file_channels_send on realtime.messages for insert to authenticated with check (realtime.topic() like 'file:%' and can_open_app_file(substring(realtime.topic() from 6)));
exception when duplicate_object then null; end $$;
