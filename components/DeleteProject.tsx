'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Confirm dialog for deleting a project. The client name must be typed to enable the button.
export function DeleteProjectDialog({ id, client, repo, open, onClose }: { id: string; client: string; repo: string | null; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [alsoRepo, setAlsoRepo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) { setTyped(''); setAlsoRepo(false); setError(''); d.showModal(); }
    if (!open && d.open) d.close();
  }, [open]);

  const match = typed.trim().toLowerCase() === client.trim().toLowerCase();
  async function go() {
    setBusy(true); setError('');
    const r = await fetch(`/api/projects/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: typed, deleteRepo: alsoRepo }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error || 'Couldn’t delete the project.'); return; }
    onClose();
    const note = j.repo === 'kept' ? `&repo=${encodeURIComponent(j.repoName)}` : j.repo === 'failed' ? `&repo=${encodeURIComponent(j.repoName)}&repoFailed=1` : '';
    router.push(`/studio?deleted=${encodeURIComponent(client)}${note}`);
    router.refresh();
  }

  return (
    <dialog ref={ref} className="dlg" onClose={onClose} aria-labelledby={`del-${id}`}>
      <h2 id={`del-${id}`}>Delete {client}?</h2>
      <p className="mute">This removes the project, its client portal, the review, deliverables and every uploaded file, including fonts. It can’t be undone.</p>
      {repo ? <label className="chk"><input type="checkbox" checked={alsoRepo} onChange={(e) => setAlsoRepo(e.target.checked)} /><span>Also delete the GitHub repository <strong>{repo}</strong><br /><span className="mute">Leave unticked to keep the kit on GitHub.</span></span></label> : null}
      <label className="mute" htmlFor={`delc-${id}`}>Type <strong style={{ color: '#000' }}>{client}</strong> to confirm</label>
      <input id={`delc-${id}`} className="in" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" onKeyDown={(e) => { if (e.key === 'Enter' && match && !busy) go(); }} />
      {error ? <p style={{ marginTop: 8 }}>{error}</p> : null}
      <div className="row"><button className="btn" onClick={onClose}>Cancel</button><button className="btn danger" disabled={!match || busy} onClick={go}>{busy ? 'Deleting…' : 'Delete project'}</button></div>
    </dialog>
  );
}

/** "Delete project" button with its dialog, for the project page. */
export function DeleteProjectButton(props: { id: string; client: string; repo: string | null }) {
  const [open, setOpen] = useState(false);
  return <><button className="btn" onClick={() => setOpen(true)}>Delete project</button><DeleteProjectDialog {...props} open={open} onClose={() => setOpen(false)} /></>;
}
