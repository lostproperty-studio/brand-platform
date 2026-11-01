// The brand form: the brand's facts in fixed places, filled in at the top of the Assets page of the guidelines
// template. The portal, the Claude skills and the design system all read the same answers, so the brand is
// described the same way every time. Strategy answers are never drafted: an empty one is reported as missing.

export type BrandForm = Partial<Record<FormKey, string>>;
export type FormKey = 'name' | 'line' | 'intro' | 'depth' | 'purpose' | 'idea' | 'audience' | 'values' | 'voice words' | 'sounds like' | 'never sounds like' | 'logo light' | 'logo dark' | 'donts' | 'contact';

export const FORM_KEYS: FormKey[] = ['name', 'line', 'intro', 'depth', 'purpose', 'idea', 'audience', 'values', 'voice words', 'sounds like', 'never sounds like', 'logo light', 'logo dark', 'donts', 'contact'];
const STRATEGY: [FormKey, string][] = [['purpose', 'Purpose'], ['idea', 'Brand idea'], ['audience', 'Audience'], ['values', 'Values']];

const EMPTY = /^(write here|—|-|tbc|tbd)?$/i;
/** A field's answer, or undefined while it still holds the template's placeholder. */
export const answer = (s?: string) => { const t = (s || '').trim(); return EMPTY.test(t) ? undefined : t; };

export function readForm(content: unknown): BrandForm | undefined {
  const f = (content as { form?: BrandForm } | null)?.form;
  return f && typeof f === 'object' ? f : undefined;
}

export const lines = (s?: string) => (s || '').split(/\n+/).map((x) => x.replace(/^[-•·]\s*/, '').trim()).filter(Boolean);

/** "About the brand", for the brand reference, the design system and the portal's assistant. */
export function aboutMd(form?: BrandForm) {
  if (!form) return '';
  const out: string[] = ['## About the brand', ''];
  for (const [k, label] of STRATEGY) {
    const v = form[k];
    if (!v) out.push(`- ${label}: Missing. Don't fill this in yourself; ask Lost Property.`);
    else if (k === 'values') out.push(`- ${label}:\n${lines(v).map((x) => `  - ${x}`).join('\n')}`);
    else out.push(`- ${label}: ${v}`);
  }
  const voice = lines(form['voice words']);
  if (voice.length || form['sounds like'] || form['never sounds like']) {
    out.push('', '### Voice');
    if (voice.length) out.push(`- In three words: ${voice.join(', ')}`);
    if (form['sounds like']) out.push(`- Sounds like: “${form['sounds like']}”`);
    if (form['never sounds like']) out.push(`- Never sounds like: “${form['never sounds like']}”`);
  }
  if (form.contact) out.push('', `Anything the guidelines don't answer: ask ${form.contact}.`);
  return out.join('\n') + '\n';
}

/** Logo files picked in the form ("logo light", "logo dark"), matched to the kit's file names. */
export function formLogo(files: string[], name?: string) {
  if (!name) return [];
  const key = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return files.filter((f) => f.includes('/logo') && (f.split('/').pop() || '').toLowerCase().includes(key));
}
