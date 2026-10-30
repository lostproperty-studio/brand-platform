'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Studio actions on a project: rebuild the kit (opens a PR after the first build), publish, archive.
export function ProjectActions({ id, status, hasRepo }: { id: string; status: string; hasRepo: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const run = async (label: string, url: string, init?: RequestInit) => {
    setMsg(label);
    const r = await fetch(url, { method: 'POST', ...init });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.pullRequest ? 'Kit rebuilt. Review the pull request on GitHub.' : 'Done.') : 'Failed: ' + (j.error || r.status));
    router.refresh();
  };
  return (
    <div className="row">
      <button className="btn solid" onClick={() => run('Building the kit…', `/api/projects/${id}/kit`)}>{hasRepo ? 'Rebuild kit' : 'Build kit'}</button>
      <button className="btn" onClick={() => run('Publishing…', `/api/projects/${id}/publish`)}>Publish</button>
      <button className="btn" onClick={() => run('Saving…', `/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: status === 'archived' ? 'draft' : 'archived' }) })}>{status === 'archived' ? 'Restore project' : 'Archive project'}</button>
      <span className="mute">{msg}</span>
    </div>
  );
}
