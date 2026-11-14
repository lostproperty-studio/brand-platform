'use client';
import { useEffect, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/featureStages';

type Data = {
  release: { version: string; env: string; branch: string | null; commit: string | null };
  ready: boolean;
  features: { key: string; name: string; about: string; default: Stage }[];
  projects: { id: string; slug: string; client: string; status: string; stages: Record<string, Stage> }[];
};

const ENV_LABEL: Record<string, string> = { production: 'Live', preview: 'Staging / preview', development: 'Development', local: 'Local' };

// Releases: what version is running here, and the gate for each feature on each client's portal
export function AdminReleases() {
  const [d, setD] = useState<Data | null>(null);
  const [saving, setSaving] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/admin/features').then((r) => r.json()).then(setD).catch(() => setErr('Couldn’t load releases.')); }, []);
  const set = async (projectId: string, feature: string, stage: Stage) => {
    if (!d) return;
    const p = d.projects.find((x) => x.id === projectId);
    if (stage === 'beta' || stage === 'live') {
      const name = d.features.find((f) => f.key === feature)?.name;
      if (!window.confirm(`Show ${name} to ${p?.client}’s team${stage === 'beta' ? ' as a beta' : ''}? They’ll see it the next time they open their portal.`)) return;
    }
    setSaving(projectId + feature); setErr('');
    const r = await fetch('/api/admin/features', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, feature, stage }) });
    const j = await r.json().catch(() => ({}));
    setSaving('');
    if (!r.ok) { setErr(j.error || 'Couldn’t save.'); return; }
    setD({ ...d, projects: d.projects.map((x) => (x.id === projectId ? { ...x, stages: { ...x.stages, [feature]: stage } } : x)) });
  };
  if (err && !d) return <p className="cd-err" role="alert">{err}</p>;
  if (!d) return <p className="mute">Checking…</p>;
  const r = d.release;
  return <div className="adm-rel">
    <div className="adm-live">
      <GitBranch size={18} strokeWidth={1.75} aria-hidden />
      <div>
        <p className="adm-big">v{r.version}</p>
        <p className="mute adm-note">{ENV_LABEL[r.env] || r.env}{r.branch ? ` · ${r.branch}` : ''}{r.commit ? ` · ${r.commit}` : ''}</p>
      </div>
    </div>
    <p className="mute adm-note">New tabs and tools arrive switched to <strong>Studio only</strong>: the studio sees them in its preview, marked Labs, and clients see nothing. Move one to <strong>Client beta</strong> to share it with one client, or <strong>Live</strong> when it’s ready for them.</p>
    {!d.ready ? <p className="cd-err" role="alert">The releases table isn’t in this database yet, so every feature is at its default. It’s added on the next live deploy.</p> : null}
    {d.features.map((f) => <div key={f.key} className="adm-feat">
      <p style={{ margin: '8px 0 2px' }}><strong>{f.name}</strong></p>
      <p className="mute adm-note" style={{ marginBottom: 8 }}>{f.about}</p>
      <ul className="adm-steps">
        {d.projects.map((p) => <li key={p.id} className="adm-step" style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 0 }}><p>{p.client}</p><p className="mute adm-note">/{p.slug}{p.status !== 'live' ? ` · ${p.status}` : ''}</p></div>
          {saving === p.id + f.key ? <Loader2 size={14} className="spin" aria-hidden /> : null}
          <select className="dp-select" style={{ flex: 'none', width: 140 }} value={p.stages[f.key]} disabled={!d.ready || !!saving} onChange={(e) => set(p.id, f.key, e.target.value as Stage)} aria-label={`${f.name} for ${p.client}`}>
            {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
        </li>)}
      </ul>
    </div>)}
    {err ? <p className="cd-err" role="alert">{err}</p> : null}
  </div>;
}
