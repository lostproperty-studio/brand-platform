'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Managers and admins add files the whole team can download (a file with the same name replaces the old one).
export function TeamFileUpload({ slug }: { slug: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  async function up(files: FileList | null) {
    if (!files?.length) return;
    for (const [k, f] of [...files].entries()) {
      setMsg(`Uploading ${k + 1} of ${files.length}…`);
      const fd = new FormData(); fd.set('file', f);
      const r = await fetch(`/api/p/${slug}/files`, { method: 'POST', body: fd });
      if (!r.ok) { setMsg((await r.json().catch(() => ({}))).error || 'Upload failed.'); return; }
    }
    setMsg('Uploaded.'); router.refresh();
  }
  return <div className="row"><label className="btn solid">Upload files<input type="file" multiple hidden onChange={(e) => { up(e.target.files); e.target.value = ''; }} /></label><span className="mute" role="status">{msg || 'Up to 4 MB each. Same name replaces the old file.'}</span></div>;
}

export function TeamFileRemove({ slug, path }: { slug: string; path: string }) {
  const router = useRouter();
  return <button className="fm-x" aria-label={`Remove ${path.split('/').pop()}`} onClick={async () => { if (!confirm(`Remove ${path.split('/').pop()} for everyone?`)) return; await fetch(`/api/p/${slug}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }); router.refresh(); }}>×</button>;
}
