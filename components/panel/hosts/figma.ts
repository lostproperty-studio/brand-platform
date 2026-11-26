import type { PanelBrand, PanelHostApi } from '../types';
import { copyText } from './images';

// The panel in Figma and FigJam. The plugin opens this page as its window, and Figma passes messages between the page
// and the plugin's own code (plugins/figma/code.js), which is what can change the file. Logos go in as vectors,
// photos as image fills, text in the brand's typeface when it's installed, and colours fill the selection.

type Req =
  | { op: 'svg'; svg: string; name: string; width: number }
  | { op: 'image'; bytes: Uint8Array; name: string; w: number; h: number }
  | { op: 'text'; text: string; font: string }
  | { op: 'fill'; hex: string; name: string }
  | { op: 'open'; url: string }
  | { op: 'store'; key: string; value: string | null }
  | { op: 'ready' };
type Msg = { lp?: number; id?: number; ok?: boolean; error?: string; op?: string; store?: Record<string, string | null>; editor?: string };

let n = 0;
const waiting = new Map<number, { ok: () => void; fail: (e: Error) => void }>();
let onInit: ((m: Msg) => void) | null = null;
if (typeof window !== 'undefined') window.addEventListener('message', (e) => {
  // Only Figma (the window that opened this page) talks to the panel
  if (e.source !== window.parent && !/^https:\/\/([a-z0-9-]+\.)?figma\.com$/.test(e.origin)) return;
  const d = (e.data as { pluginMessage?: Msg })?.pluginMessage;
  if (d?.lp !== 1) return;
  if (d.op === 'init') { onInit?.(d); return; }
  if (typeof d.id !== 'number') return;
  const w = waiting.get(d.id); if (!w) return;
  waiting.delete(d.id);
  if (d.ok) w.ok(); else w.fail(new Error(d.error || 'Figma didn’t take it'));
});

// Figma's plugin windows have no web origin, so messages to them can't name a target and go to '*'. Before sending
// anything (it includes the panel's sign-in tokens to keep), check every window around this page is Figma or a
// sandboxed frame inside it, so a copy of this page framed by another site is never handed them.
function inFigma() {
  if (typeof window === 'undefined' || window.parent === window) return false;
  const a = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (!a) return true; // browsers without ancestorOrigins (Figma's desktop app and Chrome have it)
  const list = Array.from({ length: a.length }, (_, i) => a.item(i) || '');
  return list.length > 0 && list.some((o) => /^https:\/\/([a-z0-9-]+\.)*figma\.com$/.test(o)) && list.every((o) => o === 'null' || /^https:\/\/([a-z0-9-]+\.)*figma\.com$/.test(o));
}
const post = (msg: object) => { if (inFigma()) window.parent.postMessage({ pluginMessage: { lp: 1, ...msg }, pluginId: '*' }, '*'); };
function send(req: Req, timeout = 60_000) {
  const id = ++n;
  return new Promise<void>((ok, fail) => {
    waiting.set(id, { ok, fail });
    post({ id, ...req });
    setTimeout(() => { if (waiting.delete(id)) fail(new Error('Figma didn’t answer. Close the plugin and open it again.')); }, timeout);
  });
}

/** Tell the plugin the page is ready, and get back what it keeps for the panel (the sign-in) and which editor it's in */
export function figmaHello(): Promise<{ store: Record<string, string | null>; editor: string } | null> {
  return new Promise((ok) => {
    const t = setTimeout(() => { onInit = null; ok(null); }, 4000);
    onInit = (m) => { clearTimeout(t); onInit = null; ok({ store: m.store || {}, editor: m.editor || 'figma' }); };
    post({ op: 'ready' });
  });
}

/** The panel's sign-in kept in Figma's own storage for the plugin (the page's storage may not last in Figma's app) */
export function figmaStore(seed: Record<string, string | null>) {
  const mem = new Map(Object.entries(seed).filter(([, v]) => v !== null) as [string, string][]);
  return {
    get: (k: string) => mem.get(k) ?? null,
    set: (k: string, v: string | null) => { if (v === null) mem.delete(k); else mem.set(k, v); send({ op: 'store', key: k, value: v }).catch(() => {}); }
  };
}

export const figmaName = (editor?: string) => (editor === 'figjam' ? 'FigJam' : editor === 'slides' ? 'Figma Slides' : 'Figma');
export const figmaOpen = (url: string) => { send({ op: 'open', url }).catch(() => window.open(url, '_blank', 'noopener')); };

export function figmaHost(editor: string) {
  return (ask: PanelHostApi['ask'], brand: PanelBrand): PanelHostApi => ({
    name: figmaName(editor),
    insertImage: async (img) => {
      const r = await fetch(img.url); if (!r.ok) throw new Error('Couldn’t fetch the image');
      if (img.format === 'svg') { await send({ op: 'svg', svg: await r.text(), name: img.name, width: 320 }); return; }
      const bytes = new Uint8Array(await r.arrayBuffer());
      await send({ op: 'image', bytes, name: img.name, w: img.w || 0, h: img.h || 0 });
    },
    insertText: (text) => send({ op: 'text', text, font: brand.type[brand.type.length > 1 ? 1 : 0]?.name || '' }),
    fillColour: (c) => send({ op: 'fill', hex: c.hex, name: c.name }),
    copy: copyText,
    ask,
    openPortal: () => figmaOpen(brand.portalUrl)
  });
}
