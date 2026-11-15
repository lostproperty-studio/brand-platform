# The staging site

A second copy of the platform for building and testing the new client portal (portal v2) without touching the live
platform, the studio backend or any client's content. It has its own database and file storage, and a copy of one
real client (Tileyard to start) so you can see everything working together.

- **Address:** `staging.platform.lostproperty.studio`
- **Code:** the `feature/portal-v2` branch. Pushes to it deploy staging; nothing reaches live until it's merged into
  `main` by pull request, as usual.
- **Data:** a separate Supabase project. Anything saved on staging stays on staging.

## Setting it up (once, about 15 minutes)

### 1. A staging database
1. In Supabase, create a new project called **brand-platform-staging** (EU region, same as live).
2. Under **Auth → URL configuration**, set the site URL to `https://staging.platform.lostproperty.studio` and add
   `https://staging.platform.lostproperty.studio/auth/callback` as a redirect URL.
3. Under **Auth → SMTP**, use the same email settings as live, so sign-in links arrive.

### 2. A staging site on Vercel
1. In Vercel, **Add New → Project**, and import `lostproperty-studio/brand-platform` again (a second project, called
   **brand-platform-staging**).
2. Under **Settings → Git**, set the production branch to `feature/portal-v2`.
3. Under **Settings → Integrations**, connect the Supabase integration to **brand-platform-staging** (not the live
   database). It adds the database and Supabase variables for you.
4. Under **Settings → Environment Variables**, add:

| Variable | Value |
| --- | --- |
| `PORTAL_V2` | `1` (turns the new portal on, on staging only) |
| `MIGRATE_ON_PREVIEW` | `1` (lets staging set up its own database; it never touches live) |
| `NEXT_PUBLIC_APP_URL` | `https://staging.platform.lostproperty.studio` |
| `STUDIO_EMAIL_DOMAINS` | `lostproperty.studio` |
| `ANTHROPIC_API_KEY` | the studio key (or a separate one, to see staging's spend apart) |
| `FIGMA_TOKEN`, `GITHUB_*`, `EMAIL_*`/`SMTP_*` | same as live |
| `SOURCE_SUPABASE_URL` | the **live** Supabase URL (used only to copy a client across) |
| `SOURCE_SUPABASE_SERVICE_KEY` | the **live** service role key (read only in practice: the copy script never writes to it) |

5. Under **Settings → Domains**, add `staging.platform.lostproperty.studio` and add the CNAME record it shows.
6. Deploy. The first build sets up the staging database from `supabase/migrations`.

### 3. Copy Tileyard across
From a computer with the repository and the staging variables (Vercel → Settings → Environment Variables → copy as
`.env`):

```bash
npm install
node --env-file=.env.staging scripts/seed-staging.mjs tileyard
```

(Node 20 or later.) The script
refuses to run if the source and staging databases are the same. Run it again whenever you want a fresh copy, or
with another client's slug.

### 4. Sign in
Open `https://staging.platform.lostproperty.studio`, sign in with your studio email, and go to `/p/tileyard`. You're
studio staff on staging just as on live, so you see the working copy and everything in Labs.

## What's different on staging

- The **new portal** is on (`PORTAL_V2=1`): a new home page, and the apps (Writer, Director, Designer, Photographer)
  in their own section of the sidebar, each opening on its files.
- **Guidelines, Showcase, Resources and Settings** are the live versions, reading the copied content.
- People, conversations and the client's AI key aren't copied. Staging uses the studio's AI key.

## Bringing it to live, later
When the new portal is ready, `feature/portal-v2` goes into `main` by pull request. `PORTAL_V2` stays off on live,
so nothing changes for clients until it's switched on (then per client, through Releases).
