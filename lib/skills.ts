import { aboutMd } from '@/lib/brandForm';
import type { Snapshot } from '@/lib/ai/project';
import type { ProjectFont } from '@/lib/fonts';
import { chapterText } from '@/lib/portal/guide';
import { aiRulesMd, watchoutsFrom } from '@/lib/aiRules';
import type { designSystemFiles } from '@/lib/designSystem';
import { voiceHas, voiceMd, VOICE_GUARD } from '@/lib/voice';
import { knowledgeMd } from '@/lib/voiceKnowledge';

type DS = ReturnType<typeof designSystemFiles>;

// Claude skills generated from a brand: each is a folder with SKILL.md, the brand reference, and the brand files,
// zipped so a client can upload it in Claude (Settings → Capabilities → Skills).

export const SKILLS = [
  { id: 'brand', icon: 'badge', title: 'Brand guidelines', blurb: 'The core skill: rules, colours, type, logos and tone of voice for anything on-brand.' },
  { id: 'presentations', icon: 'slides', title: 'Presentations', blurb: 'Builds slide decks (PowerPoint or HTML) with the brand’s layouts, type and logo rules.' },
  { id: 'documents', icon: 'doc', title: 'Documents', blurb: 'Reports, letters and one-pagers as Word or PDF, set in the brand typefaces.' },
  { id: 'social', icon: 'social', title: 'Social posts', blurb: 'Posts and stories at the right sizes, from the kit’s templates, in the brand voice.' },
  { id: 'writing', icon: 'pen', title: 'Writing', blurb: 'Headlines, body copy, captions and calls to action in the brand voice, and reviews of copy against it.' }
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];

const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brand';

/** The brand reference every skill carries: values first, then each chapter's rules and guidance. */
export function brandReference(snap: Snapshot, fonts: ProjectFont[], files: string[], aiDonts?: string[]) {
  const chapters = snap.guide?.chapters || [];
  const logos = files.filter((f) => f.startsWith('assets/logo/'));
  return `# ${snap.client} brand reference

${snap.line}

${aboutMd(snap.form)}## Colours
| Name | Hex | Use |
| --- | --- | --- |
${snap.colours.map((c) => `| ${c.name} | ${c.hex} | ${c.role || ''} |`).join('\n')}

## Typefaces
${fonts.filter((f) => f.name).map((f) => `- **${f.label || f.role}:** ${f.name}${f.files.some((x) => x.licence === 'licensed') ? ` (files in \`assets/fonts/\`)` : ' (not included: install it from the foundry, or use a close system fallback and say so)'}`).join('\n')}

## Logo files
${logos.length ? logos.map((l) => `- \`${l}\``).join('\n') : '- Not included in this version. Ask Lost Property for the logo files.'}

## Design tokens
${files.filter((f) => f.startsWith('tokens/')).map((f) => `- \`${f}\``).join('\n') || '- Not included.'}

${chapters.map((c) => {
    const rules = c.rules.map((r) => `- **${r.title}:** ${r.text}`).join('\n');
    const text = chapterText(c).filter((t) => t.length > 2).map((t) => t.replace(/\n+/g, ' ')).join('\n\n');
    return `## ${c.title}\n${rules ? `\n### Rules\n${rules}\n` : ''}${text ? `\n### Guidance\n${text}\n` : ''}`;
  }).join('\n')}

${snap.voice && voiceHas(snap.voice) ? voiceMd(snap.client, snap.voice) + '\n\n' : ''}${aiRulesMd({ client: snap.client, files, watchouts: watchoutsFrom(chapters.flatMap(chapterText)), donts: aiDonts, form: snap.form })}
`;
}

const COMMON = (client: string) => `Before producing anything, read \`reference/brand.md\`. It is the source of truth for the ${client} brand.

Hard rules:
- Use only the colours in the reference, by exact hex value. Never invent a colour or a tint the guidelines don't list.
- Use the brand typefaces. If a font file isn't included and isn't installed, use the closest system fallback and tell the user which font to install.
- Use the logo files in \`assets/logo/\` exactly as supplied. Never redraw, recolour, stretch, crop, or add effects to the logo. Pick the version the guidelines specify for the background.
- Follow every rule's numbers literally: logo positions and sizes, minimum sizes, contrast, line lengths.
- Follow the "Rules for AI" section at the end of the reference exactly. It is stricter than the guide on purpose.
- Write copy in the brand's tone of voice as described in the reference.
- If a request would break a rule, follow the rule and say briefly which rule you followed.
- When you finish, list the rules you applied in one or two lines so the user can check.`;

