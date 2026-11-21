# The brand panel in Figma and FigJam

This is the Lost Property brand panel as a Figma plugin. It works in Figma design files and FigJam.

- **The panel** is a page on the platform (`/panel/figma`), the same panel as in Canva, Office and Google. The plugin opens it as its window.
- **`code.js`** places things in the file when the panel asks:
  - logos as vectors;
  - photos as image fills;
  - text in the brand's typeface if it's installed (Inter if not);
  - colours as fills on whatever's selected.

  It also keeps the panel's sign-in in Figma's storage for the plugin.
- **Sign-in:** by link, like Office and Google. The panel shows a short code and opens a page on the platform, where you sign in, check the code and choose the brand.

## Try it (Figma desktop app)

1. In Figma, open any design file.
2. Go to **Menu → Plugins → Development → Import plugin from manifest…** and choose `manifest.json` in this folder.
3. Run it from **Plugins → Development → Brand panel by Lost Property**.

`PLATFORM` in `code.js` points at staging. Change it to the live address when the panel is released.

## Publish it

- **Organization or Enterprise plan:** publish privately to the organisation. Each client with one of those plans gets the plugin privately.
- **Any other plan:** publish once to the Figma Community. Anyone can install it, but it only shows a brand to people who sign in to that brand's portal.

Figma reviews Community plugins, which takes a few days. Use the LP mark from `public/panel/` as the icon.
