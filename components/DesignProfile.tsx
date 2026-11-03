'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, ExternalLink, Loader2, Lock, LockOpen, PenLine, Sparkles, Undo2, type LucideIcon } from 'lucide-react';
import { SETTING_INFO, showSetting, type Profile, type SettingKey } from '@/lib/designProfileInfo';

const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;
const OPTIONS: Partial<Record<SettingKey, string[]>> = {
  ground: ['light', 'dark'], headlineCase: ['sentence', 'upper', 'lower', 'title'], displayScale: ['restrained', 'large', 'huge'],
  density: ['airy', 'balanced', 'dense'], buttons: ['solid', 'outline', 'underline']
};

// The design system's profile, read from the guidelines by AI: each setting with where it came from. Correct a
// setting (it's then locked, so reading again keeps it), lock one as it is, or switch one off to use the default.
export function DesignProfile({ projectId, slug, initial, chapters }: { projectId: string; slug: string; initial: Profile | null; chapters: number }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<SettingKey | null>(null);
  const [draft, setDraft] = useState('');

  async function read() {
    setBusy(true); setMsg('Reading the guidelines, text and pages…');
    const r = await fetch(`/api/projects/${projectId}/design-profile`, { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(j.error || 'The read didn’t finish. Try again.'); return; }
    setP(j.profile); setMsg(''); router.refresh();
  }
  async function patch(key: SettingKey, body: Record<string, unknown>) {
    const r = await fetch(`/api/projects/${projectId}/design-profile`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(j.error || 'Couldn’t save that.'); return; }
    setP(j.profile); setEdit(null);
  }
  function startEdit(k: SettingKey) { const v = p!.settings[k].value; setEdit(k); setDraft(Array.isArray(v) ? v.join('\n') : typeof v === 'object' ? JSON.stringify(v) : String(v)); }
  function saveEdit(k: SettingKey) {
    const cur = p!.settings[k].value;
    let value: unknown = draft;
    try {
      if (Array.isArray(cur)) value = draft.split('\n').map((x) => x.trim()).filter(Boolean);
      else if (typeof cur === 'object') value = JSON.parse(draft);
      else if (typeof cur === 'number') value = Number(draft);
      else if (typeof cur === 'boolean') value = draft === 'true' || draft === 'Yes';
    } catch { setMsg('That value isn’t in the right shape: keep the {"key": value} form.'); return; }
    patch(k, { value });
  }

  const keys = Object.keys(SETTING_INFO) as SettingKey[];
  const fromGuide = p ? keys.filter((k) => p.settings[k]?.source.from === 'guidelines').length : 0;
  return <div className="dpf">
    <div className="dpf-head">
      <div>
        <p className="dpf-t"><Sparkles {...I} /> Design profile</p>
        <p className="mute">{p ? `Read ${new Date(p.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} from ${p.chapters.length} chapter${p.chapters.length === 1 ? '' : 's'} and ${p.frames} page${p.frames === 1 ? '' : 's'}: ${fromGuide} of ${keys.length} settings come from the guidelines, the rest are judgement calls.` : chapters ? 'Not read yet. The AI reads the guidelines (text and pages) and records the brand’s design qualities, which the design system is then built from.' : 'Import guidelines chapters first; the profile is read from them.'}</p>
        <p className="mute">It’s read again after every guidelines import. Settings you edit or lock stay as they are.</p>
      </div>
      <div className="dpf-acts">
        <a className="btn ic" href={`/p/${slug}/resources/design-system`} target="_blank" rel="noopener"><ExternalLink {...I} />See the design system</a>
        <button className="btn solid ic" disabled={busy || !chapters} onClick={read}>{busy ? <Loader2 {...I} className="spin" /> : <BookOpen {...I} />}{p ? 'Read the guidelines again' : 'Read the guidelines'}</button>
      </div>
    </div>
    {msg ? <p className="dpf-msg" role="status">{msg}</p> : null}
    {p ? <ul className="dpf-list">{keys.map((k) => { const st = p.settings[k]; if (!st) return null; const Src: LucideIcon = st.locked ? Lock : st.source.from === 'guidelines' ? BookOpen : Sparkles; return (
      <li key={k} className={st.off ? 'off' : ''}>
        <div className="dpf-k"><b>{SETTING_INFO[k].label}</b><span className="mute">{SETTING_INFO[k].help}</span></div>
        <div className="dpf-v">
          {edit === k ? <span className="dpf-edit">
            {OPTIONS[k] ? <select className="in" value={draft} onChange={(e) => setDraft(e.target.value)}>{OPTIONS[k]!.map((o) => <option key={o}>{o}</option>)}</select>
              : Array.isArray(st.value) ? <textarea className="in" rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="One per line" />
              : <input className="in" value={draft} onChange={(e) => setDraft(e.target.value)} />}
            <button className="btn solid sm" onClick={() => saveEdit(k)}>Save</button><button className="btn sm" onClick={() => setEdit(null)}>Cancel</button>
          </span> : <span className="dpf-val">{st.off ? <span className="mute">Off · the default is used</span> : showSetting(st.value, k)}</span>}
          <span className="dpf-src"><Src {...I} />{st.source.from === 'guidelines' ? <><b>{st.source.chapter}</b> “{st.source.evidence}”</> : st.source.from === 'studio' ? 'Set by the studio' : <>Judgement: {st.source.why}</>}</span>
        </div>
        <div className="dpf-b">
          <button className="btn ic sm" onClick={() => startEdit(k)} aria-label={`Change ${SETTING_INFO[k].label}`} data-tip="Change"><PenLine {...I} /></button>
          <button className={'btn ic sm' + (st.locked ? ' solid' : '')} onClick={() => patch(k, { locked: !st.locked })} aria-pressed={!!st.locked} aria-label={st.locked ? 'Unlock' : 'Lock'} data-tip={st.locked ? 'Locked: reading again keeps it' : 'Lock'}>{st.locked ? <Lock {...I} /> : <LockOpen {...I} />}</button>
          <button className="btn ic sm" onClick={() => patch(k, { off: !st.off })} aria-label={st.off ? 'Switch on' : 'Switch off'} data-tip={st.off ? 'Use this setting' : 'Use the default'}>{st.off ? <Undo2 {...I} /> : <span aria-hidden style={{ fontSize: 12 }}>Off</span>}</button>
        </div>
      </li>); })}</ul> : null}
  </div>;
}
