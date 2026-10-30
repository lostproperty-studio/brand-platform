'use client';
import { useEffect, useState } from 'react';

type Member = { user_id: string; email: string | null; role: 'client_admin' | 'client_viewer'; created_at: string; last_sign_in_at?: string | null };
const ROLE = { client_admin: 'Admin', client_viewer: 'Member' } as const;

// The client team: each person signs in with their own email and keeps their own conversations and saved work.
export function TeamManager({ slug, studio = false }: { slug: string; studio?: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [me, setMe] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Member['role']>(studio ? 'client_admin' : 'client_viewer');
  const [msg, setMsg] = useState('');
  const load = async () => { const r = await fetch(`/api/p/${slug}/team`); if (r.ok) { const j = await r.json(); setMembers(j.members); setMe(j.me); } else setMembers([]); };
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setMsg('Sending the invite…');
    const r = await fetch(`/api/p/${slug}/team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t invite them.'); return; }
    setMembers(j.members); setEmail('');
    setMsg(j.emailed ? `Invite sent to ${email}. They’ll get an email with a sign-in link.` : `${email} already has an account, so they’ve been added. They’ll see this portal next time they sign in.`);
  }
  const patch = async (userId: string, r: Member['role']) => { const res = await fetch(`/api/p/${slug}/team`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role: r }) }); if (res.ok) setMembers((await res.json()).members); };
  const remove = async (m: Member) => { if (!confirm(`Remove ${m.email} from this portal? Their saved work is kept in case they’re added again.`)) return; const res = await fetch(`/api/p/${slug}/team?userId=${m.user_id}`, { method: 'DELETE' }); const j = await res.json().catch(() => ({})); if (res.ok) setMembers(j.members); else setMsg(j.error || 'Couldn’t remove them.'); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <form className="row" onSubmit={invite}>
        <label className="sr" htmlFor="tm-email">Email</label>
        <input id="tm-email" className="in" type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
        <label className="sr" htmlFor="tm-role">Role</label>
        <select id="tm-role" className="in" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value as Member['role'])}><option value="client_viewer">Member</option><option value="client_admin">Admin</option></select>
        <button className="btn solid" disabled={!email}>Invite</button>
      </form>
      <p className="mute" style={{ margin: 0 }}>Members can read the guidelines, download the kit, use the tools and ask questions. Admins can also invite people and connect AI.</p>
      {msg ? <p role="status" style={{ margin: 0 }}>{msg}</p> : null}
      <div className="tm-list">
        {members === null ? <p className="mute">Loading…</p> : !members.length ? <p className="mute">No one from the client yet.{studio ? ' Invite their main contact as an Admin and they can add the rest of the team.' : ''}</p> : members.map((m) => (
          <div key={m.user_id} className="tm-row">
            <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, overflowWrap: 'anywhere' }}>{m.email}{m.user_id === me ? <span className="mute"> · you</span> : null}</p><p className="mute" style={{ margin: 0 }}>{m.last_sign_in_at ? `Last signed in ${new Date(m.last_sign_in_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Invited, not signed in yet'}</p></div>
            <select className="fm-sel" aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => patch(m.user_id, e.target.value as Member['role'])}><option value="client_viewer">{ROLE.client_viewer}</option><option value="client_admin">{ROLE.client_admin}</option></select>
            <button className="btn" onClick={() => remove(m)}>Remove</button>
          </div>))}
      </div>
    </div>
  );
}
