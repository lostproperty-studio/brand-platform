'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Loader2, RotateCw } from 'lucide-react';

type Sync = { at?: string; commit?: string; pr?: string | null; version?: string; reason?: string; files?: number; error?: string; failedAt?: string };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// The kit on GitHub: which repository, when it last updated and from what, a manual sync, and whether clients get the
// link. The repository is private: a link only works for people who've been given access on GitHub, so it's shown to
// clients only when the studio has done that.
export function GithubPanel({ projectId, repo, sync, shared }: { projectId: string; repo: string | null; sync?: Sync; shared: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [on, setOn] = useState(shared);
  async function run() {
    setBusy(true); setMsg('Building the kit and sending it to GitHub…');
    const r = await fetch(`/api/projects/${projectId}/kit?direct=1`, { method: 'POST' }); const j = await r.json().catch(() => ({}));
    setBusy(false); setMsg(r.ok ? `Updated: ${j.files} files sent to ${j.repo}.` : j.error || 'GitHub didn’t take the update.'); router.refresh();
  }
  async function share(v: boolean) {
    setOn(v);
    await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: { repoShared: v } }) });
    router.refresh();
  }
  const failed = !!sync?.error && (!sync.at || (sync.failedAt || '') > sync.at);
  return <div className="gh">
    <div className="gh-top">
      <div>
        <p className="gh-h">GitHub repository</p>
        {repo ? <p className="mute"><a href={`https://github.com/${repo}`} target="_blank" rel="noopener">{repo} <ExternalLink size={11} strokeWidth={2} aria-hidden /></a> · private</p> : <p className="mute">Not made yet. Sync to create it.</p>}
      </div>
      <button type="button" className="btn" onClick={run} disabled={busy}>{busy ? <Loader2 {...I} className="spin" /> : <RotateCw {...I} />}{repo ? 'Sync now' : 'Create and sync'}</button>
    </div>
    <p className={'gh-line' + (failed ? ' bad' : '')}>{failed ? `The last update didn’t reach GitHub (${when(sync!.failedAt)}): ${sync!.error}` : sync?.at ? `Up to date with what was ${sync.reason === 'publish' ? 'published' : 'synced'} ${when(sync.at)}: kit v${sync.version}, ${sync.files} files${sync.pr ? ' (waiting in a pull request to be merged)' : ''}.` : repo ? 'Not synced from here yet. It updates every time you publish, or with Sync now.' : ''}</p>
    {msg ? <p className="gh-line" role="status">{msg}</p> : null}
    {repo ? <label className="fp-check gh-share"><input type="checkbox" checked={on} onChange={(e) => share(e.target.checked)} />Show the GitHub link to the client<span className="mute"> · only once you’ve given their developers access to the repository on GitHub, or the link shows them a 404</span></label> : null}
  </div>;
}
