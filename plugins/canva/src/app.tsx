import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '@canva/user';
import { upload } from '@canva/asset';
import { addElementAtPoint, ui } from '@canva/design';
import { requestOpenExternalUrl } from '@canva/platform';
import { LpPanel } from '../../../components/panel/LpPanel';
import type { PanelBrand, PanelHostApi } from '../../../components/panel/types';

// The LP panel inside Canva. Signs in to the client's brand portal (the platform is the sign-in provider, set up
// per client in Resources → Plug-ins), loads that client's brand and places things into the design. The panel
// itself is the shared component, so it looks and works the same as in Office and Google.

const oauth = auth.initOauth();
type Img = { url: string; name: string; format: 'svg' | 'png' | 'jpg'; w?: number; h?: number };
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg' } as const;

async function toCanva(img: Img) {
  return upload({ type: 'image', name: img.name, url: img.url, thumbnailUrl: img.url, mimeType: MIME[img.format], aiDisclosure: 'none' });
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return; } catch { /* the app frame may not allow it: fall back */ }
  const t = document.createElement('textarea'); t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove();
  if (!ok) throw new Error('Couldn’t copy here');
}

export function App() {
  const [state, setState] = useState<'checking' | 'signin' | 'ready' | 'error'>('checking');
  const [brand, setBrand] = useState<PanelBrand | null>(null);
  const [msg, setMsg] = useState('');

  const api = useCallback(async (path: string, init: RequestInit = {}, retry = true): Promise<Response> => {
    const t = await oauth.getAccessToken({ forceRefresh: !retry });
    if (!t) throw Object.assign(new Error('signin'), { signin: true });
    const r = await fetch(`${BACKEND_HOST}/api/panel${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${t.token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401 && retry) return api(path, init, false);
    if (r.status === 401) throw Object.assign(new Error('signin'), { signin: true });
    return r;
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api('/brand');
      if (!r.ok) { setMsg(await r.text()); setState('error'); return; }
      setBrand(await r.json()); setState('ready');
    } catch (e) { if ((e as { signin?: boolean }).signin) setState('signin'); else { setMsg('Couldn’t reach the brand portal. Check your connection and try again.'); setState('error'); } }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  async function signIn() {
    setMsg('');
    const r = await oauth.requestAuthorization();
    if (r.status === 'completed') { setState('checking'); load(); } else setMsg('Sign-in didn’t finish. Try again.');
  }

  const host: PanelHostApi = useMemo(() => ({
    name: 'Canva',
    insertImage: async (img) => {
      const { ref } = await toCanva(img);
      await addElementAtPoint({ type: 'image', ref, altText: { text: img.name, decorative: false } });
    },
    dragImage: (e, img) => {
      ui.startDragToPoint(e as Parameters<typeof ui.startDragToPoint>[0], { type: 'image', previewUrl: img.url, previewSize: { width: 160, height: img.w && img.h ? Math.round(160 * img.h / img.w) : 120 }, resolveImageRef: () => toCanva(img) });
    },
    insertText: async (text) => { await addElementAtPoint({ type: 'text', children: [text] }); },
    copy: copyText,
    ask: async (question, history) => {
      const r = await api('/ask', { method: 'POST', body: JSON.stringify({ where: 'Canva', messages: [...history, { role: 'user', content: question }] }) });
      if (!r.ok) throw new Error(await r.text());
      return (await r.json()).answer;
    },
    openPortal: () => { if (brand) requestOpenExternalUrl({ url: brand.portalUrl }); }
  }), [api, brand]);

  if (state === 'ready' && brand) return <LpPanel brand={brand} host={host} />;
  return <div className="lpx lpx-gate">
    <span className="lpx-mark" aria-hidden />
    {state === 'checking' ? <p className="lpx-sub">Loading the brand…</p> : null}
    {state === 'signin' ? <>
      <p className="lpx-client">Your brand, in Canva</p>
      <p className="lpx-lede">Sign in with the email you use for your brand portal. You’ll get logos, colours, images and the words, ready to use.</p>
      <button type="button" className="lpx-send lpx-wide" onClick={signIn}>Sign in to the brand portal</button>
    </> : null}
    {state === 'error' ? <>
      <p className="lpx-lede">{msg}</p>
      <button type="button" className="lpx-chip-btn" onClick={() => { setState('checking'); load(); }}>Try again</button>
    </> : null}
    {msg && state === 'signin' ? <p className="lpx-sub">{msg}</p> : null}
    <p className="lpx-sub lpx-credit">Lost Property</p>
  </div>;
}
