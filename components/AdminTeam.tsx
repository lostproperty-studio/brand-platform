'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, Check, Crown, Mail, Plus, RotateCcw, UserMinus, User } from 'lucide-react';
import type { StudioMember } from '@/lib/admin';

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const ROLES = [
  { id: 'editor' as const, label: 'Member', help: 'Creates projects, edits content and manages client access.', icon: User },
  { id: 'admin' as const, label: 'Admin', help: 'Also manages the studio team and the domain.', icon: Crown }
];
const initials = (s: string) => (s.split('@')[0].split(/[._\-\s]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('') || '?').toUpperCase();
const when = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not yet');

// Everyone at Lost Property on the platform
export function AdminTeam({ initial, me }: { initial: StudioMember[]; me: string }) {
  const [list, setList] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'editor' as 'editor' | 'admin' });
  const [menu, setMenu] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showOld, setShowOld] = useState(false);
  useEffect(() => { if (!menu) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.tm2-menu-wrap')) setMenu(null); }; document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off); }, [menu]);
  async function call(method: 'POST' | 'PATCH', body: object) {
    setBusy(true); setMsg('');
    const r = await fetch('/api/admin/staff', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || 'That didn’t work.'); return null; }
    setList(j.staff); return j;
  }
  const active = list.filter((s) => s.active), removed = list.filter((s) => !s.active);
  return (
    <div className="tm2-team">
      <ul className="tm2-list adm-list">
        {active.map((s) => { const role = ROLES.find((r) => r.id === s.role)!; return (
          <li key={s.user_id} className="tm2-person">
            <span className="av" aria-hidden>{initials(s.name || s.email)}</span>
            <span className="tm2-who"><b>{s.name || s.email.split('@')[0]}{s.user_id === me ? ' (you)' : ''}</b><span className="mute">{s.email}</span></span>
            <span className="adm-meta mute">{s.projects ? `${s.projects} project team${s.projects === 1 ? '' : 's'}` : 'All open projects'}</span>
            <span className="adm-meta mute">Last in: {when(s.last_sign_in_at)}</span>
            <div className="tm2-menu-wrap">
              <button className="tm2-role" onClick={() => setMenu(menu === s.user_id ? null : s.user_id)} aria-haspopup="menu" aria-expanded={menu === s.user_id}><role.icon {...I} />{role.label}<ChevronDown size={13} strokeWidth={1.75} aria-hidden /></button>
              {menu === s.user_id ? <div className="tm2-menu" role="menu">
                {ROLES.map((r) => <button key={r.id} role="menuitemradio" aria-checked={s.role === r.id} onClick={() => { setMenu(null); call('PATCH', { user_id: s.user_id, role: r.id }); }}><r.icon {...I} /><span><b>{r.label}</b><span>{r.help}</span></span>{s.role === r.id ? <Check {...I} /> : null}</button>)}
                <span className="tm2-sep" />
                <button className="danger" onClick={() => { setMenu(null); call('PATCH', { user_id: s.user_id, active: false }); }}><UserMinus {...I} /><span><b>Remove from the platform</b><span>They lose access to the studio and every project.</span></span></button>
              </div> : null}
            </div>
          </li>); })}
      </ul>
      {adding ? <div className="adm-add">
        <input className="in" autoFocus type="email" placeholder="name@lostproperty.studio" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" />
        <input className="in" placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Name" />
        <select className="in" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'editor' | 'admin' })} aria-label="Role"><option value="editor">Member</option><option value="admin">Admin</option></select>
        <button className="btn solid ic" disabled={busy || !form.email} onClick={async () => { const j = await call('POST', form); if (j) { setMsg(j.invited ? `Invite sent to ${form.email}.` : `${form.email} can now sign in with their email.`); setForm({ email: '', name: '', role: 'editor' }); setAdding(false); } }}><Mail {...I} />Add and invite</button>
        <button className="btn" onClick={() => setAdding(false)}>Cancel</button>
      </div> : <button className="btn ic" onClick={() => setAdding(true)}><Plus {...I} />Add a team member</button>}
      <p className="mute adm-note">Anyone who signs in with a lostproperty.studio email joins as a member automatically. Add freelancers with any email here.</p>
      {removed.length ? <div><button className="ve-linkbtn" onClick={() => setShowOld(!showOld)} aria-expanded={showOld}>Removed ({removed.length})</button>
        {showOld ? <ul className="tm2-list">{removed.map((s) => <li key={s.user_id} className="tm2-person"><span className="av" aria-hidden>{initials(s.name || s.email)}</span><span className="tm2-who"><b>{s.name || s.email.split('@')[0]}</b><span className="mute">{s.email}</span></span><button className="btn ic" onClick={() => call('PATCH', { user_id: s.user_id, active: true })}><RotateCcw {...I} />Restore</button></li>)}</ul> : null}</div> : null}
      {msg ? <p className="adm-msg" role="status">{msg}</p> : null}
    </div>
  );
}
