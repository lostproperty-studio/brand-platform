// The kit's file naming system: <client>-<asset>-<variant>.<ext>, lowercase words joined by hyphens.
export const kebab = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function suggestName(client: string, layerName: string) {
  const c = kebab(client);
  let base = kebab(layerName).replace(new RegExp(`^${c}-?`), '').replace(/-\d+$/, '') || 'asset';
  base = base.replace(/\blogo-logo\b/, 'logo');
  return `${c}-${base}.svg`;
}

/** What's wrong with a file name, in plain words (empty when it follows the system). */
export function nameProblems(client: string, name: string, others: string[]) {
  const out: string[] = [];
  const c = kebab(client);
  if (!/\.(svg|png)$/.test(name)) out.push('should end in .svg');
  if (/[A-Z]/.test(name)) out.push('use lowercase');
  if (/[\s_]/.test(name)) out.push('use hyphens, not spaces or underscores');
  if (!name.startsWith(c + '-')) out.push(`start with “${c}-”`);
  if (/(^|-)(copy|final|v\d+|new|\d+)(-|\.)/.test(name)) out.push('drop words like copy, final, new or numbers');
  if (others.filter((o) => o === name).length > 1) out.push('same name as another file');
  return out;
}
