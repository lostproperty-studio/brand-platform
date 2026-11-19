import type { PanelBrand, PanelHostApi } from '../types';
import { copyText, svgToPng } from './images';

// The panel in Google Docs, Slides and Sheets. It runs inside the add-on's sidebar, which relays what the panel asks
// for to the add-on's own script (Apps Script) and passes the answer back. Google can't place SVG, so logos go as PNG.

type Req = { op: 'image'; url?: string; b64?: string; name: string; width: number } | { op: 'text'; text: string } | { op: 'open'; url: string };
let n = 0;
const waiting = new Map<number, { ok: () => void; fail: (e: Error) => void }>();
if (typeof window !== 'undefined') window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const d = e.data as { lp?: number; id?: number; ok?: boolean; error?: string };
  if (d?.lp !== 1 || typeof d.id !== 'number') return;
  const w = waiting.get(d.id); if (!w) return;
  waiting.delete(d.id);
  if (d.ok) w.ok(); else w.fail(new Error(d.error || 'Google didn’t take it'));
});

function send(req: Req, timeout = 60_000) {
  const id = ++n;
  return new Promise<void>((ok, fail) => {
    waiting.set(id, { ok, fail });
    // The sidebar's address changes every time Google opens it, so the message is addressed to any; it carries no secrets
    window.parent.postMessage({ lp: 1, id, ...req }, '*');
    setTimeout(() => { if (waiting.delete(id)) fail(new Error('Google didn’t answer. Close the sidebar and open it again.')); }, timeout);
  });
}

export const googleName = (app?: string) => ({ docs: 'Google Docs', slides: 'Google Slides', sheets: 'Google Sheets' } as Record<string, string>)[app || ''] || 'Google Workspace';
export const googleOpen = (url: string) => { const w = window.open(url, '_blank', 'noopener'); if (!w) send({ op: 'open', url }).catch(() => {}); };

export function googleHost(app: string | undefined) {
  return (ask: PanelHostApi['ask'], brand: PanelBrand): PanelHostApi => ({
    name: googleName(app),
    insertImage: async (img) => {
      const width = img.format === 'jpg' ? 420 : 200;
      if (img.format === 'svg') { const png = await svgToPng(img.url); await send({ op: 'image', b64: png.b64, name: img.name, width }); return; }
      await send({ op: 'image', url: img.url, name: img.name, width });
    },
    insertText: (text) => send({ op: 'text', text }),
    copy: copyText,
    ask,
    openPortal: () => googleOpen(brand.portalUrl)
  });
}
