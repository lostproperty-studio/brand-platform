# Releasing

Clients are on the platform, so nothing reaches their portals without Steffan's approval. The studio can still build and try new features every day. Three layers keep those two things apart.

## 1. Branches and environments

| Branch | Deploys to | Who sees it | Database |
| --- | --- | --- | --- |
| `main` | Live: `platform.lostproperty.studio` | Clients and studio | Live |
| `develop` | Staging: `staging.platform.lostproperty.studio` | Studio only | Staging (separate Supabase project) |
| `feature/*` | A Vercel preview link per branch | Studio only | Staging |

- **`main` is protected.** Nothing is pushed to it directly, including by Claude sessions. Changes arrive through a pull request from `develop`, and merging that pull request is the approval. Only Steffan merges into `main`.
- **Work happens on `develop`** or a `feature/*` branch off it. Claude sessions always branch from `develop` and open pull requests into `develop`.
- **Migrations only run on live deploys.** `scripts/migrate.mjs` skips preview and staging deploys unless `MIGRATE_ON_PREVIEW=1` is set for that environment. Only set it when the environment points at the staging database, never the live one.

## 2. Feature stages

Every new client-facing tab or tool is registered in `lib/featureStages.ts` and gated per project:

| Stage | Who sees it | Badge |
| --- | --- | --- |
| Off | Nobody | None |
| Studio only | Studio staff in the studio preview (not when viewing as the client) | Labs |
| Client beta | That client's team too | Beta |
| Live | Everyone | None |

New features default to **Studio only**, so merged code changes nothing for clients. Admins move a feature on per project in **Admin settings → Releases**. Switching back is instant and needs no deploy.

To gate a new feature:

1. Add it to `FEATURES` in `lib/featureStages.ts` with `default: 'studio'`.
2. In its page, call `projectStages()` and `canSee()` and return `notFound()` when it's hidden (see `app/p/[slug]/director/page.tsx`).
3. Add its nav item through the `features` list in `app/p/[slug]/layout.tsx`.

## 3. Releases

1. Changes collect on `develop` and get tried on staging.
2. When they're ready, bump `version` in `package.json` and add a section to `CHANGELOG.md`.
3. Open a pull request from `develop` into `main`, titled with the version (e.g. `v1.0.0-beta.3`), with the changelog section as its description.
4. Steffan reviews it on staging and merges it. Vercel deploys live and runs any new migrations.
5. Tag the merge: `git tag v1.0.0-beta.3 && git push origin v1.0.0-beta.3`.
6. Changelog entries a client would care about become the "what's new" email.

Versions follow `MAJOR.MINOR.PATCH`, with `-beta.N` until V1 launches. The running version shows in Admin settings → Releases.

## One-time setup (Vercel and Supabase)

1. **Staging database:** create a second Supabase project (EU), named `brand-platform-staging`.
2. **Vercel → Settings → Environments → Preview:** set the Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_URL`, `POSTGRES_URL_NON_POOLING`) to the **staging** project, plus `MIGRATE_ON_PREVIEW=1` and `NEXT_PUBLIC_APP_URL=https://staging.platform.lostproperty.studio`. Production keeps the live values.
3. **Vercel → Settings → Git:** production branch `main`.
4. **Vercel → Settings → Domains:** add `staging.platform.lostproperty.studio` and assign it to the `develop` branch. Add the CNAME it shows at the DNS provider.
5. **Vercel → Settings → Deployment Protection:** keep Vercel Authentication on for previews, so preview links aren't public.
6. **Supabase (staging) → Auth → URL configuration:** site URL `https://staging.platform.lostproperty.studio`, redirect `https://staging.platform.lostproperty.studio/auth/callback`, plus `https://*-lostproperty-studio.vercel.app/auth/callback` for branch previews.

Until steps 1–2 are done, previews use the live database without changing its schema. Treat them as read-only for client projects.
