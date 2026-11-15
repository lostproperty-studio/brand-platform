// Copies one client project from the live platform into the staging site, so the new portal can be tried with real
// brand content. It only READS from live and only WRITES to staging. Run it again any time to refresh the copy.
//
//   SOURCE_SUPABASE_URL=… SOURCE_SUPABASE_SERVICE_KEY=…      (live, read only)
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…     (staging)
//   node scripts/seed-staging.mjs tileyard
//
// What comes across: the project, its published versions, guideline history, kit files and parts, tools, the
// studio's scans and review answers, release stages, Director videos, and every stored file under the project
// (logos, fonts, previews, showcase media, tool pages). What stays behind: people (members, invites, activity),
// conversations, requests, AI usage, and the client's encrypted AI key.
import { createClient } from '@supabase/supabase-js';

const slug = process.argv[2];
if (!slug) { console.error('Usage: node scripts/seed-staging.mjs <project slug>'); process.exit(1); }
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}. See docs/STAGING.md.`); process.exit(1); } return v; };
const srcUrl = need('SOURCE_SUPABASE_URL'), dstUrl = need('NEXT_PUBLIC_SUPABASE_URL');
if (new URL(srcUrl).host === new URL(dstUrl).host) { console.error('The source and staging databases are the same. Stopping, so live is never written to.'); process.exit(1); }
const src = createClient(srcUrl, need('SOURCE_SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } });
const dst = createClient(dstUrl, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// People don't exist on staging, so links to them are cleared
const PEOPLE = ['created_by', 'updated_by', 'author', 'answered_by', 'published_by', 'user_id'];
const clean = (row) => { const r = { ...row }; for (const k of Object.keys(r)) if (PEOPLE.includes(k) || k.endsWith('_by')) r[k] = null; return r; };
const BUCKETS = ['kits', 'previews', 'uploads'];

async function rows(table, col, ids) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await src.from(table).select('*').in(col, ids.slice(i, i + 200));
    if (error) { console.log(`  ${table}: skipped (${error.message})`); return []; }
    out.push(...data);
  }
  return out;
}
async function put(table, list, key = 'id') {
  if (!list.length) return;
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await dst.from(table).upsert(list.slice(i, i + 200).map(clean), { onConflict: key });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  console.log(`  ${table}: ${list.length}`);
}

async function listAll(bucket, prefix) {
  const out = [];
  const walk = async (p) => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await src.storage.from(bucket).list(p, { limit: 1000, offset });
      if (error || !data?.length) return;
      for (const f of data) { const path = p ? `${p}/${f.name}` : f.name; if (f.id) out.push(path); else await walk(path); }
      if (data.length < 1000) return;
    }
  };
  await walk(prefix);
  return out;
}
async function copyFile(bucket, path) {
  const { data, error } = await src.storage.from(bucket).download(path);
  if (error || !data) return false;
  const { error: e2 } = await dst.storage.from(bucket).upload(path, data, { upsert: true, contentType: data.type || undefined });
  return !e2;
}

const { data: project, error } = await src.from('projects').select('*').eq('slug', slug).maybeSingle();
if (error) { console.error(`Couldn't read live: ${error.message}. Check SOURCE_SUPABASE_URL and SOURCE_SUPABASE_SERVICE_KEY.`); process.exit(1); }
if (!project) {
  const { data: all } = await src.from('projects').select('slug, client, name').order('client');
  console.error(`No project called “${slug}” on live. The projects there are:`);
  for (const p of all || []) console.error(`  ${p.slug}   (${p.client} · ${p.name})`);
  console.error('Run it again with the right one at the end of the line.');
  process.exit(1);
}
const pid = project.id;
console.log(`Copying ${project.client} (${slug}) to staging…`);

// The project itself, without the client's AI key (staging uses the studio key)
await put('projects', [{ ...project, ai_provider: null, ai_key_cipher: null, ai_key_hint: null, mcp_token_hash: null }]);
const byProject = async (table) => rows(table, 'project_id', [pid]);
const parts = await byProject('deliverable_parts');
const scans = await byProject('scans');
await put('project_versions', await byProject('project_versions'));
await put('guide_versions', await byProject('guide_versions'));
await put('deliverable_parts', parts);
await put('deliverable_files', await rows('deliverable_files', 'part_id', parts.map((p) => p.id)));
await put('scans', scans);
await put('review_items', await rows('review_items', 'scan_id', scans.map((s) => s.id)));
await put('kb_entries', await byProject('kb_entries'));
await put('tools', await byProject('tools'));
await put('creations', await byProject('creations'));
await put('project_features', await byProject('project_features'), 'project_id,feature');
await put('director_files', await byProject('director_files'));

// Files: everything stored under the project, plus any path the rows point to elsewhere
const referenced = new Set();
const scan = (v) => { if (typeof v === 'string') { if (/^[\w-]+\/[\w./ -]+\.\w{2,5}$/.test(v) && v.length < 400) referenced.add(v); } else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
const { data: kitFiles } = await src.from('deliverable_files').select('storage_path').in('part_id', parts.map((p) => p.id));
(kitFiles || []).forEach((f) => f.storage_path && referenced.add(f.storage_path));
scan(project.content); scan(project.brand); scan(project.showcase);
let copied = 0, missed = 0;
const done = new Set();
// 1. Every folder that belongs to the project: <id>/… and <anything>/<id>/… (fonts/<id>, tools/<id>, …)
for (const bucket of BUCKETS) {
  const { data: top } = await src.storage.from(bucket).list('', { limit: 1000 });
  const prefixes = [pid, ...(top || []).filter((f) => !f.id && f.name !== pid).map((f) => `${f.name}/${pid}`)];
  let n = 0;
  for (const prefix of prefixes) for (const p of await listAll(bucket, prefix)) { if ((await copyFile(bucket, p))) { copied++; n++; done.add(p); } else missed++; }
  console.log(`  ${bucket}: ${n} files`);
}
// 2. Anything else the project points to, from whichever folder holds it
let extra = 0;
for (const p of referenced) {
  if (done.has(p)) continue;
  let ok = false;
  for (const bucket of BUCKETS) if (await copyFile(bucket, p)) { ok = true; break; }
  ok ? (copied++, extra++) : missed++;
}
if (extra) console.log(`  other referenced files: ${extra}`);
console.log(`Done: ${copied} files copied${missed ? `, ${missed} not found (usually fine: text that only looks like a file name)` : ''}.`);
console.log(`Open ${process.env.NEXT_PUBLIC_APP_URL || 'the staging site'}/p/${slug} and sign in with your studio email.`);
