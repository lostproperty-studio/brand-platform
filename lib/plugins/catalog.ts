// Plug-ins: the brand inside the tools a client already uses, and their own file storage. Safe for client components.
// What each plug-in offers is set by what that app actually allows, so the settings differ from one to the next.
// `status`: 'ready' works now; 'soon' is shown to the studio only, as what's coming.

export type PluginId = 'canva' | 'figma' | 'office' | 'google' | 'gdrive' | 'dropbox' | 'sharepoint' | 'github';
export type PanelHost = 'canva' | 'office' | 'google' | 'figma';
export type Status = 'ready' | 'soon';

export type SettingDef = {
  id: string; label: string; about?: string;
  type: 'toggle' | 'text';
  default: boolean | string;
  /** Only the studio sees and changes it (e.g. something still in preview with the app's maker) */
  studioOnly?: boolean;
  /** Shown, but not working yet */
  soon?: boolean;
  tag?: string;
};

export type PluginDef = {
  id: PluginId; name: string; group: 'apps' | 'storage';
  line: string;
  /** The LP panel inside the app: where it shows, and what the client needs for it */
  panel?: { host: PanelHost; where: string; needs: string; status: Status };
  /** Connecting an account so the platform can send things in (Sync with Canva, a storage folder) */
  account?: { action: string; about: string; status: Status };
  /** What it can do, and what the app doesn't allow (said plainly, so nobody expects it) */
  can: string[];
  cant: string[];
  settings: SettingDef[];
};

const keepOriginals: SettingDef = { id: 'home', label: 'Keep Photographer and Director originals here', about: 'Full-size images and videos are stored in this account; the platform keeps small previews so the apps stay quick. Only one storage account can hold the originals.', type: 'toggle', default: false };
const syncKit: SettingDef = { id: 'kit', label: 'Keep the brand kit up to date here', about: 'Logos, fonts and their licence, tokens and guidelines, updated every time the guidelines are published.', type: 'toggle', default: true };
const folder: SettingDef = { id: 'folder', label: 'Folder name', type: 'text', default: '' };

