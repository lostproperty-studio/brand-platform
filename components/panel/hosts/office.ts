import type { PanelBrand, PanelHostApi } from '../types';
import { base64Of, copyText, svgToPng } from './images';

// The panel in Word, PowerPoint, Excel and Outlook, through Office's own JavaScript library (office.js, loaded by the
// page). Word, PowerPoint and Excel place pictures and text at the selection; Outlook adds pictures to the email
// being written as inline attachments.

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const Office: any;
const done = (fn: (cb: (r: any) => void) => void) => new Promise<void>((ok, fail) => fn((r) => (r.status === 'succeeded' ? ok() : fail(new Error(r.error?.message || 'Office didn’t take it')))));
const doneWith = <T,>(fn: (cb: (r: any) => void) => void) => new Promise<T>((ok, fail) => fn((r) => (r.status === 'succeeded' ? ok(r.value as T) : fail(new Error(r.error?.message || 'Office didn’t take it')))));

export const officeApp = (): string => { try { return String(Office.context.host || 'Office'); } catch { return 'Office'; } };
export const officeName = () => ({ Word: 'Word', PowerPoint: 'PowerPoint', Excel: 'Excel', Outlook: 'Outlook' } as Record<string, string>)[officeApp()] || 'Office';

export function openInBrowser(url: string) {
  try { if (Office.context.requirements.isSetSupported('OpenBrowserWindowApi', '1.1')) { Office.context.ui.openBrowserWindow(url); return; } } catch { /* fall through */ }
  window.open(url, '_blank', 'noopener');
}

export function officeHost(ask: PanelHostApi['ask'], brand: PanelBrand): PanelHostApi {
  const app = officeApp();
  const mail = app === 'Outlook';
  return {
    name: officeName(),
    insertImage: async (img) => {
      // Logos at a sensible size for a page or slide (points); photos larger
      const width = img.format === 'jpg' ? 420 : 200;
      if (mail) {
        const pic = img.format === 'svg' ? { b64: (await svgToPng(img.url)).b64 } : await base64Of(img.url);
        const file = `${img.name.replace(/[^\w-]+/g, '-').slice(0, 40) || 'image'}-${Date.now().toString(36)}.png`;
        const item = Office.context.mailbox.item;
        await doneWith<string>((cb) => item.addFileAttachmentFromBase64Async(pic.b64, file, { isInline: true }, cb));
        await done((cb) => item.body.setSelectedDataAsync(`<img src="cid:${file}" alt="${img.name.replace(/"/g, '')}" width="${img.format === 'jpg' ? 480 : 220}">`, { coercionType: Office.CoercionType.Html }, cb));
        return;
      }
      const doc = Office.context.document;
      if (img.format === 'svg') {
        if (Office.context.requirements.isSetSupported('ImageCoercion', '1.2')) {
          const svg = await (await fetch(img.url)).text();
          await done((cb) => doc.setSelectedDataAsync(svg, { coercionType: Office.CoercionType.XmlSvg, imageWidth: width }, cb));
          return;
        }
        const png = await svgToPng(img.url);
        await done((cb) => doc.setSelectedDataAsync(png.b64, { coercionType: Office.CoercionType.Image, imageWidth: width }, cb));
        return;
      }
      const pic = await base64Of(img.url);
      await done((cb) => doc.setSelectedDataAsync(pic.b64, { coercionType: Office.CoercionType.Image, imageWidth: width }, cb));
    },
    insertText: async (text) => {
      if (mail) { await done((cb) => Office.context.mailbox.item.body.setSelectedDataAsync(text, { coercionType: Office.CoercionType.Text }, cb)); return; }
      await done((cb) => Office.context.document.setSelectedDataAsync(text, { coercionType: Office.CoercionType.Text }, cb));
    },
    copy: copyText,
    ask,
    openPortal: () => openInBrowser(brand.portalUrl)
  };
}
