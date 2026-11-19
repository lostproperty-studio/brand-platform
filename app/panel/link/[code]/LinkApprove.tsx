'use client';
import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

export function LinkApprove({ id, words, host, brands, hint }: { id: string; words: string; host: string; brands: { id: string; client: string; slug: string }[]; hint: string | null }) {
  const [pick, setPick] = useState(brands.find((b) => b.slug === hint)?.id || brands[0].id);
  const [state, setState] = useState<'ask' | 'busy' | 'done'>('ask'), [err, setErr] = useState('');
  async function go() {
    setState('busy'); setErr('');
    const r = await fetch('/api/panel/link/approve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, project: pick }) });
    if (r.ok) setState('done'); else { setErr(await r.text()); setState('ask'); }
  }
  if (state === 'done') return <>
    <h1>You’re signed in</h1>
    <p className="mute">Go back to {host}: the panel opens with {brands.find((b) => b.id === pick)?.client}’s brand in a moment. You can close this page.</p>
    <span className="pk-ok"><Check size={18} strokeWidth={2} aria-hidden /></span>
  </>;
  return <>
    <h1>Sign in to the brand panel in {host}</h1>
    <p className="mute">Check the code below matches the one in your panel. If it doesn’t, close this page.</p>
    <p className="pk-code">{words}</p>
    {brands.length > 1 ? <fieldset className="pk-brands"><legend className="mute">Which brand?</legend>
      {brands.map((b) => <label key={b.id} className={'pk-brand' + (pick === b.id ? ' on' : '')}><input type="radio" name="brand" checked={pick === b.id} onChange={() => setPick(b.id)} />{b.client}</label>)}
    </fieldset> : <p className="pk-one">{brands[0].client}</p>}
    <button type="button" className="btn solid pk-go" onClick={go} disabled={state === 'busy'}>{state === 'busy' ? <Loader2 size={14} className="spin" aria-hidden /> : null}It matches: sign in</button>
    {err ? <p className="pk-err" role="alert">{err}</p> : null}
  </>;
}
