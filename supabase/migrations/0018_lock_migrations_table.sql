-- The deploy's own record of which migrations have run (_migrations, made by scripts/migrate.mjs) sat in the public
-- schema without row-level security, so anyone with the public anon key could read, add or delete its rows: enough
-- to make a deploy skip a future migration or re-run an old one. Lock it: only the deploy's own connection uses it.
alter table if exists _migrations enable row level security;
revoke all on table _migrations from anon, authenticated;
