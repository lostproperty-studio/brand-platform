import type { Snapshot } from '@/lib/ai/project';
import { voiceHas, voiceMd, VOICE_GUARD } from '@/lib/voice';
import { knowledgeMd } from '@/lib/voiceKnowledge';
import { itemEls, type Block } from '@/lib/figma/blocks';
import type { GuideChapter } from '@/lib/portal/guide';
import { blockGaps, isPlaceholder, kitGaps, sectionName } from '@/lib/mcp/gaps';
import { imageBlock, type Kit, type KitImage } from '@/lib/mcp/kit';

// Route 3: each kit is offered as a connector the client adds to their own Claude.
// Tools are read-only views of the published kit. Results are MCP content blocks: text, and images sent through the
// connector itself (the client's sandbox may not reach any outside address, ours included).

export const INSTRUCTIONS = (client: string) => `Read-only access to the published ${client} brand kit, set by Lost Property. Work in this order:
1. get_brand_overview: the brand, its chapters and what's in the kit.
2. get_guideline for each chapter you need: its rules and sections, with the chapter's images shown inline. Look at the images; they show the rules in use.
3. get_tokens for exact values: colours, each typeface's weights and the text style (weight, size, leading, tracking) for every kind of text.
4. get_voice before writing any copy.
5. list_assets (logos, icons, graphics), list_images (brand photography and imagery from the guidelines and showcase) and get_image to see any of them; list_templates and get_template for layouts.
Follow the rules exactly. Where a point says "not written yet", the guidelines don't cover it: say so and suggest asking Lost Property; never fill the gap with your own spec. Links are stable and need no sign-in; if your environment can't open them, use get_image instead.`;

