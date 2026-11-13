'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Check, CheckCircle2, Copy, Eye, Loader2, Mail, Rocket, Send, X } from 'lucide-react';

export type Delivery = {
  projectId: string; slug: string; client: string; portalUrl: string; status: 'draft' | 'live' | 'archived';
  published: { at: string; version: string } | null; changedSince: boolean;
  checks: { ok: boolean; title: string; note?: string; href?: string; cta?: string }[];
  gets: { ok: boolean; text: string }[];
  people: number;
};
type Member = { email: string | null; role: string; last_sign_in_at?: string | null };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const ROLES = [['admin', 'Admin', 'Everything, including AI, people and requests'], ['manager', 'Manager', 'Uses everything and invites their team'], ['creator', 'Creator', 'Uses the guidelines, downloads and tools']] as const;

/** The one button that matters at handover: what it says depends on where the project is */
export function DeliverButton({ d }: { d: Delivery }) {
  const [open, setOpen] = useState(false);
  const live = d.status === 'live' && !!d.published;
  const label = !live ? `Deliver to ${d.client}` : d.changedSince ? 'Publish changes' : 'Invite people';
  return <>
    <button type="button" className={'btn dl-go' + (live && !d.changedSince ? '' : ' hot')} onClick={() => setOpen(true)}>{!live ? <Rocket {...I} /> : d.changedSince ? <Send {...I} /> : <Mail {...I} />}{label}</button>
    {open ? <DeliverPanel d={d} onClose={() => setOpen(false)} /> : null}
  </>;
}

