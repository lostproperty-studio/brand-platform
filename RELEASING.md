# Releasing

Clients use the live platform. One rule keeps them safe while the studio keeps building:

**New work is built in Labs on the live platform, and nothing goes live until Steffan presses Merge.**

## How it works

1. **Claude (or anyone) makes changes on a branch** and opens a pull request into `main`. Nothing changes for anyone yet.
2. **Vercel builds the pull request.** If the build fails, GitHub shows a red cross, so it can't go live by accident.
3. **Steffan reviews and presses Merge.** That's the approval. Vercel deploys it live.
4. **New client-facing features arrive in Labs.** Only studio staff can see them, marked with a black Labs badge. Clients see nothing new.
5. **When a feature is ready for a client,** an admin moves it on in **Admin settings → Releases**: Studio only → Client beta → Live. Switching back is instant.

So the studio tries new features on the real platform, with real brand data, and clients never see unfinished work.

## Feature stages

| Stage | Who sees it | Badge |
| --- | --- | --- |
| Off | Nobody | None |
| Studio only | Studio staff (not when viewing as the client) | Labs |
| Client beta | That client's team too | Beta |
| Live | Everyone | None |

To gate a new feature:

1. Add it to `FEATURES` in `lib/featureStages.ts` with `default: 'studio'`.
2. In its page, call `projectStages()` and `canSee()` and return `notFound()` when it's hidden (see `app/p/[slug]/director/page.tsx`).
3. Add its nav item through the `features` list in `app/p/[slug]/layout.tsx`.

## Safety rules

- **`main` is locked:** no direct pushes, only merged pull requests.
- **Changes to shared code** (sign-in, the portal layout, Guidelines, Resources, Ask) affect clients as soon as they merge, Labs or not. Pull requests that touch them say so in their first line, so Steffan knows to look closely.
- **Database changes** go in a new numbered file in `supabase/migrations/`. They run only on live deploys, and code must still work before they've run.
- **Versions:** bump `version` in `package.json` and add a `CHANGELOG.md` entry for releases worth telling clients about. Use `-beta.N` until V1 launches. Changelog entries clients care about become the "what's new" email.

## Later: a separate staging site

Not needed yet. When the team grows, or a change is too risky to try on the live platform, add `staging.platform.lostproperty.studio` with its own database. Preview deploys already skip database migrations unless `MIGRATE_ON_PREVIEW=1` is set, so the groundwork is in place.
