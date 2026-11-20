'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LpPanel } from './LpPanel';
import { PanelSession, type LinkStart } from './linkSession';
import type { PanelBrand, PanelHostApi } from './types';
import { LpAppIcon } from './LpAppIcon';

// The panel in apps that sign in by link (Office, Google Workspace, Figma): signs in, loads the brand, and hands the
// shared panel a host that can act in the app. `hostApi` gets the session so Ask can call the platform.
export function PanelShell({ session, where, hint, hostApi, openUrl }: {
  session: PanelSession; where: string; hint?: string;
  hostApi: (ask: PanelHostApi['ask'], brand: PanelBrand) => PanelHostApi;
  openUrl: (url: string) => void;
}) {
  const [state, setState] = useState<'checking' | 'signin' | 'waiting' | 'ready' | 'error'>('checking');
  const [brand, setBrand] = useState<PanelBrand | null>(null);
  const [link, setLink] = useState<LinkStart | null>(null);
  const [msg, setMsg] = useState('');
  const stop = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await session.api('/brand');
      if (!r.ok) { setMsg(await r.text()); setState('error'); return; }
      setBrand(await r.json()); setState('ready');
    } catch (e) { if ((e as { signin?: boolean }).signin) setState('signin'); else { setMsg('Couldn’t reach the brand portal. Check your connection and try again.'); setState('error'); } }
  }, [session]);
  useEffect(() => { if (session.signedIn) load(); else setState('signin'); return () => { stop.current = true; }; }, [session, load]);

  async function signIn() {
    setMsg(''); stop.current = false;
    try {
      const l = await session.start(hint);
      setLink(l); setState('waiting'); openUrl(l.url);
      const ok = await session.wait(l, () => stop.current);
      if (ok) { setState('checking'); load(); } else if (!stop.current) { setMsg('That sign-in ran out. Try again.'); setState('signin'); }
    } catch (e) { setMsg((e as Error).message); setState('signin'); }
  }

  const ask: PanelHostApi['ask'] = useMemo(() => async (question, history) => {
    const r = await session.api('/ask', { method: 'POST', body: JSON.stringify({ where, messages: [...history, { role: 'user', content: question }] }) });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).answer;
  }, [session, where]);
  const host = useMemo(() => (brand ? hostApi(ask, brand) : null), [brand, ask, hostApi]);

  if (state === 'ready' && brand && host) return <LpPanel brand={brand} host={host} />;
  return <div className="lpx lpx-gate">
    <LpAppIcon size={28} className="lpx-icon" />
    {state === 'checking' ? <p className="lpx-sub">Loading the brand…</p> : null}
    {state === 'signin' ? <>
      <p className="lpx-client">Your brand, in {where}</p>
      <p className="lpx-lede">Sign in with the email you use for your brand portal. You’ll get logos, colours, images and the words, ready to use.</p>
      <button type="button" className="lpx-send lpx-wide" onClick={signIn}>Sign in to the brand portal</button>
      {msg ? <p className="lpx-sub">{msg}</p> : null}
    </> : null}
    {state === 'waiting' && link ? <>
      <p className="lpx-client">Finish signing in</p>
      <p className="lpx-lede">A page has opened in your browser. Sign in there and check it shows this code:</p>
      <p className="lpx-code">{link.words}</p>
      <p className="lpx-sub"><span className="lpx-dots" aria-hidden><span /><span /><span /></span> Waiting for you to sign in</p>
      <button type="button" className="lpx-link" onClick={() => openUrl(link.url)}>Open the page again</button>
      <button type="button" className="lpx-link" onClick={() => { stop.current = true; setState('signin'); }}>Cancel</button>
    </> : null}
    {state === 'error' ? <>
      <p className="lpx-lede">{msg}</p>
      <button type="button" className="lpx-chip-btn" onClick={() => { setState('checking'); load(); }}>Try again</button>
    </> : null}
    <p className="lpx-sub lpx-credit">Lost Property</p>
  </div>;
}
