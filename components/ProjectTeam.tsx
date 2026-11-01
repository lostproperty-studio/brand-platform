'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Crown, Eye, Lock, PenLine, Plus, UserMinus, Users, type LucideIcon } from 'lucide-react';

type Role = 'lead' | 'editor' | 'viewer';
type Row = { email: string; user_id: string | null; role: Role };
type Staff = { user_id: string; email: string; name: string | null; role: 'admin' | 'editor' };
const ROLES: { id: Role; label: string; help: string; icon: LucideIcon }[] = [
  { id: 'lead', label: 'Lead', help: 'Edits and publishes, manages the team, can delete the project.', icon: Crown },
  { id: 'editor', label: 'Editor', help: 'Edits and publishes.', icon: PenLine },
  { id: 'viewer', label: 'Viewer', help: 'Can look, but not change anything.', icon: Eye }
];
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
export const initials = (s: string) => (s.split('@')[0].split(/[._\-\s]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('') || '?').toUpperCase();

// Who from the studio is on this project and what they can do. Until someone is added, the whole studio can edit.
export function ProjectTeam({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [me, setMe] = useState<{ email: string; role: Role | null; admin: boolean } | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch(`/api/projects/${projectId}/team`).then(async (r) => { if (!r.ok) { setMsg(await r.text()); setRows([]); return; } const j = await r.json(); setRows(j.rows); setStaff(j.staff); setMe(j.me); }); }, [projectId]);
  useEffect(() => { if (!menu) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.tm2-menu-wrap')) setMenu(null); }; document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off); }, [menu]);
  const canManage = me?.role === 'lead' || (!rows?.length && me?.role === 'editor');
  const nameOf = (e: string) => staff.find((s) => s.email.toLowerCase() === e.toLowerCase())?.name || e.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  async function save(next: Row[]) {
    const prev = rows; setRows(next); setMsg('');
    const r = await fetch(`/api/projects/${projectId}/team`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members: next.map(({ email, role }) => ({ email, role })) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setRows(prev); setMsg(j.error || 'Couldn’t save the team.'); return; }
    setRows(j.rows);
  }
  function add(e: string) {
    if (!rows || !e) return;
    const em = e.trim().toLowerCase();
    if (rows.some((r) => r.email === em)) { setMsg('Already on the team.'); return; }
    // The first person added makes the team explicit; whoever sets it up stays on as a lead
    const base = rows.length || !me ? rows : (me.email && me.email.toLowerCase() !== em ? [{ email: me.email.toLowerCase(), user_id: null, role: 'lead' as Role }] : []);
    save([...base, { email: em, user_id: null, role: base.length ? 'editor' : 'lead' }]); setEmail(''); setAdding(false);
  }
  if (!rows) return <div className="tm2-team"><p className="mute">Loading the team…</p></div>;
  const open = !rows.length;
  const others = staff.filter((s) => !rows.some((r) => r.email === s.email.toLowerCase()));

  return (
    <div className="tm2-team">
      {open ? <div className="tm2-open"><Users {...I} /><div><p>Open to the whole studio</p><p className="mute">Everyone at Lost Property can edit this project. Add people to limit it to a team.</p></div></div> : null}
      <ul className="tm2-list" aria-label="Studio team">
        {rows.map((r) => { const role = ROLES.find((x) => x.id === r.role)!; return (
          <li key={r.email} className="tm2-person">
            <span className="av" aria-hidden>{initials(r.email)}</span>
            <span className="tm2-who"><b>{nameOf(r.email)}{me?.email?.toLowerCase() === r.email ? ' (you)' : ''}</b><span className="mute">{r.email}{!r.user_id && !staff.some((s) => s.email.toLowerCase() === r.email) ? ' · hasn’t signed in yet' : ''}</span></span>
            {canManage ? <div className="tm2-menu-wrap">
              <button className="tm2-role" onClick={() => setMenu(menu === r.email ? null : r.email)} aria-haspopup="menu" aria-expanded={menu === r.email}><role.icon {...I} />{role.label}<ChevronDown size={13} strokeWidth={1.75} aria-hidden /></button>
              {menu === r.email ? <div className="tm2-menu" role="menu">
                {ROLES.map((x) => <button key={x.id} role="menuitemradio" aria-checked={r.role === x.id} onClick={() => { setMenu(null); save(rows.map((y) => (y.email === r.email ? { ...y, role: x.id } : y))); }}><x.icon {...I} /><span><b>{x.label}</b><span>{x.help}</span></span>{r.role === x.id ? <Check {...I} /> : null}</button>)}
                <span className="tm2-sep" />
                <button className="danger" onClick={() => { setMenu(null); save(rows.filter((y) => y.email !== r.email)); }}><UserMinus {...I} /><span><b>Remove from project</b></span></button>
              </div> : null}
            </div> : <span className="tm2-role static"><role.icon {...I} />{role.label}</span>}
          </li>); })}
      </ul>
      {canManage ? (adding ? <div className="tm2-add">
        <input className="in" autoFocus list="pt-staff" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(email); if (e.key === 'Escape') setAdding(false); }} placeholder="name@lostproperty.studio" aria-label="Studio email" />
        <datalist id="pt-staff">{others.map((s) => <option key={s.user_id} value={s.email}>{s.name || ''}</option>)}</datalist>
        <button className="btn solid" onClick={() => add(email)}>Add</button><button className="btn" onClick={() => setAdding(false)}>Cancel</button>
      </div> : <button className="btn ic" onClick={() => setAdding(true)}><Plus {...I} />Add a team member</button>)
        : <p className="mute tm2-note"><Lock size={13} strokeWidth={1.75} aria-hidden /> Only the project’s leads can change the team.</p>}
      {msg ? <p className="tm2-msg" role="alert">{msg}</p> : null}
    </div>
  );
}
