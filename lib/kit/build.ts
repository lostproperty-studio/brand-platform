// Builds the kit of parts from a project: open, standard files any tool or person can use.
// Output is a flat list of files (path → content) that is committed to the project's repository
// and copied to storage for portal downloads.

export type Colour = { name: string; hex: string; role: string };
export type Font = { role: 'display' | 'body' | 'caption'; name: string; usage: string; weight: string; size?: number; lineHeight?: string; tracking?: string; textCase?: string; licence?: string };
export type Rule = { chapter: string; title: string; text: string; why?: string; wrong?: string[] };
export type AssetFile = { path: string; nodeId: string; format: 'svg' | 'png'; description: string; bytes?: Uint8Array };
export type KitInput = {
  client: string; slug: string; version: string; line: string; portalUrl: string;
  colours: Colour[]; fonts: Font[]; rules: Rule[]; assets: AssetFile[];
  spacing?: Record<string, number>; templates: string[]; figmaUrl?: string;
};
export type KitFile = { path: string; content: string | Uint8Array; part: 'assets' | 'tokens' | 'guidelines' | 'templates' | 'reference' | 'root' };

const CHAPTER_FILES: Record<string, [string, string]> = {
  logo: ['01-logo.md', 'Logo'], type: ['02-typography.md', 'Typography'], colour: ['03-colour.md', 'Colour'],
  layout: ['04-layout.md', 'Grid and layout'], imagery: ['05-imagery.md', 'Imagery'], voice: ['06-tone-of-voice.md', 'Tone of voice']
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function tokens(input: KitInput) {
  // W3C Design Tokens Community Group format
  const color: Record<string, unknown> = {};
  for (const c of input.colours) color[slugify(c.name) || slugify(c.role)] = { $type: 'color', $value: c.hex, $description: c.role };
  const font: Record<string, unknown> = {};
  for (const f of input.fonts) {
    font[f.role] = {
      family: { $type: 'fontFamily', $value: [f.name, f.role === 'body' ? 'sans-serif' : 'sans-serif'] },
      weight: { $type: 'fontWeight', $value: f.weight },
      ...(f.size ? { size: { $type: 'dimension', $value: { value: f.size, unit: 'px' } } } : {}),
      ...(f.lineHeight ? { lineHeight: { $type: 'number', $value: parseFloat(f.lineHeight) / 100 } } : {}),
      ...(f.tracking ? { letterSpacing: { $type: 'dimension', $value: { value: parseFloat(f.tracking) / 100, unit: 'em' } } } : {}),
      $description: f.usage + (f.textCase ? ` · ${f.textCase}` : '')
    };
  }
  const space: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input.spacing || { xs: 4, s: 8, m: 16, l: 32, xl: 64 })) space[k] = { $type: 'dimension', $value: { value: v, unit: 'px' } };
  return { $schema: 'https://www.designtokens.org/schemas/2025.10/format.json', $description: `${input.client} brand tokens v${input.version}`, color, font, space };
}

function cssVars(input: KitInput) {
  const lines = input.colours.map((c) => `  --color-${slugify(c.name) || slugify(c.role)}: ${c.hex};`);
  input.fonts.forEach((f) => lines.push(`  --font-${f.role}: '${f.name}', sans-serif;`));
  return `/* ${input.client} brand tokens v${input.version}. Generated from tokens/${input.slug}.tokens.json */\n:root {\n${lines.join('\n')}\n}\n`;
}

function guidelineMd(chapter: string, title: string, input: KitInput) {
  const rules = input.rules.filter((r) => r.chapter === chapter);
  const head = `# ${title}\n\n> ${input.client} brand guidelines v${input.version}. Rules are written to be measured and followed exactly. When a rule doesn’t cover a case, use its “Why” line to decide.\n`;
  if (!rules.length) return head + '\n_No rules recorded yet._\n';
  return head + rules.map((r, i) => {
    const out = [`\n## ${i + 1}. ${r.title}\n`, `**Rule:** ${r.text}`];
    if (r.why) out.push(`**Why:** ${r.why}`);
    if (r.wrong?.length) out.push('**Wrong:**\n' + r.wrong.map((w) => `- ✗ ${w}`).join('\n'));
    return out.join('\n\n');
  }).join('\n');
}

function agentsMd(input: KitInput) {
  return `# Instructions for AI tools

This repository is the master reference for the ${input.client} brand. Read it before producing anything on-brand.

1. Load \`tokens/${input.slug}.tokens.json\`. Use only these colours, fonts and spacing values. Never invent a colour.
2. Read the guideline files in \`guidelines/\` that apply to the task. Every rule is exact; follow numbers literally.
3. To make a layout, start from a template in \`templates/\`. Only change elements marked \`data-slot\`. Never move, resize or recolour the logo.
4. Use logo files from \`assets/logo/\` as supplied. Pick the version for the background as the logo rules say.
5. If a request breaks a rule, follow the rule and say which rule you followed.

Version ${input.version}. Changes are listed in CHANGELOG.md.
`;
}

