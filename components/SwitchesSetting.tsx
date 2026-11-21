'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SWITCHES, type SwitchKey, type Switches } from '@/lib/portal/switches';

// On the project overview: which sections and apps this project has, for the client and the studio team alike,
// and (admins only) whether it runs on Lost Property's own Claude instead of the client's key.
export function SwitchesSetting({ projectId, switches: initial, studioAi: initialAi, admin }: { projectId: string; switches: Switches; studioAi: boolean; admin: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [ai, setAi] = useState(initialAi);
  const [msg, setMsg] = useState('');
  async function save(content: Record<string, unknown>) {
    setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? 'Saved.' : j.error || 'Couldn’t save.');
    router.refresh();
    return r.ok;
  }
  async function flip(k: SwitchKey) {
    const next = { ...on, [k]: !on[k] };
    setOn(next);
    if (!(await save({ switches: next }))) setOn(on);
  }
  async function flipAi() {
    const next = !ai; setAi(next);
    if (!(await save({ studioAi: next }))) setAi(!next);
  }
  return (
    <div className="card psw">
      <div><p style={{ margin: 0 }}>Sections and apps</p><p className="mute" style={{ margin: 0 }}>Switch off anything this project doesn’t need. It disappears from the portal for the client and for the studio team.</p></div>
      <ul className="psw-list">
        {SWITCHES.map((s) => <li key={s.key}>
          <label className="psw-row">
            <span><span className="psw-name">{s.name}</span><span className="mute psw-about">{s.about}</span></span>
            <input type="checkbox" role="switch" className="psw-tog" checked={on[s.key]} onChange={() => flip(s.key)} aria-label={s.name} />
          </label>
        </li>)}
        {admin ? <li>
          <label className="psw-row">
            <span><span className="psw-name">Runs on Lost Property’s Claude</span><span className="mute psw-about">Ask and the apps use the studio’s own Claude, so the client doesn’t need a key. For in-house projects.</span></span>
            <input type="checkbox" role="switch" className="psw-tog" checked={ai} onChange={flipAi} aria-label="Runs on Lost Property’s Claude" />
          </label>
        </li> : ai ? <li className="mute psw-about">Runs on Lost Property’s Claude (an admin can change this).</li> : null}
      </ul>
      <span className="mute" role="status">{msg}</span>
    </div>
  );
}
