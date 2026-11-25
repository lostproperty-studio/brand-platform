# The brand panel in Google Docs, Slides and Sheets

This is the Lost Property brand panel as a Google Workspace **Editor add-on**, written in Apps Script.

- **The sidebar** shows the panel from the platform (`/panel/google`), the same panel as in Canva and Office.
- **This script** places pictures and text in the open file when the panel asks it to.
- **Sign-in:** people sign in to their own brand portal by link. The panel opens a page on the platform, where they sign in and check a short code. So one add-on works for every client.

## Files

- `appsscript.json` – the scopes it needs:
  - edit the open file only (`*.currentonly`);
  - show a sidebar;
  - fetch the brand's images from the platform's storage.
- `Code.gs` – the menu, the sidebar, and placing pictures and text.
  - Set `PLATFORM` to the platform's address.
- `Sidebar.html` – holds the panel. It passes the panel's requests to the script, and only listens to `PLATFORM`.

## Publish it

Google offers two ways. The difference is who reviews it.

1. **One listing for every client (recommended).** Publish once from Lost Property's Google Workspace as **Public, Unlisted**.
   - Google reviews the listing once.
   - After that, any client's admin installs it from the listing's link, and nobody else can find it.
   - Set `GOOGLE_ADDON_URL` on the platform to the listing's address. The Plug-ins section then shows the link to clients.
2. **A copy just for one client.** The client's own Google Workspace publishes a copy as **Private**.
   - There's no Google review, but it only works inside their domain.
   - Set `BRAND` in `Code.gs` to their portal address (e.g. `tileyard`), so their brand is chosen at sign-in.

Either way:

1. Create an Apps Script project (script.google.com) and paste in the three files.
2. Make a **standard Google Cloud project**, and switch the script to it (Project settings → Google Cloud Platform project). Apps Script's default project can't be used to publish.
3. **Deploy → New deployment → Add-on**, and note the version.
4. In the Cloud project, enable the **Google Workspace Marketplace SDK**.
   - **App configuration:** Editor add-on, with the script ID and version from step 3. Add the scopes from `appsscript.json`.
   - **Store listing:** name "Brand panel by Lost Property", with the LP mark from `public/panel/` as the icon.
5. Publish. For a new version, deploy again and update the version in the Marketplace SDK.

To test before publishing, use **Deploy → Test deployments** from a doc, deck or sheet. You can also share the script project with testers.
