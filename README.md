# Lost Property brand platform

Client brand portals and AI-ready brand kits. The studio links a Figma guidelines file; the platform scans it, asks the studio to confirm what it found, and produces a **kit of parts** in open formats. It commits the kit to a private GitHub repository for each client and shows it in that client's portal.

Live at `brand.lostproperty.studio` (staging on Vercel first).

## What it does

| Area | Where | Notes |
| --- | --- | --- |
| Studio dashboard | `/studio` | Projects grid, filters (All, Live, Draft, Archive), clients |
| Figma scan → review | `POST /api/projects/:id/scan` | Reads the page via the Figma REST API, groups frames into chapters, runs exact checks (trial fonts, lorem ipsum, contrast, empty asset frames) and a Claude pass that drafts measurable rules and questions. Uses the **studio** Anthropic key: this is studio work. |
| Kit build | `POST /api/projects/:id/kit` | Assets (SVG + PNG from Figma), W3C design tokens, Markdown guidelines, `AGENTS.md`, HTML/CSS templates with `data-slot` fields. First build commits to `main`; later builds open a pull request. |
| Publish | `POST /api/projects/:id/publish` | Freezes a snapshot. Clients, the chat and the connector only ever see published content. |
| Client portal | `/p/:slug` | Deliverables space (first cut). Guidelines, Showcase, Canvas and Chat are being ported from the prototype. |
| AI, route 1 | `POST /api/p/:slug/ai-key`, `/chat`, `/canvas` | The **client's own** Anthropic key, encrypted (AES-256-GCM) and never sent back to the browser. Chat and Canvas are locked until a key is added. Usage is logged per project. |
| AI, route 3 | `POST /api/p/:slug/connector`, `/api/mcp/:slug` | A read-only MCP connector the client adds to their own Claude: overview, tokens, guidelines, assets, templates. |

Access: magic-link sign-in. Staff are recognised by email domain (`STUDIO_EMAIL_DOMAINS`). Clients only see projects they're members of, enforced by row-level security in Postgres.

## Setup

1. **Supabase**: create a project (EU region), then run `supabase/migrations/0001_init.sql` (SQL editor, or `supabase db push`). Under Auth → URL configuration, set the site URL to the app URL and add `<app>/auth/callback` as a redirect.
2. **Figma**: from the studio account, create a personal access token with `file_content:read`.
3. **Anthropic**: create a studio API key for scanning only.
4. **GitHub App**: create an app on the studio account/org with *Contents: read & write*, *Pull requests: read & write* and *Administration: read & write* (to create repositories). Install it on the account, then note the App ID, installation ID and private key.
5. **Vercel**: import this repository and add every variable in `.env.example`. Generate `KEY_ENCRYPTION_SECRET` with `openssl rand -base64 32`.
6. **Domain**: in Vercel → Domains, add `brand.lostproperty.studio`, then add the CNAME record it shows (`brand` → `cname.vercel-dns.com`) at your DNS provider.

```bash
npm install
cp .env.example .env.local   # fill in
npm run dev
```

## Client handover: connecting AI

1. The client creates an account at console.anthropic.com, adds billing and sets a monthly spend limit.
2. They create an API key and paste it into **Portal → Settings → Connect AI**. Chat and Canvas unlock.
3. Optional: **Settings → Claude connector** gives a URL they can add as a custom connector in their own Claude.

## Status

v0.1 foundation: schema, scan, review, kit build, GitHub repos, publish, client AI key, chat, canvas, connector, dashboard and Deliverables. Next: port the studio wizard and review screens, and the full client portal, from the design prototype.
