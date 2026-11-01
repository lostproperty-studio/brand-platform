import { DEFAULT_AI_DONTS } from '@/lib/playbook';
import { formLogo, lines, type BrandForm } from '@/lib/brandForm';

// The stricter layer the kit, the Claude skills and the portal's Ask give AI. People read the guide and use judgement;
// AI averages, so it gets precise positive rules, "logo in use" instead of clear space, and a short fixed list of don'ts.

const WATCH = /\b(don[’']?t|do not|avoid|watch ?outs?|misuse|never|how not)\b/i;

/** Which logo file to use on which background, read from the file names. */
export function logoByBackground(files: string[]) {
  const logos = files.filter((f) => f.startsWith('assets/logo/'));
  const on = (re: RegExp) => logos.filter((f) => re.test(f.split('/').pop() || ''));
  const dark = on(/white|light|reverse|negative|knock|inverse/i);
  const light = on(/black|dark|positive|mono(?!.*white)/i).filter((f) => !dark.includes(f));
  const colour = logos.filter((f) => !dark.includes(f) && !light.includes(f));
  return { logos, dark, light, colour };
}

/** Lines from the guide that already say what not to do, so they go to AI word for word. */
export function watchoutsFrom(texts: string[]) {
  return [...new Set(texts.flatMap((t) => t.split(/\n+/)).map((t) => t.trim()).filter((t) => t.length > 12 && t.length < 260 && WATCH.test(t)))].slice(0, 20);
}

export function aiRulesMd({ client, files, watchouts = [], donts = DEFAULT_AI_DONTS, form }: { client: string; files: string[]; watchouts?: string[]; donts?: string[]; form?: BrandForm }) {
  const auto = logoByBackground(files);
  // Logos picked in the brand form win over what the file names suggest
  const pickL = formLogo(auto.logos, form?.['logo light']), pickD = formLogo(auto.logos, form?.['logo dark']);
  const light = pickL.length ? pickL : auto.light, dark = pickD.length ? pickD : auto.dark;
  const logos = auto.logos, colour = logos.filter((f) => !light.includes(f) && !dark.includes(f));
  donts = [...donts, ...lines(form?.donts).filter((d) => !donts.includes(d))];
  const list = (xs: string[]) => xs.map((x) => `\`${x}\``).join(', ');
  const which = logos.length ? [
    light.length ? `- On light backgrounds: ${list(light)}` : '',
    dark.length ? `- On dark backgrounds and on photography: ${list(dark)}` : '',
    colour.length ? `- Other versions (use as the Logo chapter says): ${list(colour)}` : ''
  ].filter(Boolean).join('\n') : '- No logo files are included. Don’t make one; ask the person for the files from Lost Property.';
  return `## Rules for AI

These are stricter than the guide on purpose. Follow them exactly for anything you make for ${client}.

### Logo in use
Which file:
${which}

Where it sits and how big:
- Use only the positions, layouts and sizes the Logo chapter names (for example centred on its axis, top left, as a banner, or a share of the canvas width). Copy the numbers literally.
- If the guide names none for this format, place the logo once, aligned to the layout's margins, and ask before making it larger than about a fifth of the canvas width.
- Put it on flat brand colour or the calm part of an image, never across faces, text or busy detail. Choose the file that gives the most contrast.
- Once per layout, unless the guide shows it more often.

### Colour, type and artwork
- Use only the listed HEX values, in the roles the guide gives them. Where the guide gives a lead colour and supporting colours, keep that balance.
- Use only the named type styles, with their size, weight, case and spacing. If a font isn't available, use the fallback and say which font to install.
- Use the brand's own artwork (patterns, characters, icons, textures) as supplied. Don't make new ones in their style.
- Where the guide gives modes (for example three colourways or three type modes), pick one mode per layout and say which.

### Never
${donts.map((d) => `- ${d}`).join('\n')}
${watchouts.length ? `\n### Watchouts from the ${client} guide\n${watchouts.map((w) => `- ${w}`).join('\n')}\n` : ''}
When you finish, say which logo file, mode and type styles you used, so a person can check.`;
}