function readme(input: KitInput) {
  const parts = ['assets/  — logos, icons, patterns, key imagery, fonts (with licence notes)', `tokens/  — ${input.slug}.tokens.json (W3C Design Tokens) and CSS variables`, 'guidelines/ — the rules, one Markdown file per topic', 'templates/ — HTML/CSS layouts with editable slots', 'reference/ — PDF snapshot; the web version is the client portal'];
  return `# ${input.client} brand kit\n\n${input.line}\n\nOne source of truth for the ${input.client} brand, for people and for AI tools. Open, standard files: nothing here needs a particular app.\n\n\`\`\`\n${parts.join('\n')}\n\`\`\`\n\n- Web version: ${input.portalUrl}\n- Using an AI tool? Point it at \`AGENTS.md\` first.\n- Version ${input.version}. Maintained by Lost Property.\n`;
}

const TEMPLATE_SIZES: Record<string, [number, number, string]> = {
  'social-post-4x5': [1080, 1350, 'Instagram post 4:5'], 'social-story-9x16': [1080, 1920, 'Instagram story 9:16'], 'social-landscape-1-91x1': [1200, 628, 'LinkedIn / X post'],
  'poster-a3': [1123, 1587, 'Poster A3 (96dpi)'], 'signage-panel': [1000, 1400, 'Signage panel'], 'brochure-spread-a4': [2245, 1587, 'Brochure spread A4'],
  'web-hero': [1440, 900, 'Web page hero'], 'email-header': [600, 240, 'Email header'], 'slide-16x9': [1920, 1080, 'Presentation slide']
};

function templateHtml(id: string, input: KitInput) {
  const [w, h, label] = TEMPLATE_SIZES[id] || [1080, 1350, id];
  const lead = input.colours[0]?.hex || '#333333';
  const light = input.colours[2]?.hex || '#FAFAFA';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${input.client} · ${label}</title>
<!-- ${label}, ${w} × ${h}px. Logo, grid and type are locked. Edit only elements with data-slot. -->
<link rel="stylesheet" href="../../tokens/${input.slug}.css">
<style>
  html, body { margin: 0; }
  .canvas { width: ${w}px; height: ${h}px; position: relative; overflow: hidden; background: var(--color-${slugify(input.colours[2]?.name || 'light')}, ${light}); color: ${lead}; font-family: var(--font-body); }
  .image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .8; }
  .logo { position: absolute; top: ${Math.round(h * 0.05)}px; left: ${Math.round(w * 0.05)}px; width: ${Math.round(w * 0.22)}px; }
  .copy { position: absolute; left: ${Math.round(w * 0.05)}px; right: ${Math.round(w * 0.05)}px; bottom: ${Math.round(h * 0.06)}px; display: flex; flex-direction: column; gap: ${Math.round(h * 0.012)}px; }
  .headline { font-family: var(--font-display); font-size: ${Math.round(w * 0.075)}px; line-height: .95; margin: 0; text-transform: lowercase; }
  .eyebrow { font-family: var(--font-caption); font-size: ${Math.max(11, Math.round(w * 0.012))}px; letter-spacing: .2em; text-transform: uppercase; }
</style>
</head>
<body>
<div class="canvas">
  <img class="image" data-slot="image" src="../../assets/imagery/placeholder.jpg" alt="">
  <img class="logo" src="../../assets/logo/${input.slug}-logo-horizontal-dark.svg" alt="${input.client}">
  <div class="copy">
    <span class="eyebrow" data-slot="eyebrow">Eyebrow</span>
    <h1 class="headline" data-slot="headline">headline in two lines</h1>
  </div>
</div>
</body>
</html>
`;
}

export function buildKit(input: KitInput): KitFile[] {
  const files: KitFile[] = [];
  files.push({ path: 'README.md', content: readme(input), part: 'root' });
  files.push({ path: 'AGENTS.md', content: agentsMd(input), part: 'guidelines' });
  files.push({ path: 'CHANGELOG.md', content: `# Changelog\n\n## ${input.version}\n\n- First release, generated from ${input.figmaUrl || 'the Figma file'}.\n`, part: 'root' });
  files.push({ path: `tokens/${input.slug}.tokens.json`, content: JSON.stringify(tokens(input), null, 2) + '\n', part: 'tokens' });
  files.push({ path: `tokens/${input.slug}.css`, content: cssVars(input), part: 'tokens' });
  for (const [chapter, [file, title]] of Object.entries(CHAPTER_FILES)) files.push({ path: `guidelines/${file}`, content: guidelineMd(chapter, title, input), part: 'guidelines' });
  for (const t of input.templates) files.push({ path: `templates/${t}/index.html`, content: templateHtml(t, input), part: 'templates' });
  files.push({ path: 'assets/manifest.json', content: JSON.stringify(input.assets.map((a) => ({ path: a.path, format: a.format, description: a.description, figmaNode: a.nodeId })), null, 2) + '\n', part: 'assets' });
  for (const a of input.assets) if (a.bytes) files.push({ path: a.path, content: a.bytes, part: 'assets' });
  files.push({ path: 'assets/fonts/LICENCE.md', content: `# Fonts\n\n${input.fonts.map((f) => `- **${f.name}** (${f.usage}): ${f.licence || 'Licence to be confirmed. Not included until confirmed.'}`).join('\n')}\n`, part: 'assets' });
  return files;
}
