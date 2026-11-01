'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ExternalLink, Send } from 'lucide-react';

const KINDS: [string, string][] = [['signin', 'Sign-in link'], ['invite', 'Invite'], ['request', 'Request update']];

// The platform's own emails: preview them in the studio's look or any client's, see what sends them, send a test
export function AdminEmail({ projects }: { projects: { slug: string; client: string }[] }) {
  const [info, setInfo] = useState<{ provider: 'resend' | 'smtp' | null; from: string; lastError?: { where: string; message: string; at: string } | null } | null>(null);
  const [kind, setKind] = useState('signin');
  const [slug, setSlug] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { fetch('/api/admin/email').then((r) => r.json()).then(setInfo).catch(() => null); }, []);
  const src = `/api/admin/email?preview=${kind}${slug ? `&slug=${encodeURIComponent(slug)}` : ''}`;
  async function test() {
    setMsg('Sending…');
    const r = await fetch('/api/admin/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, slug: slug || null }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Sent to ${j.to}.` : j.error || 'Didn’t send.');
  }
  const on = !!info?.provider;
  return (
    <div className="adm-domain">
      <div className="adm-live">
        <span className="ov-ic">{on ? <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden /> : <Circle size={16} strokeWidth={1.75} aria-hidden />}</span>
        <div><p className="adm-big">{on ? `Sending branded emails with ${info!.provider === 'resend' ? 'Resend' : 'your SMTP account'}` : 'Using Supabase’s plain emails for now'}</p><p className="mute">{on ? `From ${info!.from}. Sign-in links, invites and request updates use the designs below.` : 'Connect a free email service below and every email switches to these designs.'}</p></div>
        {on ? <button className="btn ic" onClick={test}><Send size={15} strokeWidth={1.75} aria-hidden />Send me a test</button> : null}
      </div>
      {msg ? <p className="adm-msg" role="status">{msg}</p> : null}
      {info?.lastError ? <p className="fd-err" role="alert">The last {info.lastError.where} email didn’t send ({new Date(info.lastError.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}): {info.lastError.message}. People still got Supabase’s plain email instead.</p> : null}
      <div className="em-ctl">
        <div className="dp-seg" role="radiogroup" aria-label="Email">{KINDS.map(([k, l]) => <button key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <select className="in em-sel" value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Look"><option value="">Lost Property (studio emails)</option>{projects.map((p) => <option key={p.slug} value={p.slug}>{p.client} (client emails)</option>)}</select>
      </div>
      <iframe className="em-frame" src={src} title="Email preview" />
      <ol className="adm-steps">
        <li className={'adm-step' + (on ? ' ok' : '')}>{on ? <CheckCircle2 size={18} strokeWidth={1.75} aria-label="Done" /> : <Circle size={18} strokeWidth={1.75} aria-label="To do" />}<div><p>Connect an email service (free)</p><div className="mute">
          <p style={{ margin: '0 0 6px' }}><b>Resend</b>, the easiest: free for 3,000 emails a month. Sign up at <a href="https://resend.com" target="_blank" rel="noopener">resend.com <ExternalLink size={12} aria-hidden /></a>, add the domain <code>lostproperty.studio</code> and add the DNS records it shows you, then create an API key and add it in Vercel as <code>RESEND_API_KEY</code>.</p>
          <p style={{ margin: 0 }}><b>Or your own mailbox</b>, no new service: in Vercel set <code>SMTP_HOST</code> (<code>smtp.gmail.com</code> for Google Workspace), <code>SMTP_USER</code> (the address to send from) and <code>SMTP_PASS</code> (an app password from that Google account).</p>
        </div></div></li>
        <li className="adm-step"><Circle size={18} strokeWidth={1.75} aria-hidden /><div><p>Choose the sender (optional)</p><div className="mute">Emails come from <code>{info?.from || 'Lost Property Brand Platform <platform@lostproperty.studio>'}</code>. To change it, set <code>EMAIL_FROM</code> in Vercel, then redeploy.</div></div></li>
      </ol>
    </div>
  );
}
