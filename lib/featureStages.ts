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

export type FeatureKey = 'director';

export const FEATURES: Record<FeatureKey, { name: string; about: string; default: Stage }> = {
  director: { name: 'Director', about: 'Plan, shoot and generate short-form video from the brand’s creative direction.', default: 'studio' }
};

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export const isFeature = (k: string): k is FeatureKey => k in FEATURES;
export const isStage = (s: string): s is Stage => (STAGES as readonly string[]).includes(s);

/** Whether someone sees a feature at this stage. `preview` = studio staff in the studio preview. */
export const canSee = (stage: Stage, preview: boolean) => stage === 'live' || stage === 'beta' || (stage === 'studio' && preview);

/** A small label for the nav and page: Labs for studio-only, Beta for client beta, nothing when live */
export const stageBadge = (stage: Stage) => (stage === 'studio' ? 'Labs' : stage === 'beta' ? 'Beta' : null);
