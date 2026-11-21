// Which sections and apps a project has. The studio switches them per project (Overview → Sections and apps);
// one that's off is gone for everyone, the client's team and the studio alike. Release stages (Admin settings →
// Releases) still apply on top: an app shows only when it's on here and released to that person.
export type SwitchKey = 'showcase' | 'writer' | 'director' | 'designer' | 'photographer';
export const SWITCHES: { key: SwitchKey; name: string; about: string }[] = [
  { key: 'showcase', name: 'Showcase', about: 'The brand in use: the gallery of work' },
  { key: 'writer', name: 'Writer', about: 'On-brand copy, piece by piece' },
  { key: 'director', name: 'Director', about: 'Short-form video' },
  { key: 'designer', name: 'Designer', about: 'Social graphics and slides' },
  { key: 'photographer', name: 'Photographer', about: 'Collections of on-brand images' }
];
export type Switches = Record<SwitchKey, boolean>;
export function readSwitches(content: unknown): Switches {
  const s = ((content as { switches?: Partial<Switches> } | null)?.switches) || {};
  return Object.fromEntries(SWITCHES.map((x) => [x.key, s[x.key] !== false])) as Switches;
}
/** The studio's own projects (Lost Property Studio) run on the studio's Claude, for everyone on them */
export const usesStudioAi = (content: unknown) => !!(content as { studioAi?: boolean } | null)?.studioAi;
