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
/** An app can also be shown as coming soon: its icon is there, greyed, and opens a preview of what it will do */
export type AppState = 'on' | 'soon' | 'off';
export const APP_KEYS = ['writer', 'director', 'designer', 'photographer'] as const;
type Raw = Partial<Record<SwitchKey, boolean | 'soon'>>;
const raw = (content: unknown): Raw => ((content as { switches?: Raw } | null)?.switches) || {};
/** Shown at all (on, or coming soon). Off means gone for everyone. */
export function readSwitches(content: unknown): Switches {
  const s = raw(content);
  return Object.fromEntries(SWITCHES.map((x) => [x.key, s[x.key] !== false])) as Switches;
}
/** Each switch as on, coming soon or off */
export function readStates(content: unknown): Record<SwitchKey, AppState> {
  const s = raw(content);
  return Object.fromEntries(SWITCHES.map((x) => [x.key, s[x.key] === false ? 'off' : s[x.key] === 'soon' ? 'soon' : 'on'])) as Record<SwitchKey, AppState>;
}
export const isSoon = (content: unknown, k: SwitchKey) => raw(content)[k] === 'soon';

/** The studio's own projects (Lost Property Studio) run on the studio's Claude, for everyone on them */
export const usesStudioAi = (content: unknown) => !!(content as { studioAi?: boolean } | null)?.studioAi;
