// Applies new SQL files in supabase/migrations to the database on each deploy, in order, once each.
// Uses the connection string the Vercel Supabase integration provides. Skips quietly when there isn't one (local builds).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

// Release gate: only production deploys (main) change the live database. Preview and staging deploys skip
// migrations unless MIGRATE_ON_PREVIEW=1 is set for that environment, which should only be done when it points at a
// separate staging database. See RELEASING.md.
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' && process.env.MIGRATE_ON_PREVIEW !== '1') {
  console.log(`[migrate] ${process.env.VERCEL_ENV} deploy: skipping migrations (set MIGRATE_ON_PREVIEW=1 with a staging database to apply them).`);
  process.exit(0);
}
const raw = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!raw) { console.log('[migrate] No database URL; skipping.'); process.exit(0); }
const url = new URL(raw);
url.searchParams.delete('sslmode'); url.searchParams.delete('supa'); url.searchParams.delete('pgbouncer');
const dir = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

async function connect() {
  // Direct connection first; fall back to the pooler (build machines may not reach the direct host)
  for (const u of [raw === process.env.POSTGRES_URL_NON_POOLING ? url.toString() : null, process.env.POSTGRES_URL ? (() => { const x = new URL(process.env.POSTGRES_URL); ['sslmode', 'supa', 'pgbouncer'].forEach((k) => x.searchParams.delete(k)); return x.toString(); })() : null].filter(Boolean)) {
    const c = new pg.Client({ connectionString: u, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
    try { await c.connect(); return c; } catch (e) { console.log('[migrate] Connection failed, trying the next option:', e.message); }
  }
  throw new Error('Could not connect to the database');
}

let db;
try { db = await connect(); } catch (e) {
  // Don't block the deploy if the database can't be reached from the build; /api/health reports pending migrations
  console.warn('[migrate] WARNING: could not reach the database, migrations not applied:', e.message);
  process.exit(0);
}
try {
  await db.query('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())');
  const { rows } = await db.query('select name from _migrations');
  const done = new Set(rows.map((r) => r.name));
  // The first two were applied by hand in the Supabase SQL editor: record them if their tables exist
  if (!done.size) {
    const t = await db.query("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('projects', 'tools')");
    const have = new Set(t.rows.map((r) => r.table_name));
    for (const [f, table] of [['0001_init.sql', 'projects'], ['0002_team_tools.sql', 'tools']]) if (have.has(table)) { await db.query('insert into _migrations (name) values ($1) on conflict do nothing', [f]); done.add(f); }
  }
  for (const f of files) {
    if (done.has(f)) continue;
    console.log('[migrate] Applying', f);
    await db.query(readFileSync(join(dir, f), 'utf8'));
    await db.query('insert into _migrations (name) values ($1)', [f]);
  }
  console.log('[migrate] Up to date.');
} finally { await db.end(); }
