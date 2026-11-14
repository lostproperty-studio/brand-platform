# Working on the brand platform

Clients use the live platform, so read [RELEASING.md](RELEASING.md) before changing anything.

- Never push to `main`. Work on a branch (`feature/<name>`) off `main` and open a pull request into `main`. Steffan merges it; that is the approval.
- Every new client-facing tab, tool or behaviour goes behind a feature stage in `lib/featureStages.ts`, defaulting to `'studio'` (Labs). Clients must see nothing new until an admin moves it on in Admin settings → Releases.
- If a pull request changes shared code that clients already use (sign-in, portal layout, Guidelines, Resources, Ask), say so in the first line of its description.
- New database changes go in a new numbered file in `supabase/migrations/`. They run on live deploys only, so code must still work if the table isn't there yet (see `projectStages()` in `lib/features.ts`).
- Run `npm run typecheck` before committing.
- Write pull request descriptions in plain language for a creative director, not an engineer.
