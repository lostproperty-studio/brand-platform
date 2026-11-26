-- Rate limits: a counter per key (e.g. 'signin:email:<address>', 'ai:user:<id>') that resets after its window.
-- hit_rate_limit counts and checks in one statement, so simultaneous requests can't slip past the limit.
-- Server only: row-level security on with no policies, and no access for the public roles.
create table if not exists rate_limits (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null
);
alter table rate_limits enable row level security;
revoke all on table rate_limits from anon, authenticated;

create or replace function hit_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into rate_limits as r (key, count, reset_at) values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count = case when r.reset_at <= now() then 1 else r.count + 1 end,
    reset_at = case when r.reset_at <= now() then now() + make_interval(secs => p_window_seconds) else r.reset_at end
  returning count into n;
  return n <= p_limit;
end $$;
revoke all on function hit_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Old counters are cleared now and then by the app (see lib/rateLimit.ts)
create index if not exists rate_limits_reset on rate_limits (reset_at);