export const PLUGINS: PluginDef[] = [
  {
    id: 'canva', name: 'Canva', group: 'apps',
    line: 'The brand panel inside Canva, and the brand’s files in a Canva folder of their own.',
    panel: { host: 'canva', where: 'In the Canva editor, under Apps', needs: 'Canva Enterprise: private apps are only for Enterprise teams. Your Canva admin approves it once.', status: 'ready' },
    account: { action: 'Sync with Canva', about: 'Sends the logos and approved images into a folder in your Canva, and keeps it up to date.', status: 'ready' },
    can: ['Place logos and approved images in a design with a click or a drag', 'Colours with their hex values and where each one goes', 'Approved copy and the tone of voice', 'Ask questions about the brand without leaving Canva', 'A folder of brand files kept up to date when the guidelines are published'],
    cant: ['Install the brand typefaces: add them to your Canva Brand Kit (licence allowing)', 'Change your Brand Kit colours: Lost Property sets these up with you once'],
    settings: [
      { id: 'logos', label: 'Send the logos', type: 'toggle', default: true },
      { id: 'images', label: 'Send approved Photographer images', about: 'Images in collections that have been signed off.', type: 'toggle', default: true },
      { id: 'auto', label: 'Update when the guidelines are published', type: 'toggle', default: true },
      { id: 'templates', label: 'Designer templates as Canva brand templates', about: 'Canva still has this in preview, so it may change.', type: 'toggle', default: false, studioOnly: true, soon: true, tag: 'Preview' }
    ]
  },
  {
    id: 'figma', name: 'Figma', group: 'apps',
    line: 'The brand panel in Figma, and the brand as a Figma library your team can publish.',
    panel: { host: 'figma', where: 'In Figma, under Plugins', needs: 'Kept private to your team on Figma’s Organization or Enterprise plan. On other plans, Lost Property publishes it to the Figma Community and it signs in to your portal like the others.', status: 'soon' },
    account: { action: 'Make a brand library', about: 'The plugin builds a library file in your Figma: colour styles and variables, text styles and logo components, from the guidelines. Publish it once and your whole team has it.', status: 'soon' },
    can: ['Place logos and approved images on the canvas', 'Colours, approved copy and Ask, as in every panel', 'Build a library file of colour variables, text styles and logo components, ready to publish to your team'],
    cant: ['Install the brand typefaces: each designer installs them, or your Figma admin shares them across the organisation'],
    settings: []
  },
  {
    id: 'office', name: 'Microsoft Office', group: 'apps',
    line: 'The brand panel in Word, PowerPoint, Excel and Outlook.',
    panel: { host: 'office', where: 'A Brand button on the Home tab in Word, PowerPoint and Excel, and when writing an email in Outlook', needs: 'Your Microsoft 365 admin adds it for the organisation once, in the admin centre (Settings → Integrated apps). Microsoft doesn’t need to review it.', status: 'ready' },
    can: ['Place logos and approved images in a document, slide, sheet or email', 'Colours, approved copy and Ask, as in every panel', 'Branded PowerPoint and Word templates, through SharePoint (coming with SharePoint below)'],
    cant: ['Install the brand typefaces on people’s computers: your IT team does this from the font files in the kit'],
    settings: [
      { id: 'templates', label: 'Put the brand templates in your organisation’s template library', about: 'Needs SharePoint connected below.', type: 'toggle', default: false, soon: true }
    ]
  },
  {
    id: 'google', name: 'Google Workspace', group: 'apps',
    line: 'The brand panel in Google Docs, Slides and Sheets.',
    panel: { host: 'google', where: 'In Docs, Slides and Sheets, under Extensions', needs: 'Your Google Workspace admin installs it for the organisation once, from the Google Workspace Marketplace.', status: 'ready' },
    can: ['Place logos and approved images in a doc, deck or sheet', 'Colours, approved copy and Ask, as in every panel', 'Brand templates in a shared Drive folder (coming with Google Drive below)'],
    cant: ['Add the brand typefaces to Google’s font menu: Google only offers its own fonts'],
    settings: [
      { id: 'templates', label: 'Put the brand templates in a shared Drive folder', about: 'Needs Google Drive connected below.', type: 'toggle', default: false, soon: true }
    ]
  },
  {
    id: 'gdrive', name: 'Google Drive', group: 'storage',
    line: 'The brand kit, and if you like your Photographer and Director files, in your Drive.',
    account: { action: 'Connect Google Drive', about: 'Choose a folder or shared drive. The platform only touches the folder it makes.', status: 'soon' },
    can: ['The brand kit, updated on every publish', 'Photographer images and Director videos at full size'],
    cant: [],
    settings: [syncKit, keepOriginals, folder]
  },
  {
    id: 'dropbox', name: 'Dropbox', group: 'storage',
    line: 'The brand kit, and if you like your Photographer and Director files, in your Dropbox.',
    account: { action: 'Connect Dropbox', about: 'The platform works in one app folder in your Dropbox and nowhere else.', status: 'soon' },
    can: ['The brand kit, updated on every publish', 'Photographer images and Director videos at full size'],
    cant: [],
    settings: [syncKit, keepOriginals, folder]
  },
  {
    id: 'sharepoint', name: 'SharePoint and OneDrive', group: 'storage',
    line: 'The brand kit, and if you like your Photographer and Director files, in a SharePoint site.',
    account: { action: 'Connect SharePoint', about: 'Choose the site and library. Also where the Office templates go.', status: 'soon' },
    can: ['The brand kit, updated on every publish', 'Photographer images and Director videos at full size', 'The home for Office templates'],
    cant: [],
    settings: [syncKit, keepOriginals, folder]
  },
  {
    id: 'github', name: 'GitHub', group: 'storage',
    line: 'The brand kit in your own GitHub, for your developers.',
    account: { action: 'Connect GitHub', about: 'Install the Lost Property app on your GitHub and choose a repository.', status: 'soon' },
    can: ['The brand kit as code: tokens, guidelines, assets and templates', 'Changes arrive as pull requests your developers can review'],
    cant: ['Hold Photographer and Director files: GitHub isn’t made for large images and video'],
    settings: [syncKit, { id: 'pr', label: 'Send updates as pull requests', type: 'toggle', default: true }]
  }
];

export const pluginById = (id: string) => PLUGINS.find((p) => p.id === id);
export const isPluginId = (id: string): id is PluginId => PLUGINS.some((p) => p.id === id);

/** A plug-in's settings with the defaults filled in */
export function settingsOf(def: PluginDef, saved?: Record<string, unknown> | null) {
  const out: Record<string, boolean | string> = {};
  for (const s of def.settings) { const v = saved?.[s.id]; out[s.id] = typeof v === typeof s.default ? (v as boolean | string) : s.default; }
  return out;
}

/** What the LP panel shows, the same in every app. Set once per client, in Resources → Plug-ins. */
export type PanelSettings = { logos: boolean; colours: boolean; type: boolean; images: boolean; words: boolean; ask: boolean };
export const PANEL_DEFAULTS: PanelSettings = { logos: true, colours: true, type: true, images: true, words: true, ask: true };
export const PANEL_PARTS: { id: keyof PanelSettings; label: string }[] = [
  { id: 'logos', label: 'Logos' }, { id: 'colours', label: 'Colours' }, { id: 'type', label: 'Type' },
  { id: 'images', label: 'Images' }, { id: 'words', label: 'Words' }, { id: 'ask', label: 'Ask' }
];
export function readPanel(content: unknown): PanelSettings {
  const p = (content as { panel?: Partial<PanelSettings> } | null)?.panel || {};
  return Object.fromEntries(PANEL_PARTS.map(({ id }) => [id, typeof p[id] === 'boolean' ? p[id] : PANEL_DEFAULTS[id]])) as PanelSettings;
}

/** Where the panel signs in. Canva's private apps are made inside the client's own Canva team, so each client's
 *  panel gets its own credentials to paste in there. */
export const HOST_NAME: Record<PanelHost, string> = { canva: 'Canva', office: 'Microsoft Office', google: 'Google Workspace', figma: 'Figma' };
