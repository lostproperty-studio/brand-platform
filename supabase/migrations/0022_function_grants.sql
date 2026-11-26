-- From Supabase's Security Advisor after the security update:
-- 1. The permission checks used by row-level security and Realtime's private channels don't need to be callable by
--    signed-out visitors. Signed-in users keep them: Realtime runs these checks as the person joining a channel, so
--    removing them would switch off live editing. They only ever answer about the person asking.
revoke execute on function is_staff() from public, anon;
revoke execute on function is_admin() from public, anon;
revoke execute on function is_member(uuid) from public, anon;
revoke execute on function can_open_app_file(text) from public, anon;
grant execute on function is_staff() to authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function is_member(uuid) to authenticated;
grant execute on function can_open_app_file(text) to authenticated;
-- 2. Pin the timestamp trigger function to the public schema
alter function touch_updated_at() set search_path = public;
