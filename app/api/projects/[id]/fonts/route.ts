import { teamGate } from '@/lib/studioTeam';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { adminClient, requireStaff } from '@/lib/supabase/server';
import { FONT_MIME, parseFontFile, type FontFile, type ProjectFont } from '@/lib/fonts';
import { FONT_BUCKET, readFonts, signFontUrls, writeFonts } from '@/lib/projects/fonts';

// Typefaces for a project: list (with preview URLs), save names and usage, upload files, remove files.
// Uploading licensed files for a weight replaces the trial files for that same weight and style.

const MAX_BYTES = 4 * 1024 * 1024;
const respond = async (fonts: ProjectFont[]) => NextResponse.json({ fonts, urls: await signFontUrls(fonts) });

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'viewer', 'typefaces'); if (gate) return gate; }
  return respond((await readFonts(id)).fonts);
}

// Save the list of typefaces (roles, usage labels, family names, licence notes). Files are kept as stored.
const Meta = z.object({ fonts: z.array(z.object({ role: z.string().min(1).max(40), label: z.string().max(60), name: z.string().max(120), licenceNote: z.string().max(400).optional() })).max(8) });
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'typefaces'); if (gate) return gate; }
  const b = Meta.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { fonts, brand } = await readFonts(id);
  const byRole = new Map(fonts.map((f) => [f.role, f]));
  const next = b.data.fonts.map((m) => ({ ...m, files: byRole.get(m.role)?.files || [] }));
  // Files on a removed typeface are deleted from storage too
  const dropped = fonts.filter((f) => !next.some((n) => n.role === f.role)).flatMap((f) => f.files.map((x) => x.path));
  if (dropped.length) await adminClient().storage.from(FONT_BUCKET).remove(dropped);
  await writeFonts(id, brand, next);
  return respond(next);
}

// Upload: multipart form with role, licence (trial | licensed) and one or more files.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'typefaces'); if (gate) return gate; }
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Send the files as a form upload.' }, { status: 400 });
  const role = String(form.get('role') || '');
  const licence = form.get('licence') === 'licensed' ? 'licensed' : 'trial';
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  const { fonts, brand } = await readFonts(id);
  const font = fonts.find((f) => f.role === role);
  if (!font) return NextResponse.json({ error: 'Save the typeface first, then add its files.' }, { status: 400 });
  if (!files.length) return NextResponse.json({ error: 'No files received.' }, { status: 400 });

  const sb = adminClient();
  const added: FontFile[] = [];
  const problems: string[] = [];
  for (const file of files) {
    const meta = parseFontFile(file.name);
    if (!meta.format) { problems.push(`${file.name}: use .woff2, .woff, .otf or .ttf`); continue; }
    if (file.size > MAX_BYTES) { problems.push(`${file.name}: larger than 4 MB`); continue; }
    const path = `fonts/${id}/${role}/${randomUUID().slice(0, 8)}-${file.name.replace(/[^\w.-]+/g, '-')}`;
    const { error } = await sb.storage.from(FONT_BUCKET).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: FONT_MIME[meta.format], upsert: false });
    if (error) { problems.push(`${file.name}: ${error.message}`); continue; }
    // A file named "...Trial..." is kept as trial even if uploaded as licensed, so it can't reach the kit by mistake.
    const fileLicence = meta.looksTrial ? 'trial' : licence;
    if (fileLicence !== licence) problems.push(`${file.name} looks like a trial file, so it's marked Trial. Switch it if that's wrong.`);
    added.push({ path, name: file.name, weight: meta.weight, style: meta.style, format: meta.format, licence: fileLicence, bytes: file.size, uploaded_at: new Date().toISOString() });
  }

  let replaced: FontFile[] = [];
  if (licence === 'licensed' && added.length) {
    const faces = new Set(added.filter((a) => a.licence === 'licensed').map((a) => `${a.weight}-${a.style}`));
    replaced = font.files.filter((x) => x.licence === 'trial' && faces.has(`${x.weight}-${x.style}`));
    if (replaced.length) await sb.storage.from(FONT_BUCKET).remove(replaced.map((x) => x.path));
  }
  font.files = [...font.files.filter((x) => !replaced.includes(x)), ...added].sort((a, b) => a.weight - b.weight || a.style.localeCompare(b.style));
  await writeFonts(id, brand, fonts);
  const res = await respond(fonts);
  const body = await res.json();
  return NextResponse.json({ ...body, problems, replaced: replaced.length }, { status: added.length ? 200 : 400 });
}

// Change one file's licence state, or remove it.
const FilePatch = z.object({ role: z.string(), path: z.string(), licence: z.enum(['trial', 'licensed']).optional(), weight: z.number().int().min(100).max(900).optional(), style: z.enum(['normal', 'italic']).optional() });
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'typefaces'); if (gate) return gate; }
  const b = FilePatch.safeParse(await req.json().catch(() => ({})));
  if (!b.success) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { fonts, brand } = await readFonts(id);
  const file = fonts.find((f) => f.role === b.data.role)?.files.find((x) => x.path === b.data.path);
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  if (b.data.licence) file.licence = b.data.licence;
  if (b.data.weight) file.weight = b.data.weight;
  if (b.data.style) file.style = b.data.style;
  await writeFonts(id, brand, fonts);
  return respond(fonts);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const st = await requireStaff(); if (st instanceof Response) return st;
  const { id } = await ctx.params;
  { const gate = await teamGate(id, st, 'editor', 'typefaces'); if (gate) return gate; }
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role'), path = searchParams.get('path');
  const { fonts, brand } = await readFonts(id);
  const font = fonts.find((f) => f.role === role);
  if (!font || !path || !font.files.some((x) => x.path === path)) return NextResponse.json({ error: 'File not found' }, { status: 404 });
  await adminClient().storage.from(FONT_BUCKET).remove([path]);
  font.files = font.files.filter((x) => x.path !== path);
  await writeFonts(id, brand, fonts);
  return respond(fonts);
}
