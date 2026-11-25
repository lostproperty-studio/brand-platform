'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Brain, CircleHelp, ClipboardList, Heart, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { flatFacts, openChecks, type FactSheet as Sheet } from '@/lib/factSheet';
import { KIND_LABEL, type KnowledgeEntry } from '@/lib/voiceKnowledge';
import { FactSheet } from '@/components/portal/v2/FactSheet';

// What the Writer knows, in one place, in two kinds:
//  Facts: the must-knows about the brand (names, dates, prices). The Writer only states facts that are here.
//  Examples: copy the team loves, or that worked. The Writer learns how to write from them; the voice still leads.
// Both fill up as you write: the Writer spots new facts in a piece, and any line can be saved as an example.

const I = { size: 15, strokeWidth: 1.7, 'aria-hidden': true } as const;
export const knowsChanged = () => dispatchEvent(new Event('lp-knows'));

export function KnowsButton({ slug, client, facts, asItem }: { slug: string; client: string; facts: boolean; asItem?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(0);
  useEffect(() => {
    if (!facts) return;
    const f = () => fetch(`/api/p/${slug}/facts`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setQ(openChecks(j.facts))).catch(() => {});
    f(); addEventListener('lp-knows', f); return () => removeEventListener('lp-knows', f);
  }, [slug, facts]);
  return <>
    {asItem ? <button role="menuitem" onClick={() => setOpen(true)}><Brain {...I} />What the Writer knows{q ? <span className="mute"> · {q} to confirm</span> : null}</button>
      : <button className="btn kn-btn" onClick={() => setOpen(!open)} aria-expanded={open} title="The facts and examples the Writer works from"><Brain {...I} /><span className="kn-btn-t">Knows</span>{q ? <i>{q}</i> : null}</button>}
    {open ? <Knows slug={slug} client={client} facts={facts} onClose={() => setOpen(false)} /> : null}
  </>;
}

function Knows({ slug, client, facts, onClose }: { slug: string; client: string; facts: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<'facts' | 'examples'>(facts ? 'facts' : 'examples');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [ex, setEx] = useState<{ entries: KnowledgeEntry[]; mine: string[] } | null>(null);
  const [full, setFull] = useState(false);
  const loadFacts = useCallback(() => { if (facts) fetch(`/api/p/${slug}/facts`).then((r) => r.json()).then((j) => { setSheet(j.facts); setCanEdit(j.canEdit); }).catch(() => {}); }, [slug, facts]);
  const loadEx = useCallback(() => { fetch(`/api/p/${slug}/writer/knowledge`).then((r) => r.json()).then((j) => setEx({ entries: j.entries || [], mine: j.mine || [] })).catch(() => setEx({ entries: [], mine: [] })); }, [slug]);
  useEffect(() => { loadFacts(); loadEx(); addEventListener('lp-knows', loadFacts); addEventListener('lp-knows', loadEx); return () => { removeEventListener('lp-knows', loadFacts); removeEventListener('lp-knows', loadEx); }; }, [loadFacts, loadEx]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !full) onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose, full]);
  const nFacts = sheet ? flatFacts(sheet).filter((f) => f.value && !f.unsure).length : 0;
  return <>
    <div className="kn-scrim" onClick={onClose} />
    <aside className="kn" role="dialog" aria-label="What the Writer knows">
      <header className="kn-h">
        <div><strong>What the Writer knows</strong><span>About {client}, on top of the voice</span></div>
        <button className="w2-ic" onClick={onClose} aria-label="Close"><X {...I} /></button>
      </header>
      <nav className="kn-tabs" role="tablist">
        {facts ? <button role="tab" aria-selected={tab === 'facts'} className={tab === 'facts' ? 'on' : ''} onClick={() => setTab('facts')}><ClipboardList {...I} />Facts<span>{sheet ? nFacts : ''}</span></button> : null}
        <button role="tab" aria-selected={tab === 'examples'} className={tab === 'examples' ? 'on' : ''} onClick={() => setTab('examples')}><Heart {...I} />Examples<span>{ex ? ex.entries.length : ''}</span></button>
      </nav>
      <div className="kn-body">
        {tab === 'facts' ? <Facts slug={slug} sheet={sheet} canEdit={canEdit} reload={loadFacts} openFull={() => setFull(true)} />
          : <Examples slug={slug} ex={ex} reload={loadEx} />}
      </div>
    </aside>
    {full ? <FactSheet slug={slug} onClose={() => { setFull(false); loadFacts(); knowsChanged(); }} /> : null}
  </>;
}

