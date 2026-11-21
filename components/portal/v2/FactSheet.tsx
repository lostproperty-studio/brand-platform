'use client';
import { useEffect, useRef, useState } from 'react';
import { CircleHelp, ClipboardList, Loader2, Plus, Trash2, X } from 'lucide-react';
import { FACT_INTRO, isCheck, openChecks, type FactSheet as Sheet } from '@/lib/factSheet';

// The fact sheet, opened from the Writer. Managers and admins edit it (it saves as they type); everyone else reads it.
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** The header button: opens the sheet, with a count of questions still waiting on the client */
export function FactButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<number | null>(null);
  useEffect(() => { fetch(`/api/p/${slug}/facts`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setQ(openChecks(j.facts))).catch(() => {}); }, [slug, open]);
  return <>
    <button className="btn fs-btn" onClick={() => setOpen(true)} title={q ? `${q} question${q === 1 ? '' : 's'} waiting for an answer` : 'The facts the Writer works from'}><ClipboardList {...I} />Fact sheet{q ? <i>{q}</i> : null}</button>
    {open ? <FactSheet slug={slug} onClose={() => setOpen(false)} /> : null}
  </>;
}

export function FactSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [f, setF] = useState<Sheet | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [tab, setTab] = useState('start');
  const [only, setOnly] = useState(false);
  const [saved, setSaved] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [err, setErr] = useState('');
  const base = useRef<string | undefined>(undefined);
  const dirty = useRef(false);
  useEffect(() => {
    fetch(`/api/p/${slug}/facts`).then((r) => r.json()).then((j) => { setF(j.facts); setCanEdit(j.canEdit); base.current = j.facts.updatedAt; }).catch(() => setErr('Couldn’t open the fact sheet.'));
  }, [slug]);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  // Save a moment after the last change
  useEffect(() => {
    if (!f || !dirty.current) return;
    setSaved('saving');
    const t = setTimeout(async () => {
      const r = await fetch(`/api/p/${slug}/facts`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: { owner: f.owner, tabs: f.tabs }, base: base.current }) }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (r?.status === 409) { dirty.current = false; setF(j.facts); base.current = j.facts.updatedAt; setSaved(''); setErr(`${j.facts.updatedBy || 'Someone'} changed the sheet while you had it open, so it now shows their version. Make your change again.`); return; }
      if (!r?.ok) { setSaved('error'); return; }
      base.current = j.facts.updatedAt; setSaved('saved'); setErr('');
    }, 800);
    return () => clearTimeout(t);
  }, [f, slug]);
  const edit = (fn: (s: Sheet) => Sheet) => { dirty.current = true; setF((s) => (s ? fn(s) : s)); };
  const setCell = (ti: string, ri: number, ci: number, v: string) => edit((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id !== ti ? t : { ...t, rows: t.rows.map((r, i) => (i !== ri ? r : r.map((c, j) => (j === ci ? v : c)))) })) }));
  const addRow = (ti: string) => edit((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id !== ti ? t : { ...t, rows: [...t.rows, t.columns.map(() => '')] })) }));
  const delRow = (ti: string, ri: number) => edit((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id !== ti ? t : { ...t, rows: t.rows.filter((_, i) => i !== ri) })) }));

  const t = f?.tabs.find((x) => x.id === tab);
  const total = f ? openChecks(f) : 0;
  return <div className="fs" role="dialog" aria-modal aria-label="Fact sheet">
    <header className="fs-top">
      <ClipboardList {...I} /><strong>Fact sheet</strong>
      <span className="mute fs-saved" role="status">{!canEdit && f ? 'View only · managers and admins can edit' : saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : saved === 'saved' ? 'Saved' : f?.updatedAt ? `Updated ${new Date(f.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${f.updatedBy ? ` by ${f.updatedBy}` : ''}` : ''}</span>
      <span className="fb-sp" />
      <button className="w2-ic" onClick={onClose} aria-label="Close"><X {...I} /></button>
    </header>
    {!f ? <div className="fs-load">{err ? <p className="cd-err" role="alert">{err}</p> : <Loader2 className="spin" {...I} />}</div> : <div className="fs-body">
      <nav className="fs-nav" aria-label="Fact sheet tabs">
        <button className={'fs-tab' + (tab === 'start' ? ' on' : '')} onClick={() => setTab('start')}>Start here{total ? <i>{total}</i> : null}</button>
        {f.tabs.map((x) => { const n = x.rows.filter(isCheck).length; return <button key={x.id} className={'fs-tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>{x.title}{n ? <i>{n}</i> : <span className="mute">{x.rows.length || ''}</span>}</button>; })}
      </nav>
      <main className="fs-main">
        {err ? <p className="cd-err" role="alert">{err}</p> : null}
        {tab === 'start' || !t ? <div className="fs-start">
          <h1>The facts the Writer works from</h1>
          <p>{FACT_INTRO.what}</p><p className="mute">{FACT_INTRO.how}</p>
          <p className="fs-q"><CircleHelp {...I} /><span>{FACT_INTRO.check}{total ? ` There ${total === 1 ? 'is 1 question' : `are ${total} questions`} waiting.` : ''}</span></p>
          <p className="mute">{FACT_INTRO.keep}</p>
          <label className="fs-owner"><span>Sheet owner</span><input value={f.owner} disabled={!canEdit} placeholder="Name the person who keeps this up to date" onChange={(e) => edit((s) => ({ ...s, owner: e.target.value }))} /></label>
          {total ? <button className="btn" onClick={() => { setOnly(true); setTab(f.tabs.find((x) => x.rows.some(isCheck))!.id); }}>Answer the questions</button> : null}
        </div> : <div className="fs-sheet">
          <div className="fs-h"><div><h2>{t.title}</h2><p className="mute">{t.about}</p></div><span className="fb-sp" />
            {t.rows.some(isCheck) ? <button className={'fb-chip' + (only ? ' on' : '')} aria-pressed={only} onClick={() => setOnly(!only)}>Questions only</button> : null}</div>
          <table className="fs-t">
            <thead><tr>{t.columns.map((c) => <th key={c}>{c}</th>)}{canEdit ? <th aria-label="Actions" /> : null}</tr></thead>
            <tbody>{t.rows.map((r, ri) => (only && !isCheck(r) ? null : <tr key={ri} className={isCheck(r) ? 'q' : ''}>
              {r.map((c, ci) => <td key={ci}><textarea rows={1} value={c} disabled={!canEdit} aria-label={t.columns[ci]} onChange={(e) => setCell(t.id, ri, ci, e.target.value)} onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} /></td>)}
              {canEdit ? <td className="fs-x"><button className="w2-ic" onClick={() => delRow(t.id, ri)} aria-label="Delete row" title="Delete row"><Trash2 size={13} aria-hidden /></button></td> : null}
            </tr>))}</tbody>
          </table>
          {!t.rows.length ? <p className="mute fs-empty">Nothing here yet.</p> : null}
          {canEdit ? <button className="btn fs-add" onClick={() => { setOnly(false); addRow(t.id); }}><Plus {...I} />Add a row</button> : null}
        </div>}
      </main>
    </div>}
  </div>;
}
