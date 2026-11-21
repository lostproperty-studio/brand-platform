'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SWITCHES, type AppState, type SwitchKey } from '@/lib/portal/switches';

// On the project overview: which sections and apps this project has, for the client and the studio team alike,
// and (admins only) whether it runs on Lost Property's own Claude instead of the client's key.
export function SwitchesSetting({ projectId, switches: initial, studioAi: initialAi, admin }: { projectId: string; switches: Record<SwitchKey, AppState>; studioAi: boolean; admin: boolean }) {
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
  const stored = (v: AppState) => (v === 'on' ? true : v === 'off' ? false : 'soon');
  async function set(k: SwitchKey, v: AppState) {
    const next = { ...on, [k]: v };
    setOn(next);
    if (!(await save({ switches: Object.fromEntries(Object.entries(next).map(([a, b]) => [a, stored(b)])) }))) setOn(on);
  }
  async function flipAi() {
    const next = !ai; setAi(next);
    if (!(await save({ studioAi: next }))) setAi(!next);
  }
  return (
    <div className="card psw">
      <div><p style={{ margin: 0 }}>Sections and apps</p><p className="mute" style={{ margin: 0 }}>Switch off anything this project doesn’t need: it disappears for the client and the studio team. Coming soon shows the app greyed, with a preview of what it will do.</p></div>
      <ul className="psw-list">
        {SWITCHES.map((s) => <li key={s.key}>
          {s.key === 'showcase' ? <label className="psw-row">
            <span><span className="psw-name">{s.name}</span><span className="mute psw-about">{s.about}</span></span>
            <input type="checkbox" role="switch" className="psw-tog" checked={on[s.key] !== 'off'} onChange={() => set(s.key, on[s.key] === 'off' ? 'on' : 'off')} aria-label={s.name} />
          </label> : <div className="psw-row">
            <span><span className="psw-name">{s.name}</span><span className="mute psw-about">{on[s.key] === 'soon' ? 'Shown greyed, with a preview of what it will do' : s.about}</span></span>
            <span className="psw-seg" role="radiogroup" aria-label={s.name}>{(['on', 'soon', 'off'] as const).map((v) =>
              <button key={v} type="button" role="radio" aria-checked={on[s.key] === v} className={on[s.key] === v ? 'on' : ''} onClick={() => set(s.key, v)}>{v === 'on' ? 'On' : v === 'soon' ? 'Coming soon' : 'Off'}</button>)}</span>
          </div>}
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
