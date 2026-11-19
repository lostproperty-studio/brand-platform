# App icons for Resources → Plug-ins

Each app's official icon, named by its id. Take it from the maker's own brand or press page, and don't recolour or redraw it.

- A square app icon with its own background: `<id>.png` (256 × 256 is plenty). It fills the tile's mark.
- A bare logo on transparent: `<id>.svg`. It sits inside a white mark.

Then add it to `ICONS` in `components/portal/Plugins.tsx`, e.g. `dropbox: 'png'`. Until then the tile shows a monogram.

Ids: canva, figma, office, google, gdrive, dropbox, sharepoint, github.
All eight are in.