const WRITING = (client: string, has: boolean) => `# ${client} writing

Before writing anything, read \`reference/voice.md\`. It's the ${client} voice, set by Lost Property with ${client}, and the only source for how ${client} writes. \`reference/brand.md\` has the rest of the guidelines.
${has ? '' : '\nThe voice hasn\'t been written up yet. Follow the tone of voice chapter in the brand reference, and say that the full voice is still to come.\n'}
${VOICE_GUARD(client)}

## How to write
1. Work out the conditions, asking only if they really aren't clear: what it's for (web page, social post, email, ad, sign…), who it's for (use the audiences in the voice), how functional or expressive, how long, any character or word limit, and which parts are needed: headline, subheading, body, caption, call to action.
2. Unless asked for one, give three options that are genuinely different: different angles or structures, each on brand. Up to 20 if asked.
3. Label each part (Headline, Subheading, Body, Caption, Call to action) and make the parts work together as one piece. If only one part is asked for, write only that.
4. Keep to any limit exactly; count characters or words before you answer.
5. After each option, one short line on which principle or trait of the voice it leans on.

## How to review copy
- Say what's on brand and what isn't. For each thing that isn't, quote the exact words, name the rule from the voice, and give a fix in the voice.
- Check house style point by point: spelling, case, punctuation, numbers, banned words, the brand name.
- For an image or design with words on it, review the words against the voice and anything visual against the brand reference.`;

