// Portal v2 home: a greeting that changes with the time of day, in the brand's own voice. The studio has a set
// written from the voice chapter (saved in the project's content as `portalGreetings`); until then a plain set is
// used. One line per band is picked per three-hour window, so it holds still while someone works.
export type Band = 'early' | 'morning' | 'afternoon' | 'evening' | 'late' | 'monday' | 'friday';
export type GreetingSet = Partial<Record<Band, [string, string][]>>;
export const BANDS: Band[] = ['early', 'morning', 'afternoon', 'evening', 'late', 'monday', 'friday'];
export const BAND_LABEL: Record<Band, string> = { early: 'Early morning (5–9)', morning: 'Morning (9–12)', afternoon: 'Afternoon (12–17)', evening: 'Evening (17–21)', late: 'Late night (21–5)', monday: 'Monday morning', friday: 'Friday evening' };

/** Lines use {name} for the person's first name */
export const PLAIN: GreetingSet = {
  early: [['Morning, {name}.', 'An early start. What are we making?'], ['Up early, {name}.', 'Where shall we start?']],
  morning: [['Morning, {name}.', 'What shall we make today?'], ['Good morning, {name}.', 'What’s first?']],
  afternoon: [['Afternoon, {name}.', 'What needs finishing today?'], ['Good afternoon, {name}.', 'What are we working on?']],
  evening: [['Good evening, {name}.', 'What’s left for today?'], ['Evening, {name}.', 'One more thing?']],
  late: [['Still here, {name}?', 'What’s on your mind?'], ['Late one, {name}.', 'What shall we make?']],
  monday: [['Morning, {name}.', 'A new week. What’s first?']],
  friday: [['Evening, {name}.', 'Nearly the weekend. One last thing?']]
};

export function bandFor(d: Date): Band {
  const h = d.getHours(), day = d.getDay();
  if (day === 1 && h >= 5 && h < 12) return 'monday';
  if (day === 5 && h >= 17 && h < 22) return 'friday';
  if (h >= 5 && h < 9) return 'early';
  if (h >= 9 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'late';
}

export function pickGreeting(set: GreetingSet | undefined, d: Date, name: string): [string, string] {
  const band = bandFor(d);
  const pool = set?.[band]?.length ? set[band]! : set?.[band === 'monday' ? 'morning' : band === 'friday' ? 'evening' : band]?.length ? set[band === 'monday' ? 'morning' : band === 'friday' ? 'evening' : band]! : PLAIN[band]!;
  const line = pool[Math.floor(d.getTime() / 36e5 / 3) % pool.length];
  const fill = (s: string) => (name ? s.replace(/\{name\}/g, name) : s.replace(/,? ?\{name\}/g, ''));
  return [fill(line[0]), fill(line[1])];
}
