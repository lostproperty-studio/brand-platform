'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, CircleHelp, ClipboardList, Loader2, Plus, Trash2, X } from 'lucide-react';
import { FACT_INTRO, isCheck, openChecks, type FactSheet as Sheet } from '@/lib/factSheet';

// The fact sheet, opened from the Writer. Managers and admins edit it (it saves as they type); everyone else reads it.
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** The header button: opens the sheet, with a count of questions still waiting on the client */
export function FactButton({ slug, asItem }: { slug: string; asItem?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<number | null>(null);
  useEffect(() => { fetch(`/api/p/${slug}/facts`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setQ(openChecks(j.facts))).catch(() => {}); }, [slug, open]);
  return <>
    {asItem ? <button role="menuitem" onClick={() => setOpen(true)}><ClipboardList {...I} />Fact sheet{q ? <span className="mute"> · {q} question{q === 1 ? '' : 's'}</span> : null}</button> :
    <button className="btn fct-btn" onClick={() => setOpen(true)} title={q ? `${q} question${q === 1 ? '' : 's'} waiting for an answer` : 'The facts the Writer works from'}><ClipboardList {...I} /><span className="fct-btn-t">Fact sheet</span>{q ? <i>{q}</i> : null}</button>}
    {open ? <FactSheet slug={slug} onClose={() => setOpen(false)} /> : null}
  </>;
}

export function FactSheet({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [f, setF] = useState<Sheet | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [tab, setTab] = useState('start');
  const [saved, setSaved] = useState<'' | 'saving' | 'saved' | 'error'>('');
  const [err, setErr] = useState('');
  const base = useRef<string | undefined>(undefined);
  const dirty = useRef(false);
  useEffect(() => {
    const get = () => fetch(`/api/p/${slug}/facts`).then((r) => { if (!r.ok) throw new Error(); return r.json(); });
    get().catch(() => new Promise((ok) => setTimeout(ok, 800)).then(get)).then((j) => { setF(j.facts); setCanEdit(j.canEdit); base.current = j.facts.updatedAt; }).catch(() => setErr('Couldn’t open the fact sheet. Close it and try again.'));
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
  const rowsOf = (x: Sheet['tabs'][number]) => x.rows.filter((r) => r.some((c) => c.trim())).length;
  // Answering a question: the answer goes in the row's main field, and the "Check:" note comes off
  // (into the main field if that's empty, otherwise in place of the question)
  const answer = (ti: string, ri: number, text: string) => edit((s) => ({ ...s, tabs: s.tabs.map((x) => (x.id !== ti ? x : { ...x, rows: x.rows.map((r, i) => {
    if (i !== ri) return r; const v = text.trim(); const main = !r[1]?.trim() || CHECK.test(r[1]);
    return r.map((c, j) => { if (main && j === 1 && v) return v; if (!CHECK.test(c)) return c; const k = stripCheck(c); return !main && v ? (k ? `${k}. ${v}` : v) : k; });
  }) })) }));
  return <div className="fct" role="dialog" aria-modal aria-label="Fact sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="fct-win">
      <header className="fct-top">
        <div className="fct-title"><strong>Fact sheet</strong><span className="mute">What the Writer knows. It only states facts that are here.</span></div>
        <span className="fb-sp" />
        <span className="mute fct-saved" role="status">{!canEdit && f ? 'View only' : saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : saved === 'saved' ? 'Saved' : ''}</span>
        <button className="w2-ic" onClick={onClose} aria-label="Close"><X {...I} /></button>
      </header>
      {!f ? <div className="fct-load">{err ? <p className="cd-err" role="alert">{err}</p> : <Loader2 className="spin" {...I} />}</div> : <>
        <nav className="fct-nav" aria-label="Sections">
          <button className={'fct-tab' + (tab === 'start' ? ' on' : '')} onClick={() => setTab('start')}>Overview{total ? <i>{total}</i> : null}</button>
          {f.tabs.map((x) => { const n = x.rows.filter(isCheck).length; return <button key={x.id} className={'fct-tab' + (tab === x.id ? ' on' : '')} onClick={() => setTab(x.id)}>{x.title}{n ? <i>{n}</i> : null}</button>; })}
        </nav>
        <main className="fct-main">
          {err ? <p className="cd-err" role="alert">{err}</p> : null}
          {tab === 'start' || !t ? <div className="fct-start">
            <div className="fct-stats">
              <div><b>{f.tabs.reduce((n, x) => n + rowsOf(x), 0)}</b><span className="mute">facts</span></div>
              <div className={total ? 'q' : ''}><b>{total}</b><span className="mute">question{total === 1 ? '' : 's'} to answer</span></div>
              <div><b>{f.updatedAt ? new Date(f.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '–'}</b><span className="mute">last updated{f.updatedBy ? ` by ${f.updatedBy}` : ''}</span></div>
            </div>
            {total ? <section className="fct-sec"><h3>Questions for you</h3><p className="mute">The Writer won’t use these until they’re answered.</p>
              <div className="fct-qs">{f.tabs.flatMap((x) => x.rows.map((r, ri) => ({ x, r, ri })).filter(({ r }) => isCheck(r))).map(({ x, r, ri }) => <Question key={x.id + ri} tab={x} row={r} canEdit={canEdit} onAnswer={(v) => answer(x.id, ri, v)} where={x.title} />)}</div></section> : <p className="fct-ok"><Check {...I} />Everything’s confirmed. The Writer can use all of it.</p>}
            <section className="fct-sec"><h3>Sections</h3>
              <div className="fct-cards">{f.tabs.map((x) => <button key={x.id} className="fct-card" onClick={() => setTab(x.id)}><strong>{x.title}</strong><span className="mute">{x.about}</span><span className="fct-card-n">{rowsOf(x) ? `${rowsOf(x)} item${rowsOf(x) === 1 ? '' : 's'}` : 'Empty'}</span></button>)}</div></section>
            <label className="fct-owner"><span>Who keeps this up to date?</span><input value={f.owner} disabled={!canEdit} placeholder="Name one person" onChange={(e) => edit((s) => ({ ...s, owner: e.target.value }))} /></label>
            <p className="mute fct-foot">{FACT_INTRO.how}</p>
          </div> : <div className="fct-sheet">
            <div className="fct-h"><div><h2>{t.title}</h2><p className="mute">{t.about}</p></div></div>
            {t.rows.some(isCheck) ? <section className="fct-sec"><h3>To answer</h3><div className="fct-qs">{t.rows.map((r, ri) => (isCheck(r) ? <Question key={ri} tab={t} row={r} canEdit={canEdit} onAnswer={(v) => answer(t.id, ri, v)} /> : null))}</div></section> : null}
            <section className="fct-sec">{t.rows.some(isCheck) ? <h3>Confirmed</h3> : null}
              <div className={'fct-rows' + (t.columns.length <= 3 ? ' simple' : '')}>{t.rows.map((r, ri) => (isCheck(r) ? null : <Row key={ri} cols={t.columns} row={r} canEdit={canEdit} set={(ci, v) => setCell(t.id, ri, ci, v)} del={() => delRow(t.id, ri)} />))}</div>
              {!t.rows.filter((r) => !isCheck(r)).length ? <p className="mute fct-empty">Nothing here yet.</p> : null}
              {canEdit ? <button className="btn fct-add" onClick={() => addRow(t.id)}><Plus {...I} />Add {ADD[t.id] || 'a row'}</button> : null}
            </section>
          </div>}
        </main>
      </>}
    </div>
  </div>;
}

const ADD: Record<string, string> = { key: 'a fact', people: 'a person', places: 'a place', times: 'a time or contact', prices: 'a price', residents: 'a business', events: 'an event' };
const CHECK = /(^|[\s.;,(])check:\s*/i;
/** The question in a row: the text after "Check:" */
const questionOf = (row: string[]) => { const c = row.find((x) => CHECK.test(x)) || ''; return c.slice(c.search(CHECK)).replace(CHECK, '').trim(); };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const stripCheck = (c: string) => (CHECK.test(c) ? c.slice(0, c.search(CHECK)).replace(/[\s.;,(]+$/, '') : c);

function Question({ tab, row, canEdit, onAnswer, where }: { tab: Sheet['tabs'][number]; row: string[]; canEdit: boolean; onAnswer: (v: string) => void; where?: string }) {
  const [v, setV] = useState('');
  const known = row.slice(1).map((c, i) => [tab.columns[i + 1], stripCheck(c)]).filter(([, c]) => c.trim());
  return <div className="fct-qc">
    <div className="fct-qh"><CircleHelp {...I} /><div><span className="fct-qn">{row[0] || 'Untitled'}{where ? <span className="mute"> · {where}</span> : null}</span><p>{cap(questionOf(row))}</p>
      {known.length ? <p className="mute fct-qk">Currently: {known.length === 1 ? known[0][1] : known.map(([k, c]) => `${k}: ${c}`).join(' · ')}</p> : null}</div></div>
    {canEdit ? <div className="fct-qa"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="Type the answer" onKeyDown={(e) => { if (e.key === 'Enter') onAnswer(v); }} />
      <button className="btn solid" onClick={() => onAnswer(v)}>{v.trim() ? 'Save answer' : 'It’s right as it is'}</button></div> : null}
  </div>;
}

function Row({ cols, row, canEdit, set, del }: { cols: string[]; row: string[]; canEdit: boolean; set: (ci: number, v: string) => void; del: () => void }) {
  const notes = cols.findIndex((c) => /^notes?$/i.test(c));
  return <div className="fct-row">
    <input className="fct-rt" value={row[0]} disabled={!canEdit} placeholder={cols[0]} aria-label={cols[0]} onChange={(e) => set(0, e.target.value)} />
    <div className="fct-rf">{cols.slice(1).map((c, j) => { const ci = j + 1; return <label key={c} className={ci === notes ? 'n' : ''}><span>{c}</span>
      <textarea rows={1} value={row[ci]} disabled={!canEdit} placeholder="–" onChange={(e) => set(ci, e.target.value)} ref={(el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } }} onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }} /></label>; })}</div>
    {canEdit ? <button className="w2-ic fct-del" onClick={del} aria-label="Delete" title="Delete"><Trash2 size={13} aria-hidden /></button> : null}
  </div>;
}
