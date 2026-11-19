// The LP panel's data and the things it asks its host app to do. No imports: the Canva app bundle uses this file too.

export type PanelLogo = { id: string; name: string; group: string; format: 'svg' | 'png'; url: string; onDark: boolean };
export type PanelColour = { name: string; hex: string; role: string };
export type PanelFont = { role: string; name: string; usage: string };
export type PanelImage = { id: string; name: string; url: string; w: number; h: number; collection: string };
export type PanelWords = { summary: string; principles: string[]; lines: string[] };

export type PanelBrand = {
  client: string; line: string; portalUrl: string;
  show: { logos: boolean; colours: boolean; type: boolean; images: boolean; words: boolean; ask: boolean };
  logos: PanelLogo[]; colours: PanelColour[]; type: PanelFont[]; images: PanelImage[]; words: PanelWords;
  rules: { logo: string[]; colour: string[]; type: string[] };
};

/** What the panel can ask the app it's in to do. Anything a host can't do is left undefined and the panel hides it. */
export type PanelHostApi = {
  name: string;
  /** Put an image (a logo or a photo) into the open design, document or slide */
  insertImage?: (img: { url: string; name: string; format: 'svg' | 'png' | 'jpg'; w?: number; h?: number }) => Promise<void>;
  /** Start dragging an image into the design (Canva). Click must always work too. */
  dragImage?: (e: unknown, img: { url: string; name: string; format: 'svg' | 'png' | 'jpg'; w?: number; h?: number }) => void;
  insertText?: (text: string) => Promise<void>;
  copy: (text: string) => Promise<void>;
  ask?: (question: string, history: { role: 'user' | 'assistant'; content: string }[]) => Promise<string>;
  openPortal?: () => void;
};
