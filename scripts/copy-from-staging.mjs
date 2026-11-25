// Copies one project from the staging site to the live platform: the reverse of seed-staging.mjs, for a project
// that was made on staging (Lost Property's own brand, to start). It only READS from staging and only ADDS to live:
// if live already has a project with the same address or id, it stops without writing anything.
//
//   SOURCE_SUPABASE_URL=… SOURCE_SUPABASE_SERVICE_KEY=…      (staging, read only)
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…     (live)
//   node scripts/copy-from-staging.mjs <project slug> --check   (says what it would copy; writes nothing)
//   node scripts/copy-from-staging.mjs <project slug>           (copies it)
//
// What comes across: the project (as a draft, so clients see nothing until it's published on live), its guideline
// history, published versions, kit files and parts, tools, scans and review answers, Director videos, the apps' files
// (Writer docs and the rest), and every stored file under the project. What stays behind: people (members, invites,
// activity), conversations, requests, AI usage, release stages (live's defaults apply) and any AI key. See
// docs/STAGING.md.
import { createClient } from '@supabase/supabase-js';

const slug = process.argv[2];
const check = process.argv.includes('--check');
if (!slug || slug.startsWith('--')) { console.error('Usage: node scripts/copy-from-staging.mjs <project slug> [--check]'); process.exit(1); }
const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Missing ${k}. See docs/STAGING.md.`); process.exit(1); } return v; };
const srcUrl = need('SOURCE_SUPABASE_URL'), dstUrl = need('NEXT_PUBLIC_SUPABASE_URL');
if (new URL(srcUrl).host === new URL(dstUrl).host) { console.error('Staging and live are the same database. Stopping.'); process.exit(1); }
const src = createClient(srcUrl, need('SOURCE_SUPABASE_SERVICE_KEY'), { auth: { persistSession: false } });
const dst = createClient(dstUrl, need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// People on staging aren't the same accounts as on live, so links to them are cleared
const PEOPLE = ['created_by', 'updated_by', 'author', 'answered_by', 'published_by', 'user_id', 'last_edited_by'];
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
// Adds rows to live. insert, never upsert: nothing already on live is changed
async function add(table, list) {
  if (!list.length) return;
  if (check) { console.log(`  ${table}: ${list.length} to copy`); return; }
  for (let i = 0; i < list.length; i += 200) {
    const { error } = await dst.from(table).insert(list.slice(i, i + 200).map(clean));
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
  if (check) return true;
  const { data, error } = await src.storage.from(bucket).download(path);
  if (error || !data) return false;
  // upsert: false, so a file already on live is never replaced
  const { error: e2 } = await dst.storage.from(bucket).upload(path, data, { upsert: false, contentType: data.type || undefined });
  return !e2 || /exists/i.test(e2.message);
}

const { data: project, error } = await src.from('projects').select('*').eq('slug', slug).maybeSingle();
if (error) { console.error(`Couldn't read staging: ${error.message}. Check SOURCE_SUPABASE_URL and SOURCE_SUPABASE_SERVICE_KEY.`); process.exit(1); }
if (!project) {
  const { data: all } = await src.from('projects').select('slug, client, name').order('client');
  console.error(`No project called “${slug}” on staging. The projects there are:`);
  for (const p of all || []) console.error(`  ${p.slug}   (${p.client} · ${p.name})`);
  process.exit(1);
}
// Never touch a project live already has
const { data: clash, error: e3 } = await dst.from('projects').select('id, slug, client').or(`slug.eq.${slug},id.eq.${project.id}`);
if (e3) { console.error(`Couldn't read live: ${e3.message}. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`); process.exit(1); }
if (clash?.length) {
  console.error(`Live already has ${clash.map((c) => `“${c.client}” at /${c.slug}`).join(' and ')}. Nothing was copied.`);
  console.error('To bring the staging one over anyway, first change the live project’s address (Settings → Portal address) or delete it, then run this again.');
  process.exit(1);
}

const pid = project.id;
console.log(`${check ? 'Checking' : 'Copying'} ${project.client} (${slug}) from staging to live…`);
await add('projects', [{ ...project, status: 'draft', ai_provider: null, ai_key_cipher: null, ai_key_hint: null, mcp_token_hash: null, repo_full_name: null }]);
const byProject = async (table) => rows(table, 'project_id', [pid]);
const parts = await byProject('deliverable_parts');
const scans = await byProject('scans');
await add('project_versions', await byProject('project_versions'));
await add('guide_versions', await byProject('guide_versions'));
await add('deliverable_parts', parts);
await add('deliverable_files', await rows('deliverable_files', 'part_id', parts.map((p) => p.id)));
await add('scans', scans);
await add('review_items', await rows('review_items', 'scan_id', scans.map((s) => s.id)));
await add('kb_entries', await byProject('kb_entries'));
await add('tools', await byProject('tools'));
await add('creations', await byProject('creations'));
await add('director_files', await byProject('director_files'));
await add('app_files', (await byProject('app_files')).map((f) => ({ ...f, members: [] })));

// Files: everything stored under the project, plus any path the rows point to elsewhere
const referenced = new Set();
const scan = (v) => { if (typeof v === 'string') { if (/^[\w-]+\/[\w./ -]+\.\w{2,5}$/.test(v) && v.length < 400) referenced.add(v); } else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
const { data: kitFiles } = await src.from('deliverable_files').select('storage_path').in('part_id', parts.map((p) => p.id));
(kitFiles || []).forEach((f) => f.storage_path && referenced.add(f.storage_path));
scan(project.content); scan(project.brand);
let copied = 0, missed = 0;
const done = new Set();
for (const bucket of BUCKETS) {
  const { data: top } = await src.storage.from(bucket).list('', { limit: 1000 });
  const prefixes = [pid, ...(top || []).filter((f) => !f.id && f.name !== pid).map((f) => `${f.name}/${pid}`)];
  let n = 0;
  for (const prefix of prefixes) for (const p of await listAll(bucket, prefix)) { if (await copyFile(bucket, p)) { copied++; n++; done.add(p); } else missed++; }
  console.log(`  ${bucket}: ${n} files${check ? ' to copy' : ''}`);
}
let extra = 0;
for (const p of referenced) {
  if (done.has(p)) continue;
  if (check) { extra++; continue; }
  let ok = false;
  for (const bucket of BUCKETS) if (await copyFile(bucket, p)) { ok = true; break; }
  ok ? (copied++, extra++) : missed++;
}
if (extra) console.log(`  other referenced files: ${extra}${check ? ' (some may be text that only looks like a file name)' : ''}`);
if (check) { console.log('Check done: nothing was written. Run it again without --check to copy.'); process.exit(0); }
console.log(`Done: ${copied} files copied${missed ? `, ${missed} not found (usually fine: text that only looks like a file name)` : ''}.`);
console.log(`It's on live as a draft. In the studio, open ${project.client}, check it, build the kit (Settings → Brand kit), then Publish.`);