// Delivering a portal, step by step: check it's ready, see what the client gets, publish, invite them by email, then
// look at it exactly as they will. Each step says plainly whether it's done, so the studio knows the client can see
// everything and use the platform before the email goes.
export function DeliverPanel({ d, onClose }: { d: Delivery; onClose: () => void }) {
  const router = useRouter();
  const [published, setPublished] = useState(d.published);
  const [changed, setChanged] = useState(d.changedSince);
  const [pub, setPub] = useState<{ busy: boolean; msg: string; bad?: boolean; fonts?: { name: string; label: string }[] }>({ busy: false, msg: '' });
  const [members, setMembers] = useState<Member[] | null>(null);
  const [email, setEmail] = useState(''), [role, setRole] = useState<'admin' | 'manager' | 'creator'>('admin');
  const [inv, setInv] = useState<{ busy: boolean; msg: string; bad?: boolean }>({ busy: false, msg: '' });
  const [copied, setCopied] = useState(false);
  useEffect(() => { fetch(`/api/p/${d.slug}/team`).then((r) => (r.ok ? r.json() : { members: [] })).then((j) => setMembers(j.members || [])); }, [d.slug]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const todo = d.checks.filter((c) => !c.ok);
  const live = (d.status === 'live' || !!pub.msg && !pub.bad) && !!published;
  const upToDate = live && !changed;

  async function publish(allowTrialFonts = false) {
    setPub({ busy: true, msg: 'Publishing, and updating the kit on GitHub…' });
    const r = await fetch(`/api/projects/${d.projectId}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowTrialFonts }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.code === 'trial_fonts') { setPub({ busy: false, msg: '', fonts: j.fonts }); return; }
    if (!r.ok) { setPub({ busy: false, msg: j.error || 'Publishing didn’t work. Try again.', bad: true }); return; }
    setPublished({ at: new Date().toISOString(), version: published?.version || '1.0.0' }); setChanged(false);
    setPub({ busy: false, msg: `Published. ${j.kit ? (j.kit.ok ? 'The kit on GitHub is updated too.' : 'The kit on GitHub didn’t update; use Sync now in Resources.') : ''}${j.trialFonts ? ' Fonts are still on trial files.' : ''}`, bad: !!j.kit && !j.kit.ok });
    router.refresh();
  }
  async function invite(e: React.FormEvent) {
    e.preventDefault(); if (!email.trim()) return;
    setInv({ busy: true, msg: 'Sending the invite…' });
    const r = await fetch(`/api/p/${d.slug}/team`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), role }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setInv({ busy: false, msg: j.error || 'The invite didn’t go.', bad: true }); return; }
    setMembers(j.members || members); setInv({ busy: false, msg: j.emailed ? `Invite emailed to ${email.trim()}. It has a link to join and sign in.` : `${email.trim()} already has an account, so they’re added and will see the portal next time they sign in.` }); setEmail('');
  }
  const copy = async () => { try { await navigator.clipboard.writeText(d.portalUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* not allowed */ } };
  const people = members || [];

  const Step = ({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) => <section className={'dl-step' + (done ? ' done' : '')}>
    <div className="dl-step-h"><span className="dl-n">{done ? <Check size={13} strokeWidth={2.5} aria-hidden /> : n}</span><h3>{title}</h3></div>
    <div className="dl-step-b">{children}</div>
  </section>;

  return <div className="rm2-back rm2-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="dl" role="dialog" aria-modal="true" aria-labelledby="dl-t">
      <div className="dl-h"><div><h2 id="dl-t">Deliver to {d.client}</h2><p className="mute">{upToDate ? `Live · version ${published!.version}, published ${new Date(published!.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : live ? 'Live, with changes the client can’t see yet' : 'Not published yet: the client can’t see anything'}</p></div><button type="button" className="rm2-ic" onClick={onClose} aria-label="Close"><X size={14} strokeWidth={1.75} aria-hidden /></button></div>

      <div className="dl-body">
        <Step n={1} title={todo.length ? `Check it’s ready · ${todo.length} to look at` : 'Ready to go'} done={!todo.length}>
          <ul className="dl-list">{d.checks.map((c) => <li key={c.title} className={c.ok ? 'ok' : 'todo'}>{c.ok ? <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden /> : <AlertCircle size={15} strokeWidth={1.75} aria-hidden />}<span>{c.title}{c.note ? <span className="mute"> · {c.note}</span> : null}</span>{!c.ok && c.href ? <Link href={c.href} className="dl-fix" onClick={onClose}>{c.cta || 'Fix'}</Link> : null}</li>)}</ul>
          <p className="dl-sub">What {d.client} gets</p>
          <ul className="dl-list">{d.gets.map((g) => <li key={g.text} className={g.ok ? 'ok' : 'todo'}>{g.ok ? <CheckCircle2 size={15} strokeWidth={1.75} aria-hidden /> : <AlertCircle size={15} strokeWidth={1.75} aria-hidden />}<span>{g.text}</span></li>)}</ul>
          {todo.length ? <p className="mute dl-note">None of these stop you publishing; they’re what the client would notice.</p> : null}
        </Step>

        <Step n={2} title={upToDate ? 'Published' : live ? 'Publish the changes' : 'Publish'} done={upToDate}>
          {pub.fonts ? <div className="dl-warn"><p><b>Some fonts are still trial files:</b> {pub.fonts.map((f) => f.name || f.label).join(', ')}. The client would see trial fonts until licensed files are uploaded.</p><div className="row"><Link className="btn" href="?tab=typefaces" onClick={onClose}>Go to Typefaces</Link><button className="btn" onClick={() => publish(true)}>Publish anyway</button></div></div>
            : <>
              <p className="mute">{upToDate ? 'Everything the client sees is the latest version.' : 'Publishing makes this version of the guidelines, downloads and tools what the client sees, and updates the kit on GitHub.'}</p>
              {!upToDate ? <button type="button" className="btn solid dl-big" onClick={() => publish()} disabled={pub.busy}>{pub.busy ? <Loader2 {...I} className="spin" /> : <Rocket {...I} />}{live ? 'Publish the changes' : `Publish to ${d.client}`}</button> : null}
              {pub.msg ? <p className={'dl-msg' + (pub.bad ? ' bad' : '')} role="status">{pub.msg}</p> : null}
            </>}
        </Step>

        <Step n={3} title={people.length ? `Invite the team · ${people.length} ${people.length === 1 ? 'person has' : 'people have'} access` : 'Invite the client'} done={people.length > 0}>
          {!live ? <p className="mute">Publish first, so they find the portal ready when they join.</p> : null}
          <form className="dl-inv" onSubmit={invite}>
            <input className="in" type="email" required placeholder="name@client.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Their email" />
            <select className="in" value={role} onChange={(e) => setRole(e.target.value as typeof role)} aria-label="Their role">{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button className="btn solid" disabled={inv.busy || !email.trim()}>{inv.busy ? <Loader2 {...I} className="spin" /> : <Mail {...I} />}Send invite</button>
          </form>
          <p className="mute dl-note">{ROLES.find((r) => r[0] === role)![2]}. They get an email with a link to join; they sign in with that email and land in the portal.</p>
          {inv.msg ? <p className={'dl-msg' + (inv.bad ? ' bad' : '')} role="status">{inv.msg}</p> : null}
          {people.length ? <ul className="dl-people">{people.map((m) => <li key={m.email || ''}><span className="pc-av">{(m.email || '?')[0].toUpperCase()}</span><span>{m.email}<span className="mute"> · {m.role}</span></span><span className={'dl-tag' + (m.last_sign_in_at ? ' ok' : '')}>{m.last_sign_in_at ? 'Signed in' : 'Invited, not signed in yet'}</span></li>)}</ul> : null}
          <div className="row"><span className="mute">The portal’s address</span><code className="dl-url">{d.portalUrl.replace(/^https?:\/\//, '')}</code><button type="button" className="btn" onClick={copy}><Copy {...I} />{copied ? 'Copied' : 'Copy'}</button></div>
        </Step>

        <Step n={4} title="See it as they will" done={false}>
          <p className="mute">Opens the portal exactly as {d.client}’s team sees it: the published version, with their downloads, apps and AI, and none of the studio’s previews or drafts.</p>
          <a className="btn" href={`/api/p/${d.slug}/view-as?mode=client`} target="_blank" rel="noopener"><Eye {...I} />View as the client</a>
        </Step>
      </div>
    </div>
  </div>;
}
