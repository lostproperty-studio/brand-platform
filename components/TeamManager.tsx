'use client';
import { useEffect, useState } from 'react';

type Role = 'creator' | 'manager' | 'admin';
type Member = { user_id: string; email: string | null; role: Role; created_at: string; last_sign_in_at?: string | null };
type Link = { id: string; role: Role; label: string; expires_at: string | null; max_uses: number | null; uses: number; revoked: boolean; created_at: string };
const LABEL: Record<Role, string> = { creator: 'Creator', manager: 'Manager', admin: 'Admin' };
const HELP: Record<Role, string> = {
  creator: 'Uses the guidelines, downloads the kit and makes things with the tools.',
  manager: 'Also uploads team files and invites creators and managers.',
  admin: 'Everything, including AI and usage, all people and permissions, and requests to Lost Property.'
};
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// The client team: invite by email or with a shareable link, each with a role. Everyone has their own sign-in and saved work.
export function TeamManager({ slug, studio = false }: { slug: string; studio?: boolean }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [links, setLinks] = useState<Link[]>([]);
  const [me, setMe] = useState('');
  const [myRole, setMyRole] = useState<Role>('admin');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>(studio ? 'admin' : 'creator');
  const [linkRole, setLinkRole] = useState<Role>('creator');
  const [linkDays, setLinkDays] = useState(14);
  const [newLink, setNewLink] = useState('');
  const [msg, setMsg] = useState('');
  const grantable: Role[] = myRole === 'admin' ? ['creator', 'manager', 'admin'] : ['creator', 'manager'];

  useEffect(() => {
    fetch(`/api/p/${slug}/team`).then((r) => (r.ok ? r.json() : { members: [] })).then((j) => { setMembers(j.members); setMe(j.me); if (j.myRole) setMyRole(j.myRole); });
    fetch(`/api/p/${slug}/invites`).then((r) => (r.ok ? r.json() : { links: [] })).then((j) => setLinks(j.links || []));
  }, [slug]);

  async function invite(e: React.FormEvent) {
    e.preventDefault(); setMsg('Sending the invite…');
    const r = await fetch(`/api/p/${slug}/team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, role }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t invite them.'); return; }
    setMembers(j.members); setEmail('');
    setMsg(j.emailed ? `Invite sent to ${email}.` : `${email} already has an account, so they’ve been added. They’ll see this portal next time they sign in.`);
  }
  async function makeLink() {
    const r = await fetch(`/api/p/${slug}/invites`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: linkRole, days: linkDays }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t make a link.'); return; }
    setNewLink(j.url); setLinks(j.links);
    try { await navigator.clipboard.writeText(j.url); setMsg('Link copied. Anyone with it can join as a ' + LABEL[linkRole] + ' until it expires.'); } catch { setMsg('Copy the link below and share it with your team.'); }
  }
  const revoke = async (id: string) => { const r = await fetch(`/api/p/${slug}/invites?id=${id}`, { method: 'DELETE' }); if (r.ok) setLinks((await r.json()).links); };
  const patch = async (userId: string, r: Role) => { const res = await fetch(`/api/p/${slug}/team`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role: r }) }); const j = await res.json().catch(() => ({})); if (res.ok) setMembers(j.members); else setMsg(j.error || 'Couldn’t change that.'); };
  const remove = async (m: Member) => { if (!confirm(`Remove ${m.email}? Their saved work is kept in case they’re added again.`)) return; const res = await fetch(`/api/p/${slug}/team?userId=${m.user_id}`, { method: 'DELETE' }); const j = await res.json().catch(() => ({})); if (res.ok) setMembers(j.members); else setMsg(j.error || 'Couldn’t remove them.'); };
  const active = links.filter((l) => !l.revoked && (!l.expires_at || new Date(l.expires_at) > new Date()) && (!l.max_uses || l.uses < l.max_uses));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="tm-roles">{(['creator', 'manager', 'admin'] as Role[]).map((r) => <div key={r}><strong>{LABEL[r]}</strong><span className="mute">{HELP[r]}</span></div>)}</div>

      <div className="tm-block">
        <p className="tm-h">Invite by email</p>
        <form className="row" onSubmit={invite}>
          <label className="sr" htmlFor="tm-email">Email</label>
          <input id="tm-email" className="in" type="email" required placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <label className="sr" htmlFor="tm-role">Role</label>
          <select id="tm-role" className="in" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value as Role)}>{grantable.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}</select>
          <button className="btn solid" disabled={!email}>Invite</button>
        </form>
      </div>

      <div className="tm-block">
        <p className="tm-h">Or share an invite link</p>
        <div className="row">
          <label className="sr" htmlFor="tl-role">Role for people who join with the link</label>
          <select id="tl-role" className="in" style={{ width: 'auto' }} value={linkRole} onChange={(e) => setLinkRole(e.target.value as Role)}>{grantable.map((r) => <option key={r} value={r}>Join as {LABEL[r]}</option>)}</select>
          <label className="sr" htmlFor="tl-days">Expires</label>
          <select id="tl-days" className="in" style={{ width: 'auto' }} value={linkDays} onChange={(e) => setLinkDays(Number(e.target.value))}><option value={1}>Expires in 1 day</option><option value={7}>Expires in 7 days</option><option value={14}>Expires in 14 days</option><option value={30}>Expires in 30 days</option></select>
          <button className="btn solid" onClick={makeLink}>Create and copy link</button>
        </div>
        {newLink ? <input className="in" readOnly value={newLink} onFocus={(e) => e.target.select()} aria-label="Invite link" /> : null}
        {active.length ? <div className="tm-list">{active.map((l) => <div key={l.id} className="tm-row"><div style={{ flex: 1 }}><p style={{ margin: 0 }}>{LABEL[l.role]} link</p><p className="mute" style={{ margin: 0 }}>Made {short(l.created_at)} · {l.uses} joined{l.expires_at ? ` · expires ${short(l.expires_at)}` : ''}</p></div><button className="btn" onClick={() => revoke(l.id)}>Turn off</button></div>)}</div> : null}
      </div>

      {msg ? <p role="status" style={{ margin: 0 }}>{msg}</p> : null}

      <div className="tm-block">
        <p className="tm-h">People ({members?.length ?? 0})</p>
        <div className="tm-list">
          {members === null ? <p className="mute">Loading…</p> : !members.length ? <p className="mute">No one from the client yet.{studio ? ' Invite their main contact as an Admin and they can bring in the rest of the team.' : ''}</p> : members.map((m) => {
            const locked = (m.role === 'admin' && myRole !== 'admin') || m.user_id === me;
            return <div key={m.user_id} className="tm-row">
              <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: 0, overflowWrap: 'anywhere' }}>{m.email}{m.user_id === me ? <span className="mute"> · you</span> : null}</p><p className="mute" style={{ margin: 0 }}>{m.last_sign_in_at ? `Last signed in ${short(m.last_sign_in_at)}` : 'Invited, not signed in yet'}</p></div>
              {locked ? <span className="tag">{LABEL[m.role]}</span> : <select className="fm-sel" aria-label={`Role for ${m.email}`} value={m.role} onChange={(e) => patch(m.user_id, e.target.value as Role)}>{grantable.map((r) => <option key={r} value={r}>{LABEL[r]}</option>)}</select>}
              {!locked ? <button className="btn" onClick={() => remove(m)}>Remove</button> : null}
            </div>;
          })}
        </div>
      </div>
    </div>
  );
}