/** How this brand looks, from the design profile and the design system, written for one kind of skill */
function designNotes(ds: DS, id: SkillId) {
  const s = ds.spec;
  const st = (role: string) => { const x = s.roleStyle(role); return `${x.size}px / ${x.lineHeight}, weight ${x.weight}${x.tracking ? `, tracking ${x.tracking}em` : ''}${x.transform ? `, ${x.transform}` : x.upper ? ', uppercase' : ''} (\`--font-${x.family}\`)`; };
  const tok = (n: string) => s.colour.find((c) => c.name === n)!;
  const hex = (n: string) => { const v = tok(n).value; return typeof v === 'string' ? v : v.light; };
  const src = (x: (typeof s.provenance)[number]) => x.source.from === 'guidelines' ? `from "${x.source.chapter}"` : x.source.from === 'studio' ? 'set by Lost Property' : 'judgement';
  const qualities = s.provenance.filter((x) => !['dos', 'donts', 'devices'].includes(x.key)).map((x) => `- **${x.label}:** ${x.value} (${src(x)})`).join('\n');
  const scale = (k: number) => Math.round(s.roleStyle('display').size * k);
  const specific: Record<SkillId, string> = {
    writing: `Setting copy in a layout? Use the type styles above: headlines in the headline style, body in the body style.`,
    brand: `Building a web page, app screen or anything in code? Link \`design/tokens.css\` and \`design/brand.css\`, use the \`ds-\` classes, and start from the nearest layout in \`design/layouts.html\`. \`design/DESIGN.md\` is the full design spec.`,
    presentations: `## Slide layouts (from the design system)
Open \`design/layouts.html\` and match its two slides.
- **Title slide (1920 × 1080):** ${s.images.length ? 'a photo from `assets/imagery/` on the right 45%, ' : 'a palette colour field on the right 45%, '}the logo top-left, a short eyebrow in the caption style, the title in the display face at about ${scale(1.7)}px.
- **Content slide:** headline top-left at about ${Math.round(s.roleStyle('headline').size * 1.4)}px, up to three columns with a ${s.rulesOn ? '2px ink rule above each' : 'clear gap between them'}, the logo small bottom-left.
- Margins around 120px at 1920 wide; ${s.accentUse === 'bold' ? 'whole accent-coloured section slides are on brand' : s.accentUse === 'moderate' ? 'one accent-coloured slide or block per section' : 'the accent at most once per slide'}.
- In PowerPoint: set the master's background to ${hex('surface')}, text to ${hex('ink')}, accent ${s.accent}; headlines ${st('headline')}.`,
    documents: `## Document styles (from the design system)
- Title ${st('display').replace(/\d+px/, `${Math.min(56, s.roleStyle('display').size)}px`)}; headings ${st('title')}; body ${st('body')}; captions ${st('caption')}.
- Page margins about ${String(s.size.find((x) => x.name === 'page-margin')?.value || '').endsWith('vw') ? `${parseFloat(String(s.size.find((x) => x.name === 'page-margin')!.value)) * 2}% of the page width` : '20mm'}; keep body lines to about 65 characters.
- Text ${hex('ink')} on ${hex('surface')}; secondary text ${hex('mute')}; the accent ${s.accent} only for ${s.accentIsText ? 'headings, rules and highlights' : 'fills and rules (it is too light for text)'}.
- ${s.rulesOn ? 'Thin rules in the line colour divide sections.' : 'No hairline rules; separate sections with space.'}`,
    social: `## Post layouts (from the design system)
Open \`design/layouts.html\` and match its three posts (1080 × 1350):
- **Image and logo:** ${s.images.length ? 'a photo from `assets/imagery/` full-bleed' : 'a palette colour field'}, the logo for dark grounds bottom-left with 80px margins.
- **Type on accent:** accent ${s.accent} ground, text ${s.onAccent}, a short line in the display face at about ${scale(1.6)}px, the symbol bottom-left.
- **Statement on ink:** ink ${hex('ink')} ground, a sentence in the headline face, the logo bottom-left.
- Margins 80–96px. Photos are ${s.imagery.treatment}, cropped ${s.imagery.ratio}${s.imagery.corners ? '' : ', square corners'}.`
  };
  return `## How ${s.client} looks
These come from the ${s.client} design system${s.hasProfile ? ', read from the guidelines and checked by Lost Property' : ''}. Values are in \`design/tokens.json\`.
${qualities || '- Not read from the guidelines yet: use the tokens and the reference.'}
- Colours: background ${hex('surface')}, text ${hex('ink')}, secondary text ${hex('mute')}, accent ${s.accent} with ${s.onAccent} on it.
- Type: display ${st('display')}; headline ${st('headline')}; body ${st('body')}.
- Corners: controls ${s.radius.find((x) => x.name === 'radius-control')!.value}, cards ${s.radius.find((x) => x.name === 'radius-card')!.value}. No shadows or gradients unless the guidelines show them.
${s.devices.length ? `\nGraphic devices:\n${s.devices.map((d) => `- ${d}`).join('\n')}\n` : ''}${s.dos.length ? `\nDo:\n${s.dos.map((d) => `- ${d}`).join('\n')}\n` : ''}${s.donts.length ? `\nDon't:\n${s.donts.map((d) => `- ${d}`).join('\n')}\n` : ''}
${specific[id]}`;
}

export function skillFiles(id: SkillId, snap: Snapshot, fonts: ProjectFont[], files: string[], aiDonts?: string[], ds?: DS) {
  const client = snap.client, base = kebab(client);
  const name = id === 'brand' ? `${base}-brand` : `${base}-${id}`;
  const desc: Record<SkillId, string> = {
    brand: `${client} brand guidelines: colours, typefaces, logo files and rules, and tone of voice. Use whenever making anything for ${client}: designs, copy, documents, slides, social posts or code.`,
    presentations: `Make ${client} slide decks (PowerPoint .pptx or HTML) that follow the brand guidelines: logo placement, colours, typefaces and layout. Use when asked for a ${client} presentation, pitch, deck or slides.`,
    documents: `Make ${client} documents (Word .docx or PDF): reports, letters, proposals and one-pagers set in the brand typefaces and colours. Use when asked for a ${client} document.`,
    social: `Make ${client} social posts and stories at the correct sizes from the brand templates, with copy in the brand voice. Use when asked for ${client} social media content.`,
    writing: `Write and review ${client} copy in the brand voice: headlines, subheadings, body, captions, calls to action, posts, emails and web pages. Use whenever writing anything for ${client} or checking copy is on brand.`
  };
  const body: Record<SkillId, string> = {
    brand: `# ${client} brand\n\n${COMMON(client)}\n\nFor slides, documents or social posts, if the matching ${client} skill is installed, use it as well.`,
    presentations: `# ${client} presentations\n\n${COMMON(client)}\n\n## How to build a deck\n1. Ask what the deck is for and who it's for if that isn't clear. Plan the slides as a short outline first.\n2. Use 16:9 (13.333 × 7.5 in for PowerPoint). Set up a master with the brand typefaces and the brand background colour; take type sizes and spacing from \`tokens/\` where given.\n3. Title slide: the logo from \`assets/logo/\`, placed and sized per "Logo in use" in the reference.\n4. Content slides: one idea per slide, a short headline, generous margins, text in colours that pass the contrast rules.\n5. Don't place the logo on every slide unless the guidelines say to; a closing slide with the logo is enough.\n6. Build PowerPoint files with python-pptx (embed the logo as SVG or high-resolution PNG), or an HTML deck if asked.\n7. Check every slide against the rules before you hand it over.`,
    documents: `# ${client} documents\n\n${COMMON(client)}\n\n## How to build a document\n1. Use the brand body typeface for text and the display typeface for headings, at sizes from \`tokens/\` where given.\n2. Put the logo on the first page only, per the logo rules, unless the guidelines say otherwise.\n3. Keep line length comfortable (about 60 to 75 characters), and use the brand colours only for headings, rules and highlights that pass contrast.\n4. Make Word files with python-docx or PDFs with a layout library; embed fonts where the licence allows.\n5. Check the finished document against the rules.`,
    social: `# ${client} social posts\n\n${COMMON(client)}\n\n## Sizes\n- Instagram post 4:5: 1080 × 1350 px\n- Instagram/TikTok story 9:16: 1080 × 1920 px\n- LinkedIn/X post: 1200 × 628 px\n\n## How to make a post\n1. Start from a template in \`templates/\` when one fits. Only change elements marked \`data-slot\`; never move or resize the logo.\n2. Keep headlines short and in the brand voice. Offer two or three copy options when the brief is open.\n3. Render to PNG at the exact size (for example with a headless browser), and write the caption separately.\n4. Check the result against the rules.`,
    writing: WRITING(client, !!(snap.voice && voiceHas(snap.voice)))
  };
  const md = `---\nname: ${name}\ndescription: ${desc[id]}\n---\n\n${body[id]}\n${ds ? `\n${designNotes(ds, id)}\n` : ''}`;
  const needs = (f: string) => f.startsWith('assets/logo/') || f.startsWith('tokens/') || f.startsWith('assets/fonts/') || (id === 'social' && f.startsWith('templates/')) || (id === 'presentations' && /^templates\/slide/.test(f)) || ((id === 'social' || id === 'presentations') && /^assets\/(imagery|graphics)\//.test(f));
  // The design system travels with every skill: tokens, components, the spec, and the layouts to match
  const design: Record<string, string> = ds ? { 'design/DESIGN.md': ds.files['DESIGN.md'], 'design/tokens.json': ds.files['tokens.json'], 'design/tokens.css': ds.files['tokens.css'], 'design/brand.css': ds.files['brand.css'], 'design/layouts.html': ds.files['preview.html'].replace(/(src|href)="assets\//g, '$1="../assets/') } : {};
  const voice = snap.voice && voiceHas(snap.voice) ? `# ${client} voice\n\n${voiceMd(client, snap.voice)}\n\n${knowledgeMd(client, snap.knowledge || [])}\n` : `# ${client} voice\n\nNot written up yet. Use the tone of voice chapter in brand.md.\n`;
  return { folder: name, md, reference: brandReference(snap, fonts, files, aiDonts), voice, include: id === 'writing' ? [] : files.filter(needs), design: id === 'writing' ? {} : design };
}

/** Skills the studio has chosen to show clients */
export type SkillSettings = { hidden?: boolean; off?: string[] };
export const readSkillSettings = (content: unknown): SkillSettings => ((content as { skills?: SkillSettings } | null)?.skills) || {};
export const skillShown = (st: SkillSettings, id: string) => !st.hidden && !(st.off || []).includes(id);

/** Whether a skill has what it needs to be any good, in plain checks */
export type SkillCheck = { ok: boolean; text: string };
export function skillChecks(id: SkillId, snap: Snapshot, fonts: ProjectFont[], files: string[], voice: string): SkillCheck[] {
  const named = fonts.filter((f) => f.name), licensed = named.filter((f) => f.files.some((x) => x.licence === 'licensed'));
  const logos = files.filter((f) => f.startsWith('assets/logo/')).length;
  const chapters = (snap.guide?.chapters || []).filter((c) => !c.removed && !c.hidden).length;
  const templates = files.filter((f) => f.startsWith('templates/'));
  const voiceOk = voice.trim().length > 400;
  const c = (ok: boolean, yes: string, no: string): SkillCheck => ({ ok, text: ok ? yes : no });
  const base = [
    c(snap.colours.length > 0, `${snap.colours.length} brand colours, with their uses`, 'No colours yet: it can’t keep to the palette'),
    c(chapters > 0, `The rules from ${chapters} chapter${chapters === 1 ? '' : 's'} of the guidelines`, 'No guidelines yet: it only knows the basics')
  ];
  if (id === 'writing') return [c(voiceOk, 'The tone of voice, with its rules and examples', 'Little or no tone of voice yet: set it in the Voice tab, or it’ll write generically'), base[1]];
  const visual = [
    ...base,
    c(logos > 0, `${logos} logo file${logos === 1 ? '' : 's'} to place`, 'No logo files: it can describe the logo but not place it'),
    c(named.length > 0 && licensed.length === named.length, `Brand fonts included (${named.map((f) => f.name).join(', ')})`, named.length ? `Fonts not included until licensed (${named.filter((f) => !licensed.includes(f)).map((f) => f.name).join(', ')}): it falls back to a close system font and says so` : 'No typefaces named yet'),
    c(voiceOk, 'The tone of voice, for any words it writes', 'No tone of voice yet: words it writes won’t sound like the brand')
  ];
  if (id === 'presentations') visual.push(c(templates.some((f) => /^templates\/slide/.test(f)), 'Slide templates from the kit', 'No slide templates in the kit: it builds slides from the rules instead'));
  if (id === 'social') visual.push(c(templates.some((f) => /social|post|story/i.test(f)), 'Social templates from the kit', 'No social templates in the kit: it builds posts from the rules instead'));
  return visual;
}
