'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUp, Loader2, Sparkles } from 'lucide-react';
import { AskMark } from '@/components/portal/AskAnswer';
import { AppIcon } from '@/components/portal/AppIcon';
import { pickGreeting, type GreetingSet } from '@/lib/portal/greetings';
import type { AppKey } from '@/lib/portalVersion';

// Portal v2 home, top: a greeting for the time of day in the brand's voice, the Ask bar, and the apps.
// The Ask bar hands the question to Ask (the dock at the bottom of every page), which answers in place.
export function HomeTop({ slug, client, firstName, greetings, apps, studio }: { slug: string; client: string; firstName: string; greetings?: GreetingSet; apps: { key: AppKey; name: string; ready: boolean }[]; studio: boolean }) {
  const [line, setLine] = useState<[string, string] | null>(null);
  const [set, setSet] = useState<GreetingSet | undefined>(greetings);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // The time of day is the visitor's own, so it's worked out in the browser
  useEffect(() => { setLine(pickGreeting(set, new Date(), firstName)); }, [set, firstName]);
  const ask = (e: React.FormEvent) => { e.preventDefault(); if (!q.trim()) return; window.dispatchEvent(new CustomEvent('lp-ask', { detail: q.trim() })); setQ(''); };
  const write = async () => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/p/${slug}/greetings`, { method: 'POST' }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (r?.ok) setSet(j.greetings); else setErr(j.error || 'Couldn’t write them. Try again.');
  };
  return <section className="h2-top" aria-label={`${client} home`}>
    <p className="h2-hello mute">{line?.[0] || ' '}</p>
    <h1 className="h2-head">{line?.[1] || ' '}</h1>
    {studio && !greetings ? <p className="h2-studio">{busy ? <><Loader2 size={13} className="spin" aria-hidden />Writing greetings in the {client} voice…</> : <button type="button" onClick={write}><Sparkles size={13} aria-hidden />Write greetings in the {client} voice</button>}{err ? <span role="alert"> {err}</span> : null}<span className="mute"> · Studio only</span></p> : null}
    <form className={'h2-ask' + (active ? ' on' : '')} onSubmit={ask}>
      <AskMark state={active ? 'scan' : 'rest'} />
      <label htmlFor="h2-q" className="sr">Ask or search</label>
      <input id="h2-q" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setActive(true)} onBlur={() => setActive(false)} placeholder="Ask about the brand, find a file, or describe what you need to make" autoComplete="off" />
      <button type="submit" aria-label="Ask" disabled={!q.trim()}><ArrowUp size={16} strokeWidth={1.75} aria-hidden /></button>
    </form>
    <nav className="h2-apps" aria-label="Apps">
      {apps.map((a) => a.ready
        ? <Link key={a.key} href={`/p/${slug}/${a.key}`} className="h2-app"><span className="h2-app-tile"><AppIcon app={a.key} size={34} play /></span><span>{a.name}</span></Link>
        : <span key={a.key} className="h2-app off" aria-disabled><span className="h2-app-tile"><AppIcon app={a.key} size={34} still /></span><span>{a.name}</span><span className="mute h2-next">Coming next</span></span>)}
    </nav>
  </section>;
}
