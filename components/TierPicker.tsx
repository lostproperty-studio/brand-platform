'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIERS, type Tier } from '@/lib/playbook';

/** The three tiers as cards to choose from. */
export function TierCards({ value, onChange, name = 'tier' }: { value?: Tier; onChange: (t: Tier) => void; name?: string }) {
  return (
    <div className="tier-cards" role="radiogroup" aria-label="Guide tier">
      {TIERS.map((t) => (
        <label key={t.id} className={'tier-card' + (value === t.id ? ' on' : '')}>
          <input type="radio" name={name} value={t.id} checked={value === t.id} onChange={() => onChange(t.id)} />
          <span className="tier-name">{t.label}</span>
          <span className="mute">{t.blurb}</span>
        </label>
      ))}
    </div>
  );
}

// On the project overview: change the tier, then check the guidelines against it.
export function TierSetting({ projectId, tier: initial, hasGuide }: { projectId: string; tier?: Tier; hasGuide: boolean }) {
  const router = useRouter();
  const [tier, setTier] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  async function pick(t: Tier) {
    setTier(t); setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: t }) });
    setMsg(r.ok ? (hasGuide ? 'Saved. Check the guidelines to draft anything this tier needs.' : 'Saved. Gaps are drafted when the guidelines are built.') : 'Couldn’t save.');
    router.refresh();
  }
  async function check() {
    setBusy(true); setMsg('Checking the guidelines against the tier. This takes about a minute…');
    const r = await fetch(`/api/projects/${projectId}/guide/drafts`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? `${j.drafts} draft section${j.drafts === 1 ? '' : 's'} and ${j.missing} missing item${j.missing === 1 ? '' : 's'} added to the Guidelines tab.` : j.error || 'The check didn’t finish.');
    router.refresh();
  }
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div><p style={{ margin: 0 }}>Guide tier</p><p className="mute" style={{ margin: 0 }}>Sets how deep the guidelines go. The platform drafts what the tier needs and marks it for you to check; strategy is only ever called out as missing.</p></div>
      <TierCards value={tier} onChange={pick} />
      <div className="row">{hasGuide && tier ? <button className="btn" disabled={busy} onClick={check}>Check guidelines for this tier</button> : null}<span className="mute" role="status">{msg}</span></div>
    </div>
  );
}
