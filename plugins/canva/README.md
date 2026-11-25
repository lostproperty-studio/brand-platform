# The brand panel in Canva

This is the Lost Property brand panel as a Canva app. It's the same panel as in Office and Google (the shared component in `components/panel/`). Each client's copy signs in to their own brand portal, so it only ever shows that client's brand.

Canva only lets **private apps** run on Enterprise teams. A private app also has to be made inside the team that will use it, so each client gets their own copy of the app, made in their Canva team. Every copy uses this same build.

## Build it (once, and again when the panel changes)

1. Install the Canva CLI (`npm i -g @canva/cli`) and run `canva apps create`. This gives you Canva's build setup.
2. Replace the new app's `src/` with this folder's `src/`, and its `canva-app.json` with this one.
3. Bring in `components/panel/` from this repository. Either copy it next to `src/`, or point the build at it and fix the import paths in `src/app.tsx`. The bundler must also resolve `react` to the app's own copy.
4. Set `CANVA_BACKEND_HOST` to the platform's address, e.g. `https://staging.platform.lostproperty.studio`. Canva's starter build makes this available as `BACKEND_HOST`.
5. `npm run build` gives you `dist/app.js`. That's the file you upload.

`npm run typecheck` in this folder checks the code against Canva's SDK.

## Set it up for a client

1. **Check the plan.** The client must be on Canva Enterprise.
2. **Make sign-in details.** In their portal, go to Resources → Plug-ins → Canva → *Make sign-in details*. Their lead or the studio can do this. Copy the five values; the secret is shown only once.
3. **Make the app in their team.** Get invited to the client's Canva team (or ask their developer). Then in the Developer Portal: *Your apps* → *Create an app* → **Private**.
   - **Code upload:** upload `dist/app.js`.
   - **Authentication:** turn it on and add a provider using the details from step 2.
     - Authorisation URL
     - Token URL
     - Client ID
     - Client secret
     - Scope: `brand`
     - Token exchange: *credentials in the request body or a Basic header*. Both work.
     - PKCE: on.
   - **App name:** "<Client> brand". Use the LP mark as the icon.
4. **Submit it.** The client's Canva admin approves it under **Settings → Team apps → Release**. It's available to their team straight away.
5. **Use it.** In a design, open **Apps** and choose the panel. People sign in with their portal email.

If you make new sign-in details later, everyone is signed out. Paste the new ones into the app's Authentication settings.

## Sync with Canva (the folder)

This is separate from the panel. It uses Canva's Connect API to keep a "<Client> brand" folder in the client's Canva filled with the logos and approved images.

- **Lost Property's integration:** set `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` on the platform. To work for clients outside our own Canva team, it has to be a **public** integration that Canva has reviewed.
- **Or the client's own:** make a **private** integration in their Canva team. No review is needed. Enter it in the client's portal, under Plug-ins → Canva → *Canva integration*; this is only visible to the studio.
  - Redirect URL: shown in that same panel.
  - Scopes: `asset:read asset:write folder:read folder:write profile:read`.

Then their lead presses **Sync with Canva**. After that, the folder updates whenever the guidelines are published. They can turn this off.

## What Canva doesn't allow

- **Fonts:** apps can't install fonts. Add the brand typefaces to the client's Brand Kit, as long as the licence allows it.
- **Brand Kit colours:** there's no API for these. Set them up with the client once.
