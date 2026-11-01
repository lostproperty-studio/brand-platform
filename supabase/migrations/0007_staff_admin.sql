-- Studio members can be removed from the platform: they stay on record but lose access, and signing in again with
-- a studio email doesn't bring them back.
alter table staff add column if not exists active boolean not null default true;
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'admin' and active);
$$;
