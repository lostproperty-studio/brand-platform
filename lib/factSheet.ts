// The fact sheet: the facts the Writer is allowed to state (names, people, places, times, prices, events).
// The client fills it in from the Writer; the Writer treats it as the truth and writes nothing that contradicts it.
// A note starting "Check:" is an open question for the client, and the Writer won't state that row until it's
// answered. Kept in projects.content.factSheet. Safe for client components.

export type FactTab = { id: string; title: string; about: string; columns: string[]; rows: string[][] };
export type FactSheet = { owner: string; tabs: FactTab[]; updatedAt?: string; updatedBy?: string };

export const FACT_INTRO = {
  what: 'The Writer treats this as the truth. It only states facts that are here.',
  how: 'Only add what can appear in public copy. If a person, business or quote can’t be used publicly, leave it out. Correct anything that’s wrong and delete anything that can’t be used.',
  check: 'Notes starting with “Check:” are questions for you. The Writer won’t use that row until it’s answered.',
  keep: 'Change it whenever something changes, and name one person to own it.'
};

export const FACT_TEMPLATE: FactTab[] = [
  { id: 'key', title: 'Key facts', about: 'Names, numbers and the things everyone gets asked.', columns: ['Item', 'Answer', 'Notes'], rows: [['Official name', '', ''], ['Short name', '', 'When can the short name be used on its own?'], ['Other brands', '', ''], ['Year opened', '', ''], ['Number of businesses', '', ''], ['Number of people', '', '']] },
  { id: 'people', title: 'People', about: 'Who people can ask, and about what.', columns: ['Name', 'Role', 'Ask them about', 'Contact'], rows: [] },
  { id: 'places', title: 'Places', about: 'Every place, written the way it should be.', columns: ['Name, as it should be written', 'What it is', 'Where it is', 'Opening hours', 'Notes'], rows: [] },
  { id: 'times', title: 'Times and contacts', about: 'Hours, addresses, emails, phone numbers and how to get here.', columns: ['Item', 'Detail', 'Notes'], rows: [] },
  { id: 'prices', title: 'Prices and offers', about: 'What things cost, and what’s included.', columns: ['Item', 'Price', 'Notes'], rows: [] },
  { id: 'residents', title: 'Residents', about: 'Who’s here, and the work we can mention.', columns: ['Business', 'What they do', 'Work we can mention'], rows: [] },
  { id: 'events', title: 'Regular events', about: 'What happens, when and where.', columns: ['Event', 'When', 'Where'], rows: [] }
];

const clean = (v: unknown, n = 500) => String(v ?? '').replace(/\s+$/g, '').slice(0, n);

/** The project's sheet, or the empty template (missing tabs filled in from it, so older sheets gain new tabs) */
export function readFacts(content: unknown): FactSheet {
  const f = (content as { factSheet?: Partial<FactSheet> } | null)?.factSheet;
  if (!f?.tabs?.length) return { owner: '', tabs: FACT_TEMPLATE.map((t) => ({ ...t, rows: t.rows.map((r) => [...r]) })) };
  const tabs = f.tabs.map((t) => ({ id: clean(t.id, 40), title: clean(t.title, 60), about: clean(t.about, 200), columns: (t.columns || []).map((c) => clean(c, 60)).slice(0, 8), rows: (t.rows || []).slice(0, 300).map((r) => (t.columns || []).map((_, i) => clean(r?.[i]))) }));
  for (const t of FACT_TEMPLATE) if (!tabs.some((x) => x.id === t.id)) tabs.push({ ...t, rows: [] });
  return { owner: clean(f.owner, 80), tabs, updatedAt: f.updatedAt, updatedBy: f.updatedBy };
}

export const isCheck = (row: string[]) => row.some((c) => /^\s*check:/i.test(c));
/** Rows still waiting on an answer from the client */
export const openChecks = (f: FactSheet) => f.tabs.reduce((n, t) => n + t.rows.filter(isCheck).length, 0);
export const filled = (f: FactSheet) => f.tabs.reduce((n, t) => n + t.rows.filter((r) => r.slice(1).some((c) => c.trim() && !/^\s*check:/i.test(c))).length, 0);

/** For the Writer: the confirmed facts as the truth, and the open questions as things not to state */
export function factsMd(client: string, f: FactSheet) {
  const sure: string[] = [], unsure: string[] = [];
  for (const t of f.tabs) {
    const rows = t.rows.filter((r) => r.some((c) => c.trim()));
    const ok = rows.filter((r) => !isCheck(r)), q = rows.filter(isCheck);
    const line = (r: string[]) => '- ' + t.columns.map((c, i) => (r[i]?.trim() ? `${c}: ${r[i].trim()}` : '')).filter(Boolean).join(' · ');
    if (ok.length) sure.push(`### ${t.title}\n${ok.map(line).join('\n')}`);
    if (q.length) unsure.push(`### ${t.title}\n${q.map(line).join('\n')}`);
  }
  if (!sure.length && !unsure.length) return '';
  return `FACT SHEET for ${client} (the truth: state names, people, places, times, prices and events only as written here, and never invent any)
${sure.join('\n\n')}${unsure.length ? `\n\nNOT CONFIRMED YET (open questions for ${client}: don't state these facts; if the copy needs one, leave a [check: …] placeholder for a person to fill)\n${unsure.join('\n\n')}` : ''}
If the copy needs a fact that isn't here, don't guess: leave a short [check: …] placeholder for a person to fill.`;
}
