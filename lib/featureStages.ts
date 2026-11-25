// The release gate's vocabulary: stages and the feature registry. Safe to import in client components.
// Every new tab or tool is registered here and given a stage per project:
//   off     nobody sees it
//   studio  studio staff only, in the studio preview (never when viewing as the client)
//   beta    the client sees it too, marked Beta
//   live    everyone, unmarked
// New features start at 'studio', so code can be merged and deployed without changing what any client sees.
// Only a studio admin moves a feature on, per project, in Admin settings → Releases.

export const STAGES = ['off', 'studio', 'beta', 'live'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = { off: 'Off', studio: 'Studio only', beta: 'Client beta', live: 'Live' };

export type FeatureKey = 'director' | 'photographer' | 'plugins' | 'support' | 'facts';

export const FEATURES: Record<FeatureKey, { name: string; about: string; default: Stage }> = {
  director: { name: 'Director', about: 'Plan, shoot and generate short-form video from the brand’s creative direction.', default: 'studio' },
  photographer: { name: 'Photographer', about: 'Collections of on-brand images: add, find, generate, check against the art direction and edit with effects.', default: 'studio' },
  plugins: { name: 'Plug-ins', about: 'The brand panel inside Canva, Microsoft Office and Google Workspace, and syncing to the client’s own file storage.', default: 'studio' },
  support: { name: 'Working with Lost Property', about: 'Chat with the Lost Property team from the Ask bar (answered in the studio’s Slack), requests as tickets, and booking paid sessions.', default: 'studio' },
  facts: { name: 'Fact sheet', about: 'A fact sheet in the Writer: names, people, places, times and prices the client keeps up to date, used by the Writer as the truth.', default: 'studio' }
};

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export const isFeature = (k: string): k is FeatureKey => k in FEATURES;
export const isStage = (s: string): s is Stage => (STAGES as readonly string[]).includes(s);

/** Whether someone sees a feature at this stage. `preview` = studio staff in the studio preview. */
export const canSee = (stage: Stage, preview: boolean) => stage === 'live' || stage === 'beta' || (stage === 'studio' && preview);

/** A small label for the nav and page: Labs for studio-only, Beta for client beta, nothing when live */
export const stageBadge = (stage: Stage) => (stage === 'studio' ? 'Labs' : stage === 'beta' ? 'Beta' : null);
