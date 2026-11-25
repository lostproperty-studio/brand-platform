# Changelog

The platform's releases, newest first. Process: [RELEASING.md](RELEASING.md).

## 1.0.0-beta.3 — 25 November 2026

The new portal from staging, a clearer way to publish, and a Claude connector that sees the whole brand.

**For the studio**
- Each project has a sidebar: Overview; Guidelines, Showcase, Typefaces, Voice, Motion, Resources, PDF; Client and Settings.
- Publish is at the top right of every section and shows how many changes clients can't see yet. The overview lists changes and versions: what's waiting, and each publish with who did it and what it took live.
- New portal in Admin settings → Releases, per client, starting at Studio only.
- Settings: Share font files with the client's Claude (off unless the licence allows it).
- The overview lists placeholder text still in the published guidelines.
- Director, first working version (Labs).

**For clients**
- The client's own Claude (the connector) now sees each guideline chapter's pictures, the brand imagery and templates, gets every font weight and text style, and gets download links that don't expire. Unwritten points are flagged as not written, instead of passed on as placeholder text.
- Updated Ask bar, Resources (Custom Apps), Showcase (straight into the imagery) and Settings, and a phone layout with a tab bar along the bottom.
- Fix: sign-in links from work email no longer show “That link has expired”. Email security checks (such as Microsoft Defender) were opening the link first and using it up; the sign-in page now waits for the person to press Continue.
- When the New portal stage is moved on for them: a new home page, the guidelines with their own chapter list, and the apps (Writer, Director) in their own section.

## 1.0.0-beta.2 — 14 November 2026

A release gate, so new work can't reach clients without approval.

**For the studio**
- Releases in Admin settings: the running version and environment, and a stage per feature per client (Off, Studio only, Client beta, Live).
- Director, studio only and marked Labs: the first look at a short-form video tool built on each brand's creative direction.
- Preview deploys no longer run database migrations, so only live deploys change the database.

**For clients**
- No visible changes.

## 1.0.0-beta.1

The first client beta.

- Client portals: Home, Guidelines, Showcase, Writer, Resources and Settings, with Ask on every page.
- Kits of parts from Figma, published per project, with a client connector for their own Claude.
- Client roles (creator, manager, admin), invites and requests to Lost Property.
