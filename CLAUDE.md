# Working on the brand platform

Clients use the live platform, so read [RELEASING.md](RELEASING.md) before changing anything.

- Never push to `main` and never open a pull request into `main` unless Steffan asks for a release. Branch from `develop` (`feature/<name>`) and open pull requests into `develop`.
- Every new client-facing tab, tool or behaviour goes behind a feature stage in `lib/featureStages.ts`, defaulting to `'studio'`. Clients must see nothing new until an admin moves it on in Admin settings → Releases.
- New database changes go in a new numbered file in `supabase/migrations/`. They run on live deploys only, so code must still work if the table isn't there yet (see `projectStages()` in `lib/features.ts`).
- Run `npm run typecheck` before committing.
