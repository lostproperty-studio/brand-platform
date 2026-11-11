'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';

// Which logos the client portal's sidebar shows: the full logo when it's open, a small one when it's closed.
// Left automatic, the full logo is the main logo and the small one is the social avatar.
type Logo = { path: string; url: string | null; name: string };

export function SidebarLogoPicker({ projectId, logos, full, mini, avatarUrl, autoFullUrl }: { projectId: string; logos: Logo[]; full?: string; mini?: string; avatarUrl: string | null; autoFullUrl: string | null }) {
  const router = useRouter();
  const [pick, setPick] = useState<{ full?: string; mini?: string }>({ full, mini });
  const [msg, setMsg] = useState('');
  async function save(next: { full?: string; mini?: string }) {
    setPick(next); setMsg('Saving…');
    const r = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { sidebar: next } }) });
    setMsg(r.ok ? 'Saved. The portal shows it straight away.' : 'Couldn’t save that.'); if (r.ok) router.refresh();
  }
  const tile = (on: boolean, click: () => void, img: string | null, label: string, small = false) => <button type="button" className={'slp-tile' + (on ? ' on' : '') + (small ? ' sm' : '')} onClick={click} aria-pressed={on}>
    <span className="slp-art">{img ? <img src={img} alt="" /> : <span className="mute">None</span>}</span><span className="slp-l">{on ? <Check size={13} strokeWidth={2} aria-hidden /> : null}{label}</span></button>;
  const nice = (n: string) => n.replace(/\.(svg|png)$/i, '').replace(/[_-]+/g, ' ');
  return <div className="slp">
    <div className="slp-row"><p className="slp-h">Full logo <span className="mute">· when the sidebar is open</span></p>
      <div className="slp-tiles">{tile(!pick.full, () => save({ ...pick, full: undefined }), autoFullUrl, 'Automatic')}{logos.map((l) => tile(pick.full === l.path, () => save({ ...pick, full: l.path }), l.url, nice(l.name)))}</div></div>
    <div className="slp-row"><p className="slp-h">Small logo <span className="mute">· when the sidebar is closed</span></p>
      <div className="slp-tiles">{tile(!pick.mini, () => save({ ...pick, mini: undefined }), avatarUrl, 'Social avatar', true)}{logos.map((l) => tile(pick.mini === l.path, () => save({ ...pick, mini: l.path }), l.url, nice(l.name), true))}</div></div>
    {msg ? <p className="mute" role="status" style={{ margin: 0 }}>{msg}</p> : null}
  </div>;
}