function Facts({ slug, sheet, canEdit, reload, openFull }: { slug: string; sheet: Sheet | null; canEdit: boolean; reload: () => void; openFull: () => void }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState(''); const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const [showQ, setShowQ] = useState(false);
  const all = useMemo(() => (sheet ? flatFacts(sheet) : []), [sheet]);
  const known = all.filter((f) => f.value && !f.unsure && (!q || `${f.label} ${f.value}`.toLowerCase().includes(q.toLowerCase())));
  const asks = all.filter((f) => f.unsure);
  const groups = [...new Set(known.map((f) => f.tabTitle))];
  const add = async () => {
    if (!label.trim() || !value.trim() || busy) return; setBusy(true);
    const r = await fetch(`/api/p/${slug}/facts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label.trim(), value: value.trim() }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setNote('That didn’t save. Try again.'); return; }
    setLabel(''); setValue(''); setAdding(false); setNote(j.confirmed ? '' : 'Added as a question: a manager confirms it before the Writer uses it.'); reload(); knowsChanged();
  };
  if (!sheet) return <p className="kn-load"><Loader2 size={14} className="spin" aria-hidden /></p>;
  return <div className="kn-facts">
    <p className="kn-lede">The must-knows: names, dates, prices, places. The Writer only states facts from here, so copy stays true.</p>
    {asks.length ? <div className="kn-asks">
      <button className="kn-asks-h" onClick={() => setShowQ(!showQ)} aria-expanded={showQ}><CircleHelp {...I} />{asks.length} to confirm<span>{showQ ? 'Hide' : 'Show'}</span></button>
      {showQ ? <ul>{asks.map((f) => <li key={f.tab + f.row}><b>{f.label}</b><span>{f.question || 'Not confirmed yet'}</span></li>)}<li className="kn-asks-go"><button className="kn-link" onClick={openFull}>Answer them in the full sheet</button></li></ul> : null}
    </div> : null}
    <label className="kn-search"><Search size={14} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a fact" /></label>
    {!known.length ? <p className="kn-empty">{q ? 'Nothing matches.' : 'No facts yet. Add the few things the Writer must get right.'}</p> : null}
    {groups.map((g) => <section key={g} className="kn-g"><p className="kn-gh">{g}</p>
      {known.filter((f) => f.tabTitle === g).map((f) => <div key={f.tab + f.row} className="kn-f"><span className="kn-fk">{f.label}</span><span className="kn-fv">{f.value}</span></div>)}
    </section>)}
    {note ? <p className="kn-note">{note}</p> : null}
    {adding ? <div className="kn-add">
      <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What it is, e.g. Reception hours" />
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="The fact, e.g. Mon to Fri, 8.30am to 6.30pm" onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
      <div className="kn-add-b"><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn solid" onClick={add} disabled={busy || !label.trim() || !value.trim()}>{busy ? 'Adding…' : canEdit ? 'Add fact' : 'Suggest fact'}</button></div>
    </div> : <div className="kn-foot"><button className="btn" onClick={() => setAdding(true)}><Plus {...I} />Add a fact</button><button className="kn-link" onClick={openFull}>Open the full sheet</button></div>}
  </div>;
}

function Examples({ slug, ex, reload }: { slug: string; ex: { entries: KnowledgeEntry[]; mine: string[] } | null; reload: () => void }) {
  const [text, setText] = useState(''); const [kind, setKind] = useState<KnowledgeEntry['kind']>('liked');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const add = async () => {
    if (!text.trim() || busy) return; setBusy(true); setErr('');
    const r = await fetch(`/api/p/${slug}/writer/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text: text.trim() }) }).catch(() => null);
    setBusy(false); if (!r?.ok) { setErr('That didn’t save. Try again.'); return; }
    setText(''); reload(); knowsChanged();
  };
  const del = async (id: string) => { await fetch(`/api/p/${slug}/writer/knowledge?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null); reload(); };
  return <div className="kn-ex">
    <p className="kn-lede">Copy you love, or that worked. The Writer learns how to write from these: their rhythm, how they open, their words. The voice still leads.</p>
    <div className="kn-exadd">
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a line or a piece you love" rows={2} />
      <div className="kn-add-b"><select value={kind} onChange={(e) => setKind(e.target.value as KnowledgeEntry['kind'])} aria-label="What kind of example">{(Object.keys(KIND_LABEL) as KnowledgeEntry['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select><button className="btn solid" onClick={add} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Add example'}</button></div>
      {err ? <p className="kn-note">{err}</p> : null}
    </div>
    <p className="kn-tip">Tip: select any line you’ve written and press ♥ to save it here.</p>
    {ex === null ? <p className="kn-load"><Loader2 size={14} className="spin" aria-hidden /></p> : !ex.entries.length ? <p className="kn-empty">No examples yet.</p>
      : <ul className="kn-exl">{ex.entries.map((e) => <li key={e.id} className={e.kind}>
        <p>{e.text}</p>
        <span className="kn-exm"><span className={'kn-kind ' + e.kind}>{KIND_LABEL[e.kind]}</span>{e.where ? <span>{e.where}</span> : null}{e.by ? <span>{e.by}</span> : null}
          {ex.mine.includes(e.id) ? <button className="w2-ic" onClick={() => del(e.id)} aria-label="Remove this example" title="Remove"><Trash2 size={13} aria-hidden /></button> : null}</span>
      </li>)}</ul>}
  </div>;
}

/** Saving a line as an example (from the co-writer's bubble) */
export async function saveExample(slug: string, text: string, where?: string) {
  const r = await fetch(`/api/p/${slug}/writer/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'liked', text, where }) }).catch(() => null);
  if (r?.ok) knowsChanged();
  return !!r?.ok;
}
/** Adding a fact the Writer spotted in a piece */
export async function suggestFact(slug: string, label: string, value: string) {
  const r = await fetch(`/api/p/${slug}/facts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label, value }) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (r?.ok) knowsChanged();
  const res: 'added' | 'asked' | 'failed' = r?.ok ? (j.confirmed ? 'added' : 'asked') : 'failed';
  return res;
}
