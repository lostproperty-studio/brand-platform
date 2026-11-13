'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Pending = { label: string; name: string; state: string };

// Studio actions on a project: rebuild the kit (opens a PR after the first build), publish, archive.
// Publishing stops to remind you when typefaces are still on trial files.
export function ProjectActions({ id, status, hasRepo }: { id: string; status: string; hasRepo: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<Pending[] | null>(null);
  const run = async (label: string, url: string, init?: RequestInit) => {
    setMsg(label);
    const r = await fetch(url, { method: 'POST', ...init });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.pullRequest ? 'Kit rebuilt. Review the pull request on GitHub.' : 'Done.') : 'Failed: ' + (j.error || r.status));
    router.refresh();
    return { ok: r.ok, j };
  };
  async function publish(allowTrialFonts = false) {
    setMsg('Publishing, and updating the kit on GitHub…');
    const r = await fetch(`/api/projects/${id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowTrialFonts }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j.code === 'trial_fonts') { setPending(j.fonts); setMsg(''); return; }
    setPending(null);
    setMsg(r.ok ? `${j.trialFonts ? 'Published with trial fonts. Swap in licensed files before final delivery.' : 'Published.'}${j.kit ? (j.kit.ok ? ' The kit on GitHub is updated too.' : ` The kit on GitHub didn’t update (${j.kit.error}); try Sync now in Resources.`) : ''}` : 'Failed: ' + (j.error || r.status));
    router.refresh();
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row">
        <button className="btn solid" onClick={() => run('Building the kit…', `/api/projects/${id}/kit`)}>{hasRepo ? 'Rebuild kit' : 'Build kit'}</button>
        <button className="btn" onClick={() => run('Saving…', `/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status === 'archived' ? 'draft' : 'archived' }) })}>{status === 'archived' ? 'Restore project' : 'Archive project'}</button>
        <span className="mute" role="status">{msg}</span>
      </div>
      {pending ? <div className="card" role="alert" style={{ borderColor: 'var(--pink)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ margin: 0 }}>Add the final font files before publishing</p>
        <p className="mute" style={{ margin: 0 }}>{pending.map((f) => `${f.name || f.label} (${f.state === 'none' ? 'no files' : f.state === 'mixed' ? 'some files still trial' : 'trial files'})`).join(' · ')}. The client will see trial fonts in their portal until licensed files are uploaded.</p>
        <div className="row">
          <Link className="btn solid" href={`/studio/projects/${id}?tab=typefaces`}>Go to Typefaces</Link>
          <button className="btn" onClick={() => publish(true)}>Publish anyway</button>
          <button className="btn" onClick={() => setPending(null)}>Cancel</button>
        </div>
      </div> : null}
    </div>
  );
}
