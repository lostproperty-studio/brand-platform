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
3. Leave **Auth → SMTP** alone. The platform sends its own sign-in emails using the email variables below.

### 2. A staging site on Vercel
1. In Vercel, **Add New → Project**, and import `lostproperty-studio/brand-platform` again (a second project, called
   **brand-platform-staging**). Add the variables in the table below before the first deploy.
2. On the next screen, next to **Supabase**, click **Add → Link Existing Supabase Account**, and pair the Supabase
   project **brand-platform-staging** with the Vercel project **brand-platform-staging**. It may say the repository
   "already has an installed connection"; the variables are added anyway (check for `NEXT_PUBLIC_SUPABASE_URL` and
   `POSTGRES_URL_NON_POOLING` under **Settings → Environment Variables**, pointing at the staging project). Never add
   Supabase variables from the live project.
3. Under **Settings → Git**, set the production branch to `feature/portal-v2`.
4. The variables to add yourself:

| Variable | Value |
| --- | --- |
| `PORTAL_V2` | `1` (turns the new portal on, on staging only) |
| `MIGRATE_ON_PREVIEW` | `1` (lets staging set up its own database; it never touches live) |
| `NEXT_PUBLIC_APP_URL` | `https://staging.platform.lostproperty.studio` |
| `STUDIO_EMAIL_DOMAINS` | `lostproperty.studio` |
| `ANTHROPIC_API_KEY` | the studio key (or a separate one, to see staging's spend apart) |
| `FIGMA_TOKEN`, `GITHUB_*`, `EMAIL_*`/`SMTP_*` | same as live |

Don't put anything from the live Supabase project on the staging site.

5. Under **Settings → Domains**, add `staging.platform.lostproperty.studio` and add the CNAME record it shows.
6. Deploy. The first build sets up the staging database from `supabase/migrations`.

### 3. Copy Tileyard across
This runs once from a computer, not on the staging site. Make a file called `.env.staging` holding the staging
project's `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, plus two lines for the **live** project, used
only to read from it (the script never writes to live):

| Variable | Where it's from |
| --- | --- |
| `SOURCE_SUPABASE_URL` | live Supabase → Project Settings → Data API → Project URL |
| `SOURCE_SUPABASE_SERVICE_KEY` | live Supabase → Project Settings → API Keys → service_role |

Delete the file afterwards. Then:

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

## Bringing it to live
`feature/portal-v2` goes into `main` by pull request. `PORTAL_V2` stays off on live. Instead, the new portal is a
release stage per client, **New portal** in Admin settings → Releases, starting at Studio only: studio staff see it in
the studio preview, and moving a client to Client beta or Live gives their team the new portal. Switching back is
instant. The staging site keeps `PORTAL_V2=1`, which turns it on for every project there.

Still staging-only after the merge (they follow `PORTAL_V2` alone): the brand panel inside Canva, Office, Google
Workspace and Figma, and chatting with Lost Property from the Ask bar.
