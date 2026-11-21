# The brand panel in Figma and FigJam

This is the Lost Property brand panel as a Figma plugin. It works in Figma design files and FigJam.

- **The panel** is a page on the platform (`/panel/figma`), the same panel as in Canva, Office and Google. The plugin opens it as its window.
- **`code.js`** (written in `lib/plugins/figma.ts`) places things in the file when the panel asks:
  - logos as vectors;
  - photos as image fills;
  - text in the brand's typeface if it's installed (Inter if not);
  - colours as fills on whatever's selected.

  It also keeps the panel's sign-in in Figma's storage for the plugin.
- **Sign-in:** by link, like Office and Google. The panel shows a short code and opens a page on the platform, where you sign in, check the code and choose the brand.

## Where the code is

`lib/plugins/figma.ts` builds the plugin: `manifest.json`, `code.js` and a README, zipped. Anyone on a portal downloads it from **Resources → Plug-ins → Figma** (`/api/p/<portal>/plugins/figma/plugin`). Each download:
- points at the platform it came from, staging or live;
- signs in to that portal's brand first.

## Add it (Figma desktop app)

1. Unzip the download.
2. In any Figma file, go to **Menu → Plugins → Development → Import plugin from manifest…** and choose `manifest.json`.
3. Run it from **Plugins → Development → Brand panel by Lost Property**.

## Publish it

- **Organization or Enterprise plan:** publish privately to the organisation. Each client with one of those plans gets the plugin privately.
- **Any other plan:** publish once to the Figma Community. Anyone can install it, but it only shows a brand to people who sign in to that brand's portal.

Figma reviews Community plugins, which takes a few days. Use the LP mark from `public/panel/` as the icon.
