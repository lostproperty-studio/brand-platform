-- The studio's tables are read and written by the platform's server only (with the service role, which bypasses
-- row-level security). Policies that let any staff member read and write them directly over Supabase's public API
-- let someone skip the app's per-project team roles (add themselves as a project lead, delete a project, change
-- studio settings), so they go. RLS stays on, so with no policy the public roles get nothing.
-- Kept: the policies that let a client read their own project data, and Realtime's private-channel policies (which
-- live in the realtime schema, not here).
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ 'is_(staff|admin)\(' or coalesce(with_check, '') ~ 'is_(staff|admin)\(')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Sensitive columns: the column-level revoke in 0001 had no effect while the table-level grant stood
revoke select on table projects from anon;
