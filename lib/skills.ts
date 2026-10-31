import type { Snapshot } from '@/lib/ai/project';
import type { ProjectFont } from '@/lib/fonts';
import { chapterText } from '@/lib/portal/guide';
import { aiRulesMd, watchoutsFrom } from '@/lib/aiRules';

// Claude skills generated from a brand: each is a folder with SKILL.md, the brand reference, and the brand files,
// zipped so a client can upload it in Claude (Settings → Capabilities → Skills).

export const SKILLS = [
  { id: 'brand', icon: 'badge', title: 'Brand guidelines', blurb: 'The core skill: rules, colours, type, logos and tone of voice for anything on-brand.' },
  { id: 'presentations', icon: 'slides', title: 'Presentations', blurb: 'Builds slide decks (PowerPoint or HTML) with the brand’s layouts, type and logo rules.' },
  { id: 'documents', icon: 'doc', title: 'Documents', blurb: 'Reports, letters and one-pagers as Word or PDF, set in the brand typefaces.' },
  { id: 'social', icon: 'social', title: 'Social posts', blurb: 'Posts and stories at the right sizes, from the kit’s templates, in the brand voice.' }
] as const;
export type SkillId = (typeof SKILLS)[number]['id'];

const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brand';

/** The brand reference every skill carries: values first, then each chapter's rules and guidance. */
export function brandReference(snap: Snapshot, fonts: ProjectFont[], files: string[], aiDonts?: string[]) {
  const chapters = snap.guide?.chapters || [];
  const logos = files.filter((f) => f.startsWith('assets/logo/'));
  return `# ${snap.client} brand reference

${snap.line}

## Colours
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

${aiRulesMd({ client: snap.client, files, watchouts: watchoutsFrom(chapters.flatMap(chapterText)), donts: aiDonts })}
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

export function skillFiles(id: SkillId, snap: Snapshot, fonts: ProjectFont[], files: string[], aiDonts?: string[]) {
  const client = snap.client, base = kebab(client);
  const name = id === 'brand' ? `${base}-brand` : `${base}-${id}`;
  const desc: Record<SkillId, string> = {
    brand: `${client} brand guidelines: colours, typefaces, logo files and rules, and tone of voice. Use whenever making anything for ${client}: designs, copy, documents, slides, social posts or code.`,
    presentations: `Make ${client} slide decks (PowerPoint .pptx or HTML) that follow the brand guidelines: logo placement, colours, typefaces and layout. Use when asked for a ${client} presentation, pitch, deck or slides.`,
    documents: `Make ${client} documents (Word .docx or PDF): reports, letters, proposals and one-pagers set in the brand typefaces and colours. Use when asked for a ${client} document.`,
    social: `Make ${client} social posts and stories at the correct sizes from the brand templates, with copy in the brand voice. Use when asked for ${client} social media content.`
  };
  const body: Record<SkillId, string> = {
    brand: `# ${client} brand\n\n${COMMON(client)}\n\nFor slides, documents or social posts, if the matching ${client} skill is installed, use it as well.`,
    presentations: `# ${client} presentations\n\n${COMMON(client)}\n\n## How to build a deck\n1. Ask what the deck is for and who it's for if that isn't clear. Plan the slides as a short outline first.\n2. Use 16:9 (13.333 × 7.5 in for PowerPoint). Set up a master with the brand typefaces and the brand background colour; take type sizes and spacing from \`tokens/\` where given.\n3. Title slide: the logo from \`assets/logo/\`, placed and sized per "Logo in use" in the reference.\n4. Content slides: one idea per slide, a short headline, generous margins, text in colours that pass the contrast rules.\n5. Don't place the logo on every slide unless the guidelines say to; a closing slide with the logo is enough.\n6. Build PowerPoint files with python-pptx (embed the logo as SVG or high-resolution PNG), or an HTML deck if asked.\n7. Check every slide against the rules before you hand it over.`,
    documents: `# ${client} documents\n\n${COMMON(client)}\n\n## How to build a document\n1. Use the brand body typeface for text and the display typeface for headings, at sizes from \`tokens/\` where given.\n2. Put the logo on the first page only, per the logo rules, unless the guidelines say otherwise.\n3. Keep line length comfortable (about 60 to 75 characters), and use the brand colours only for headings, rules and highlights that pass contrast.\n4. Make Word files with python-docx or PDFs with a layout library; embed fonts where the licence allows.\n5. Check the finished document against the rules.`,
    social: `# ${client} social posts\n\n${COMMON(client)}\n\n## Sizes\n- Instagram post 4:5: 1080 × 1350 px\n- Instagram/TikTok story 9:16: 1080 × 1920 px\n- LinkedIn/X post: 1200 × 628 px\n\n## How to make a post\n1. Start from a template in \`templates/\` when one fits. Only change elements marked \`data-slot\`; never move or resize the logo.\n2. Keep headlines short and in the brand voice. Offer two or three copy options when the brief is open.\n3. Render to PNG at the exact size (for example with a headless browser), and write the caption separately.\n4. Check the result against the rules.`
  };
  const md = `---\nname: ${name}\ndescription: ${desc[id]}\n---\n\n${body[id]}\n`;
  const needs = (f: string) => f.startsWith('assets/logo/') || f.startsWith('tokens/') || f.startsWith('assets/fonts/') || (id === 'social' && f.startsWith('templates/')) || (id === 'presentations' && /^templates\/slide/.test(f));
  return { folder: name, md, reference: brandReference(snap, fonts, files, aiDonts), include: files.filter(needs) };
}