export const TOOLS = [
  { name: 'get_brand_overview', description: 'Summary of the brand: line, chapters (with how many images and unfinished points each), colours, typefaces, deliverables and what the kit holds. Call this first.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_guideline', description: 'One chapter of the guidelines, e.g. "Logo", "Colour", "Typography", "Imagery", "Tone of voice": its rules and sections as text, plus the chapter\'s example images inline (up to 6; the rest by id for get_image). Points the studio hasn\'t written yet are marked "not written yet": don\'t invent them.', inputSchema: { type: 'object', properties: { chapter: { type: 'string', description: 'Chapter title or part of it' }, include_images: { type: 'boolean', description: 'Send the chapter\'s images inline (default true)' } }, required: ['chapter'] } },
  { name: 'get_tokens', description: 'Design tokens (W3C format): colours; each typeface with the weights it comes in and when to use each; text styles h1 to caption with font, weight, size, leading and tracking; spacing; and where font files come from.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_voice', description: 'How the brand writes: personality, verbal behaviours, words to use and avoid, house style, formats, key messages and on/off-brand examples, set by Lost Property. Call this before writing or reviewing any copy, and follow it strictly.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_assets', description: 'Logo, icon, pattern and graphic files in the kit, each with a stable download link. Pictures can be viewed with get_image (id is the path).', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_images', description: 'Brand photography and imagery from the published guidelines and showcase: id, name or caption, chapter and section, size and a stable link. View any with get_image.', inputSchema: { type: 'object', properties: { chapter: { type: 'string', description: 'Only images from this chapter (optional)' } } } },
  { name: 'get_image', description: 'Shows one image or asset through the connector (resized to at most 1600px), by the id from list_images, list_assets or get_guideline.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'list_templates', description: 'Layout templates in the kit: id, name and status.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_template', description: 'HTML/CSS of a layout template, by id from list_templates. Only elements with data-slot may be changed.', inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'e.g. social-post-4x5' } }, required: ['id'] } }
] as const;

export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
const text = (t: string): Content[] => [{ type: 'text', text: t }];
const json = (x: unknown): Content[] => text(JSON.stringify(x, null, 1));

const MAX_IMAGES = 6;
const MAX_BYTES = 6_000_000; // base64 characters across one result
const STATUS: Record<string, string> = { ready: 'ready', in_review: 'in review', in_production: 'in production, not available yet', not_in_scope: 'not in scope' };
const NOT_WRITTEN = 'not written yet (the guidelines don\'t cover this point; don\'t invent it, ask Lost Property)';

const findChapter = (s: Snapshot, q: string) => { const l = q.toLowerCase().trim(); return s.chapters.find((x) => x.id === q || x.title.toLowerCase() === l) || s.chapters.find((x) => x.title.toLowerCase().includes(l) || (l.length > 2 && l.includes(x.title.toLowerCase()))); };
const real = (t?: string) => (t && !isPlaceholder(t) ? t.trim() : undefined);
const imageLine = (x: KitImage) => `- ${x.id}: ${x.name}${x.caption && x.caption !== x.name ? ` (${x.caption})` : ''}${x.kind === 'page' ? ' [the guideline page as designed]' : ''}${x.video ? ' [video, link only]' : ''} · ${x.url}`;

/** A section of the guide as text: headline, introduction, frames, colours; unwritten points marked as such */
function sectionMd(b: Block, i: number, imgs: KitImage[]) {
  const out: string[] = [`### ${sectionName(b, i).replace(/[“”]/g, '')}`];
  if (real(b.eyebrow)) out.push(`_${real(b.eyebrow)}_`);
  if (real(b.body)) out.push(real(b.body)!);
  for (const x of b.extras || []) if (real(x.text) && x.kind !== 'button') out.push(real(x.text)!);
  (b.items || []).filter((it) => !it.hidden).forEach((it) => {
    const words = itemEls(it).filter((e) => !e.hidden && (e.kind === 'label' || e.kind === 'heading' || e.kind === 'text')).map((e) => real(e.text)).filter(Boolean) as string[];
    if (words.length) out.push(`- ${words.join(' · ')}`);
  });
  for (const s of b.swatches || []) if (real(s.name) && !(s.name.toLowerCase() === 'colour' && s.hex === '#000000')) out.push(`- Colour: ${s.name} ${s.hex}${s.note ? ` (${s.note})` : ''}`);
  const gaps = blockGaps(b, i);
  if (gaps.length) out.push(`- ${gaps.length === 1 ? 'One point' : `${gaps.length} points`} in this section: ${NOT_WRITTEN}.`);
  if (imgs.length) out.push(`Images: ${imgs.map((x) => x.id).join(', ')}`);
  return out.length > 1 ? out.join('\n') : '';
}

function chapterMd(s: Snapshot, c: { id: string; title: string; rules: { title: string; text: string }[] }, imgs: KitImage[]) {
  const g: GuideChapter | undefined = s.guide?.chapters.find((x) => x.id === c.id);
  const out = [`# ${c.title}`];
  if (!g) {
    // Older snapshots: the flattened rules only
    const rules = c.rules.filter((r) => !isPlaceholder(r.text));
    const gaps = c.rules.length - rules.length;
    out.push(...rules.map((r) => `- ${r.title}: ${r.text}`));
    if (gaps) out.push(`- ${gaps} more point${gaps === 1 ? '' : 's'}: ${NOT_WRITTEN}.`);
    return out.join('\n');
  }
  if (real(g.kicker) && g.kicker !== c.title) out.push(`_${g.kicker}_`);
  if (real(g.lede)) out.push(g.lede);
  const rules = (g.rules || []).filter((r) => real(r.text));
  if (rules.length) out.push('## Rules\n' + rules.map((r) => `- ${r.title}: ${r.text}`).join('\n'));
  const secs = g.blocks.map((b, i) => sectionMd(b, i, imgs.filter((x) => x.at === i))).filter(Boolean);
  if (secs.length) out.push('## Sections\n' + secs.join('\n\n'));
  if (!rules.length && !secs.length) out.push(`Nothing in this chapter yet: ${NOT_WRITTEN}.`);
  return out.join('\n\n');
}

/** Images as content blocks, each introduced by a line naming it, within the count and size limits */
async function imageBlocks(list: KitImage[]) {
  const want = list.filter((x) => !x.video).slice(0, MAX_IMAGES);
  const made = await Promise.all(want.map((x) => imageBlock(x).catch(() => null)));
  const out: Content[] = []; const sent: string[] = []; let bytes = 0;
  want.forEach((x, i) => { const b = made[i]; if (!b || bytes + b.data.length > MAX_BYTES) return; bytes += b.data.length; sent.push(x.id); out.push({ type: 'text', text: `${x.id}: ${x.name}${x.section ? ` (section: ${x.section})` : ''}` }, b); });
  return { out, sent };
}

export async function callTool(name: string, args: Record<string, unknown>, kit: Kit): Promise<Content[]> {
  const s = kit.snapshot;
  switch (name) {
    case 'get_brand_overview': {
      const gaps = kitGaps(s);
      return json({
        client: s.client, line: s.line,
        chapters: s.chapters.map((c) => ({ title: c.title, images: kit.images.filter((x) => x.chapter === c.title).length, notWrittenYet: gaps.find((g) => g.chapter === c.title)?.points.length || 0 })),
        voice: s.voice && voiceHas(s.voice) ? 'Call get_voice before writing any copy' : 'not set yet',
        colours: s.colours, fonts: s.fonts.map((f) => ({ ...f, weights: 'see get_tokens' })),
        deliverables: s.deliverables.map((d) => ({ title: d.title, status: STATUS[d.status] || d.status })),
        kit: { assets: kit.assets.length, images: kit.images.length, templates: kit.templates.length },
        next: 'get_guideline for each chapter (with its images), then get_tokens; list_assets, list_images and list_templates for files.'
      });
    }
    case 'get_voice': return text(s.voice && voiceHas(s.voice) ? `${voiceMd(s.client, s.voice)}\n\n${knowledgeMd(s.client, s.knowledge || [])}\n\n${VOICE_GUARD(s.client)}` : 'The voice has not been written up yet. Use the tone of voice chapter (get_guideline) and say the full voice is still to come.');
    case 'get_tokens': return json(kit.tokens);
    case 'get_guideline': {
      const c = findChapter(s, String(args.chapter || ''));
      if (!c) return text(`No chapter matches "${args.chapter}". Chapters: ${s.chapters.map((x) => x.title).join(', ')}`);
      const imgs = kit.images.filter((x) => x.chapter === c.title);
      const md = chapterMd(s, c, imgs);
      if (args.include_images === false || !imgs.length) return text(md + (imgs.length ? `\n\n## Images\n${imgs.map(imageLine).join('\n')}` : ''));
      // Pictures in the sections first, then the guideline pages as designed
      const ordered = [...imgs.filter((x) => x.kind !== 'page'), ...imgs.filter((x) => x.kind === 'page')];
      const { out, sent } = await imageBlocks(ordered);
      const rest = ordered.filter((x) => !sent.includes(x.id));
      return [{ type: 'text', text: md + `\n\n## Images\n${sent.length ? `${sent.length} shown below.` : 'None could be shown inline.'}${rest.length ? ` More (use get_image with the id):\n${rest.map(imageLine).join('\n')}` : ''}` }, ...out];
    }
    case 'list_assets': return json({ assets: kit.assets, imagery: kit.images.length ? `${kit.images.length} brand images (photography and imagery from the guidelines and showcase): call list_images.` : 'No brand imagery published yet.', fontFiles: kit.settings.shareFontFiles ? 'See get_tokens → font → files.' : 'Font files aren\'t shared through this connector; they are licensed by Lost Property. Ask Lost Property for the files or a licence.' });
    case 'list_images': {
      const q = String(args.chapter || '').toLowerCase().trim();
      const list = q ? kit.images.filter((x) => (x.chapter || '').toLowerCase().includes(q)) : kit.images;
      return json({ images: list.map(({ id, name, caption, chapter, section, kind, w, h, video, url }) => ({ id, name, caption, chapter, section, kind, size: w && h ? `${Math.round(w)}×${Math.round(h)}` : undefined, video, url })), note: list.length ? 'Use get_image with an id to see it.' : q ? `No images in a chapter matching "${args.chapter}".` : 'No brand imagery has been published yet.' });
    }
    case 'get_image': {
      const id = String(args.id || '').trim();
      const img = kit.findImage(id);
      if (!img) return text(`No image or asset with id "${id}". Use the ids from list_images, list_assets or get_guideline.`);
      if (img.video) return text(`${img.id} is a video, so it can't be shown here. Link: ${img.url}`);
      const b = await imageBlock(img).catch(() => null);
      return b ? [{ type: 'text', text: `${img.id}: ${img.name}${img.chapter ? ` (chapter: ${img.chapter}${img.section ? `, section: ${img.section}` : ''})` : ''}. Link: ${img.url}` }, b] : text(`Couldn't read ${img.id} as an image. Link: ${img.url}`);
    }
    case 'list_templates': {
      const part = kit.templatesPart;
      if (!kit.templates.length) return text(`No templates have been published in this kit yet${part ? ` (Templates: ${STATUS[part.status as string] || part.status})` : ''}. Work from the guidelines and tokens instead, and ask Lost Property if a template is needed.`);
      return json({ templates: kit.templates.map((t) => ({ id: t.id, name: t.name, status: STATUS[t.status] || t.status })), note: 'get_template with an id returns the HTML. A status other than ready means Lost Property hasn\'t signed it off yet.' });
    }
    case 'get_template': {
      const id = String(args.id || '');
      const t = await kit.template(id);
      if (t != null) return text(t);
      return text(kit.templates.length ? `No template "${id}". Templates in this kit: ${kit.templates.map((x) => `${x.id} (${x.name})`).join(', ')}.` : 'No templates have been published in this kit yet.');
    }
    default: throw new Error('Unknown tool ' + name);
  }
}
