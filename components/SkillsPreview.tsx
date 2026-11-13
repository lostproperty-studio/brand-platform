'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronDown, Download, Eye, EyeOff, Loader2, TriangleAlert, X } from 'lucide-react';

type Skill = { id: string; title: string; blurb: string; shown: boolean; md: string; reference: string; files: string[]; checks: { ok: boolean; text: string }[] };
const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

// The Claude skills, as the studio checks them: what each one tells Claude, the files that go with it, whether it has
// what it needs to be any good, and whether clients see it. A skill is a set of instructions Claude follows for one
// kind of work (slides, documents, social posts, writing), with the brand's rules and files attached.
export function SkillsPreview({ projectId, slug, onClose }: { projectId: string; slug: string; onClose: () => void }) {
  const [data, setData] = useState<{ skills: Skill[]; hidden: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/projects/${projectId}/skills`).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) setErr(j.error || 'Couldn’t read the skills.'); else { setData(j); setOpen(j.skills[0]?.id || null); } }); }, [projectId]);
  const save = async (body: Record<string, unknown>) => { const r = await fetch(`/api/projects/${projectId}/skills`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) setErr((await r.json().catch(() => ({}))).error || 'Couldn’t save.'); };
  const setShown = (id: string, shown: boolean) => { setData((d) => d && { ...d, skills: d.skills.map((s) => (s.id === id ? { ...s, shown } : s)) }); save({ skill: id, shown }); };
  const setHidden = (hidden: boolean) => { setData((d) => d && { ...d, hidden }); save({ hidden }); };

  return <div className="rm2-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="rm2-pane sk" role="dialog" aria-modal="true" aria-label="Claude skills">
      <div className="rm2-pane-h"><strong>Claude skills</strong><button type="button" className="rm2-ic" onClick={onClose} aria-label="Close"><X {...I} /></button></div>
      <div className="rm2-pane-b">
        <p className="sk-what">A skill is a set of instructions Claude follows for one kind of work, with the brand’s rules and files attached. The client uploads one in Claude (Settings → Capabilities → Skills), and from then on Claude uses it whenever they ask for that kind of thing. These are written from the published guidelines, so they change when you publish.</p>
        {err ? <p className="rm2-msg" role="alert">{err}</p> : null}
        {!data && !err ? <p className="mute"><Loader2 {...I} className="spin" /> Writing the skills from the guidelines…</p> : null}
        {data ? <>
          <div className="rm2-row"><span className={'rm2-dot ' + (data.hidden ? 'off' : 'live')} aria-hidden /><span>{data.hidden ? 'Skills are hidden from the client' : 'Skills are shown to the client'}</span><span style={{ flex: 1 }} /><button className="btn" onClick={() => setHidden(!data.hidden)}>{data.hidden ? <><Eye {...I} />Show to the client</> : <><EyeOff {...I} />Hide them all</>}</button></div>
          {data.skills.map((s) => { const good = s.checks.filter((c) => c.ok).length; const all = s.checks.length; const on = open === s.id; return <article key={s.id} className={'sk-card' + (on ? ' on' : '') + (!s.shown || data.hidden ? ' dim' : '')}>
            <button type="button" className="sk-head" onClick={() => setOpen(on ? null : s.id)} aria-expanded={on}>
              <span><b>{s.title}</b><span className="mute">{s.blurb}</span></span>
              <span className={'sk-score' + (good === all ? ' ok' : '')}>{good === all ? <Check size={12} strokeWidth={2.5} aria-hidden /> : <TriangleAlert size={12} strokeWidth={2} aria-hidden />}{good === all ? 'Ready' : `${all - good} gap${all - good === 1 ? '' : 's'}`}</span>
              <ChevronDown {...I} className="sk-chev" />
            </button>
            {on ? <div className="sk-body">
              <ul className="sk-checks">{s.checks.map((c, i) => <li key={i} className={c.ok ? 'ok' : 'gap'}>{c.ok ? <Check size={13} strokeWidth={2.25} aria-hidden /> : <TriangleAlert size={13} strokeWidth={2} aria-hidden />}{c.text}</li>)}</ul>
              <details className="sk-md" open><summary>What it tells Claude</summary><pre>{s.md}</pre></details>
              <details className="sk-md"><summary>The brand reference it carries</summary><pre>{s.reference}{s.reference.length >= 6000 ? '\n…' : ''}</pre></details>
              <details className="sk-md"><summary>{s.files.length} files in the download</summary><ul className="rm2-list">{s.files.map((f) => <li key={f}><span>{f}</span></li>)}</ul></details>
              <div className="rm2-row">
                <label className="fp-check"><input type="checkbox" checked={s.shown} onChange={(e) => setShown(s.id, e.target.checked)} />Show this skill to the client</label>
                <span style={{ flex: 1 }} />
                <a className="btn" href={`/api/p/${slug}/skills/${s.id}`} download><Download {...I} />Download it</a>
              </div>
            </div> : null}
          </article>; })}
        </> : null}
      </div>
    </aside>
  </div>;
}
