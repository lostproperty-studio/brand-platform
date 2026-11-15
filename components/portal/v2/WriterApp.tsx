'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Copy, FileText, Loader2, Lock, MoreHorizontal, Plus, Redo2, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { TemplatePicker } from '@/components/portal/Writer';
import { templateById, type WriterPart } from '@/lib/writerTemplates';

// Portal v2 Writer: Docs first (one per campaign or project), then a doc of pieces. Each piece is written for one
// or more places (Instagram, email, a poster…), gets options from the Writer in the brand's voice, and moves
// Draft → In review → Signed off. Signed-off pieces lock and can be copied part by part, and the doc's delivery
// file holds only the signed-off text.
type Status = 'draft' | 'review' | 'signed';
type Val = string | string[];
export type Piece = { id: string; name: string; text: string; templates: string[]; status: Status; parts?: Record<string, Val>; signedBy?: string; signedAt?: string };
export type DocData = { intro?: string; pieces: Piece[] };
type FileRow = { id: string; title: string; status: Status; data: DocData; updated_at: string };
type Option = Record<string, Val> & { id: string; why?: string };

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const uid = () => Math.random().toString(36).slice(2, 9);
const ST: Record<Status, [string, string]> = { draft: ['Draft', 'w2-st draft'], review: ['In review', 'w2-st review'], signed: ['Signed off', 'w2-st signed'] };
const ago = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const newPiece = (name = 'Untitled piece'): Piece => ({ id: uid(), name, text: '', templates: ['instagram'], status: 'draft' });
const docStatus = (d: DocData): Status => (d.pieces.length && d.pieces.every((p) => p.status === 'signed') ? 'signed' : d.pieces.some((p) => p.status !== 'draft') ? 'review' : 'draft');
const asList = (v?: Val) => (Array.isArray(v) ? v : v ? [v] : []);

/** The text that can be copied from a piece, part by part: its chosen option's parts, or its text */
export function pieceBits(p: Piece): { label: string; text: string }[] {
  if (p.parts && Object.keys(p.parts).length) {
    const labels = new Map<string, string>();
    p.templates.forEach((t) => templateById(t).parts.forEach((x) => labels.set(x.key, `${templateById(t).label} · ${x.label}`)));
    return Object.entries(p.parts).filter(([, v]) => asList(v).length).map(([k, v]) => ({ label: labels.get(k) || k, text: asList(v).join('\n') }));
  }
  return p.text.trim() ? [{ label: p.templates.map((t) => templateById(t).label).join(' · ') || 'Copy', text: p.text.trim() }] : [];
}

function api(slug: string) {
  const base = `/api/p/${slug}/apps/writer`;
  const j = async (r: Response) => { const x = await r.json().catch(() => ({})); if (!r.ok) throw new Error(x.error || 'Something went wrong'); return x; };
  return {
    list: () => fetch(base).then(j) as Promise<{ files: FileRow[]; error?: string }>,
    open: (id: string) => fetch(`${base}/${id}`).then(j) as Promise<{ file: FileRow }>,
    create: (title: string, data: DocData) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, data }) }).then(j) as Promise<{ id: string }>,
    save: (id: string, body: Partial<Pick<FileRow, 'title' | 'status' | 'data'>>) => fetch(`${base}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j),
    remove: (id: string) => fetch(`${base}/${id}`, { method: 'DELETE' }).then(j)
  };
}

export function WriterApp({ slug, client, audiences, me, note }: { slug: string; client: string; audiences: string[]; me: string; note?: string }) {
  const A = useMemo(() => api(slug), [slug]);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<FileRow | null>(null);
  const [deliver, setDeliver] = useState(false);
  const refresh = useCallback(() => { A.list().then((r) => { setFiles(r.files); setErr(r.error || ''); }).catch((e) => setErr(e.message)); }, [A]);
  const go = useCallback(async (id: string | null, d = false, push = true) => {
    if (!id) { setOpen(null); setDeliver(false); if (push) history.pushState({}, '', location.pathname); refresh(); return; }
    try { const { file } = await A.open(id); setOpen({ ...file, data: { ...file.data, pieces: file.data?.pieces || [] } }); setDeliver(d); if (push) history.pushState({}, '', `?f=${id}${d ? '&deliver=1' : ''}`); }
    catch (e) { setErr((e as Error).message); }
  }, [A, refresh]);
  useEffect(() => {
    const read = () => { const q = new URLSearchParams(location.search); go(q.get('f'), q.get('deliver') === '1', false); };
    read(); addEventListener('popstate', read); return () => removeEventListener('popstate', read);
  }, [go]);

  if (open && deliver) return <Delivery file={open} client={client} onBack={() => go(open.id, false)} />;
  if (open) return <DocEditor key={open.id} slug={slug} client={client} audiences={audiences} me={me} file={open} onBack={() => go(null)} onDeliver={() => go(open.id, true)} />;

  const create = async () => {
    try { const { id } = await A.create('Untitled doc', { intro: '', pieces: [newPiece('First piece')] }); go(id); } catch (e) { setErr((e as Error).message); }
  };
  return <Browser files={files} err={err} note={note} onOpen={(id) => go(id)} onNew={create} onDelete={async (f) => { if (!confirm(`Delete “${f.title}”? This can’t be undone.`)) return; await A.remove(f.id).catch(() => {}); refresh(); }} />;
}

// ---------- Docs: the first screen
function Browser({ files, err, note, onOpen, onNew, onDelete }: { files: FileRow[] | null; err: string; note?: string; onOpen: (id: string) => void; onNew: () => void; onDelete: (f: FileRow) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const list = (files || []).filter((f) => (filter === 'all' || f.status === filter) && (!q || f.title.toLowerCase().includes(q.toLowerCase())));
  return <div className="fb">
    <header className="fb-top">
      <AppIcon app="writer" size={18} play /><strong>Writer</strong><span className="mute">/</span><span>Docs</span>
      <span className="fb-sp" />
      <label className="fb-search"><Search {...I} /><span className="sr">Search docs</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs" /></label>
      <button className="btn solid" onClick={onNew}><Plus {...I} />New doc</button>
    </header>
    <div className="fb-body">
      {note ? <p className="wr-note-studio" role="note">{note}</p> : null}
      <div className="fb-bar"><h1>Docs</h1><span className="mute">{files ? `${files.length} doc${files.length === 1 ? '' : 's'}` : ''}</span><span className="fb-sp" />
        {(['all', 'draft', 'review', 'signed'] as const).map((k) => <button key={k} className={'fb-chip' + (filter === k ? ' on' : '')} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'all' ? 'All' : ST[k][0]}</button>)}
      </div>
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
      <div className="fb-grid">
        <button className="fb-card fb-new" onClick={onNew}><span className="fb-th"><Plus size={20} strokeWidth={1.5} aria-hidden /><span>New doc</span></span><span className="fb-name">New doc</span><span className="fb-meta mute">One per campaign or project</span></button>
        {files === null ? <div className="fb-card" aria-busy><span className="fb-th" /></div> : list.map((f) => {
          const first = f.data?.pieces?.find((p) => p.text?.trim());
          return <div key={f.id} className="fb-card">
            <button className="fb-open" onClick={() => onOpen(f.id)} aria-label={`Open ${f.title}`}>
              <span className="fb-th"><span className="fb-page"><span className="fb-page-k">{first?.name || 'Doc'}</span><span className="fb-page-h">{first?.text?.split('\n')[0]?.slice(0, 70) || f.title}</span><span className="fb-page-b">{f.data?.intro?.slice(0, 180)}</span></span></span>
              <span className="fb-name">{f.title}</span>
              <span className="fb-meta"><span className={ST[f.status][1]}>{ST[f.status][0]}</span><span className="mute">{f.data?.pieces?.length || 0} piece{f.data?.pieces?.length === 1 ? '' : 's'} · {ago(f.updated_at)}</span></span>
            </button>
            <button className="fb-del" onClick={() => onDelete(f)} aria-label={`Delete ${f.title}`} title="Delete"><Trash2 size={14} strokeWidth={1.6} aria-hidden /></button>
          </div>;
        })}
      </div>
      {files?.length === 0 ? <p className="mute">No docs yet. Start one for a campaign, then add a piece for each thing you need to write.</p> : null}
    </div>
  </div>;
}

// ---------- The doc
function DocEditor({ slug, client, audiences, me, file, onBack, onDeliver }: { slug: string; client: string; audiences: string[]; me: string; file: FileRow; onBack: () => void; onDeliver: () => void }) {
  const A = useMemo(() => api(slug), [slug]);
  const [title, setTitle] = useState(file.title);
  const [doc, setDoc] = useState<DocData>(file.data);
  const [active, setActive] = useState(file.data.pieces[0]?.id || '');
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [cardsW, setCardsW] = useState(360);
  const first = useRef(true);
  // Saves a moment after the last change
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = setTimeout(() => { A.save(file.id, { title: title.trim() || 'Untitled doc', data: doc, status: docStatus(doc) }).then(() => setSaved('saved')).catch(() => setSaved('error')); }, 700);
    return () => clearTimeout(t);
  }, [doc, title, A, file.id]);
  const setPiece = (id: string, p: Partial<Piece>) => setDoc((d) => ({ ...d, pieces: d.pieces.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const addPiece = () => { const p = newPiece(); setDoc((d) => ({ ...d, pieces: [...d.pieces, p] })); setActive(p.id); };
  const delPiece = (id: string) => { if (!confirm('Delete this piece?')) return; setDoc((d) => ({ ...d, pieces: d.pieces.filter((x) => x.id !== id) })); };
  const piece = doc.pieces.find((p) => p.id === active) || doc.pieces[0];
  const signed = doc.pieces.filter((p) => p.status === 'signed').length;
  const resize = (e: React.MouseEvent) => { e.preventDefault(); const x0 = e.clientX, w0 = cardsW; const mv = (m: MouseEvent) => setCardsW(Math.max(300, Math.min(560, w0 - (m.clientX - x0)))); const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  const ex = (cmd: string) => (e: React.MouseEvent) => { e.preventDefault(); document.execCommand(cmd); };

  return <div className="w2">
    <header className="w2-top">
      <button className="w2-ic" onClick={onBack} aria-label="Back to Docs" title="Back to Docs"><ArrowLeft {...I} /></button>
      <AppIcon app="writer" size={18} play /><button className="w2-crumb" onClick={onBack}>Writer</button><span className="mute">/</span>
      <input className="w2-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Doc name" />
      <span className={ST[docStatus(doc)][1]}>{ST[docStatus(doc)][0]}</span>
      <span className="mute w2-saved" role="status">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>
      <span className="fb-sp" />
      <button className="btn solid" onClick={onDeliver} disabled={!signed} title={signed ? 'The signed-off text, ready to copy and share' : 'Sign off a piece first'}>Deliver{signed ? ` · ${signed}` : ''}</button>
    </header>
    <div className="w2-body" style={{ gridTemplateColumns: `220px minmax(0, 1fr) ${cardsW}px` }}>
      <aside className="w2-side" aria-label="Pieces">
        <div className="w2-side-h"><strong>Pieces</strong><span className="mute">{doc.pieces.length}</span></div>
        <div className="w2-list">{doc.pieces.map((p, i) => <button key={p.id} className={'w2-row' + (p.id === piece?.id ? ' on' : '')} onClick={() => setActive(p.id)}>
          <span className="mute w2-n">{i + 1}</span><span className="w2-row-t"><span>{p.name}</span><span className="mute">{p.text.trim() ? `${p.text.trim().split(/\s+/).length} words` : 'Empty'} · {p.templates.length} place{p.templates.length === 1 ? '' : 's'}</span></span>
          <span className={ST[p.status][1]}>{p.status === 'signed' ? <Check size={11} aria-hidden /> : ST[p.status][0]}</span></button>)}
          <button className="w2-add" onClick={addPiece}><Plus size={14} aria-hidden />New piece</button>
        </div>
      </aside>
      <section className="w2-doc" aria-label="The doc">
        <div className="w2-tb" role="toolbar" aria-label="Formatting">
          <button onMouseDown={ex('undo')} aria-label="Undo" title="Undo ⌘Z"><Undo2 {...I} /></button><button onMouseDown={ex('redo')} aria-label="Redo" title="Redo ⇧⌘Z"><Redo2 {...I} /></button><span className="w2-sep" />
          <button onClick={addPiece}><Plus {...I} />Piece</button><span className="w2-sep" /><span className="mute w2-tb-note">Plain text, so it pastes cleanly anywhere</span>
        </div>
        <article className="w2-page">
          <p className="mute w2-kick">{client} · {doc.pieces.length} piece{doc.pieces.length === 1 ? '' : 's'}</p>
          <input className="w2-h1" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Doc name" />
          <textarea className="w2-intro" value={doc.intro || ''} onChange={(e) => setDoc((d) => ({ ...d, intro: e.target.value }))} placeholder="What’s this doc for? A line or two about the campaign or project." rows={2} />
          {doc.pieces.map((p, i) => <PieceBlock key={p.id} n={i + 1} p={p} on={p.id === piece?.id} me={me} onFocus={() => setActive(p.id)} set={(x) => setPiece(p.id, x)} onDelete={() => delPiece(p.id)} />)}
          <button className="btn" onClick={addPiece}><Plus {...I} />New piece</button>
        </article>
      </section>
      <aside className="w2-cards" aria-label="Cards for this piece">
        <span className="w2-grip" role="separator" aria-orientation="vertical" aria-label="Resize" onMouseDown={resize} />
        {piece ? <Cards key={piece.id} slug={slug} audiences={audiences} piece={piece} intro={doc.intro || ''} set={(x) => setPiece(piece.id, x)} /> : <p className="mute" style={{ padding: 16 }}>Add a piece to start.</p>}
      </aside>
    </div>
  </div>;
}

function PieceBlock({ n, p, on, me, onFocus, set, onDelete }: { n: number; p: Piece; on: boolean; me: string; onFocus: () => void; set: (x: Partial<Piece>) => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState('');
  const copy = async (k: string, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1400); } catch { /* blocked */ } };
  const bits = pieceBits(p);
  const places = p.templates.map((t) => templateById(t).label).join(' · ');
  return <div className={'w2-piece' + (on ? ' on' : '') + (p.status === 'signed' ? ' locked' : '')} onClick={onFocus}>
    <div className="w2-ph">
      <span className="mute w2-n">Piece {n}</span>
      <input className="w2-pname" value={p.name} onChange={(e) => set({ name: e.target.value })} aria-label="Piece name" disabled={p.status === 'signed'} />
      <span className="fb-sp" />
      {p.status === 'draft' ? <><span className={ST.draft[1]}>Draft</span><button className="btn sm" onClick={() => set({ status: 'review' })}>Request review</button></> : null}
      {p.status === 'review' ? <><span className={ST.review[1]}>In review</span><button className="btn sm solid" onClick={() => set({ status: 'signed', signedBy: me, signedAt: new Date().toISOString() })}>Sign off</button></> : null}
      {p.status === 'signed' ? <span className="w2-lock"><Lock size={12} aria-hidden />Signed off</span> : null}
      <span className="w2-menu-wrap">
        <button className="w2-ic" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }} aria-label="Piece details and actions" aria-expanded={menu}><MoreHorizontal {...I} /></button>
        {menu ? <div className="w2-menu" role="menu" onMouseLeave={() => setMenu(false)}>
          <div className="w2-kv"><span className="mute">For</span><span>{places}</span></div>
          {p.signedBy ? <div className="w2-kv"><span className="mute">Signed off</span><span>{p.signedBy} · {new Date(p.signedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div> : null}
          <hr />
          {p.status === 'review' ? <button role="menuitem" onClick={() => { set({ status: 'draft' }); setMenu(false); }}>Request changes</button> : null}
          {p.status === 'signed' ? <><button role="menuitem" onClick={() => copy('all', bits.map((b) => b.text).join('\n\n'))}>Copy all text</button><button role="menuitem" onClick={() => { set({ status: 'draft', signedBy: undefined, signedAt: undefined }); setMenu(false); }}>Reopen for edits</button></> : null}
          <button role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(); }}>Delete piece</button>
        </div> : null}
      </span>
    </div>
    {p.status === 'signed'
      ? <div className="w2-bits">{bits.length ? bits.map((b, k) => <div key={k} className="w2-bit"><div className="w2-bit-h"><span>{b.label}</span><button className="btn sm" onClick={() => copy(String(k), b.text)}><Copy size={12} aria-hidden />{copied === String(k) ? 'Copied' : 'Copy'}</button></div><p>{b.text}</p></div>) : <p className="mute">Nothing written in this piece.</p>}</div>
      : <textarea className="w2-text" value={p.text} onChange={(e) => set({ text: e.target.value, parts: undefined })} placeholder="Write here, or a brief: what does this piece need to say? Then get options from the Writer on the right." rows={Math.max(3, p.text.split('\n').length + 1)} />}
  </div>;
}

// ---------- The cards on the right: where the piece is going, and options from the Writer
function Cards({ slug, audiences, piece, intro, set }: { slug: string; audiences: string[]; piece: Piece; intro: string; set: (x: Partial<Piece>) => void }) {
  const [pick, setPick] = useState(false);
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState(60);
  const [options, setOptions] = useState<Option[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const tpls = piece.templates.map(templateById);
  const parts: WriterPart[] = [...new Map(tpls.flatMap((t) => t.parts).map((x) => [x.key, x])).values()].slice(0, 8);
  const locked = piece.status === 'signed';
  async function write() {
    setErr(''); setBusy(true);
    const brief = [piece.text.trim() || `${piece.name}.`, intro.trim() ? `Context: ${intro.trim()}` : ''].filter(Boolean).join('\n\n');
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'write', brief, template: tpls.map((t) => t.label).join(' + '), parts: parts.length ? parts : [{ key: 'body', label: 'Copy', body: true }], audience: audience || undefined, tone, length: 'short', count: 3 }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { setErr(j.error || 'Something went wrong. Try again.'); return; }
    setOptions((o) => [...(j.options || []).map((x: Option) => ({ ...x, id: uid() })), ...o]);
  }
  const use = (o: Option) => {
    const vals: Record<string, Val> = {}; parts.forEach((p) => { if (o[p.key]) vals[p.key] = o[p.key]; });
    set({ parts: vals, text: parts.filter((p) => o[p.key]).map((p) => `${p.label}\n${asList(o[p.key]).join('\n')}`).join('\n\n') });
    setOptions((x) => x.filter((y) => y.id !== o.id));
  };
  return <div className="w2-cards-in">
    <div className="w2-cards-h"><span className="mute">{piece.name}</span></div>
    <div className="w2-for">
      <span className="mute">For</span>
      <div className="w2-for-strip" onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
        {tpls.map((t) => <span key={t.id} className="w2-chip">{t.label}{!locked && tpls.length > 1 ? <button onClick={() => set({ templates: piece.templates.filter((x) => x !== t.id) })} aria-label={`Remove ${t.label}`}><X size={11} aria-hidden /></button> : null}</span>)}
      </div>
      {tpls.length > 1 ? <span className="mute w2-cnt">{tpls.length}</span> : null}
      {!locked ? <span className="w2-pick-wrap"><button className="w2-ic sq wr-for-btn" onClick={() => setPick(!pick)} aria-label="Add a place it’s going" aria-expanded={pick}><Plus size={13} aria-hidden /></button>
        {pick ? <TemplatePicker current={piece.templates[0]} onPick={(id) => { if (!piece.templates.includes(id)) set({ templates: [...piece.templates, id] }); setPick(false); }} onClose={() => setPick(false)} /> : null}</span> : null}
    </div>
    {locked ? <p className="mute w2-cards-note"><Lock size={12} aria-hidden /> Signed off. Reopen it from the piece’s ⋯ menu to change it.</p> : <>
      <div className="w2-conds">
        <label className="w2-pill"><span className="mute">Audience</span><select value={audience} onChange={(e) => setAudience(e.target.value)}><option value="">Anyone</option>{audiences.map((a) => <option key={a}>{a}</option>)}</select><ChevronDown size={12} aria-hidden /></label>
        <label className="w2-pill"><span className="mute">Functional</span><input type="range" min={0} max={100} step={10} value={tone} onChange={(e) => setTone(Number(e.target.value))} aria-label="Functional to expressive" /><span className="mute">Expressive</span></label>
      </div>
      <button className="btn solid w2-write" onClick={write} disabled={busy}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Sparkles size={14} aria-hidden />}{busy ? 'Writing options…' : options.length ? 'More options' : 'Write options'}</button>
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
    </>}
    <div className="w2-opts">
      {!locked && !options.length && !busy ? <p className="mute w2-empty"><FileText size={16} strokeWidth={1.5} aria-hidden />Options for {tpls.map((t) => t.label).join(', ')} appear here, written from what’s in the piece.</p> : null}
      {options.map((o) => <div key={o.id} className="w2-opt">
        {parts.filter((p) => o[p.key]).map((p) => <div key={p.key} className="w2-opt-p"><span className="mute">{p.label}</span>{asList(o[p.key]).map((v, k) => <p key={k}>{v}</p>)}</div>)}
        {o.why ? <p className="mute w2-why">{o.why}</p> : null}
        <div className="w2-opt-a"><button className="btn sm solid" onClick={() => use(o)}>Use this</button><button className="btn sm" onClick={() => navigator.clipboard?.writeText(parts.filter((p) => o[p.key]).map((p) => asList(o[p.key]).join('\n')).join('\n\n'))}><Copy size={12} aria-hidden />Copy</button><button className="w2-ic" onClick={() => setOptions((x) => x.filter((y) => y.id !== o.id))} aria-label="Dismiss"><X size={13} aria-hidden /></button></div>
      </div>)}
    </div>
  </div>;
}

// ---------- The delivery file: only the signed-off text, ready to copy
function Delivery({ file, client, onBack }: { file: FileRow; client: string; onBack: () => void }) {
  const [copied, setCopied] = useState('');
  const copy = async (k: string, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1400); } catch { /* blocked */ } };
  const done = file.data.pieces.filter((p) => p.status === 'signed');
  const rest = file.data.pieces.filter((p) => p.status !== 'signed');
  const all = done.flatMap((p) => pieceBits(p).map((b) => b.text)).join('\n\n');
  return <div className="dv">
    <div className="dv-bar"><button className="btn" onClick={onBack}><ArrowLeft {...I} />Back to the doc</button><span className="fb-sp" /><button className="btn" onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button><button className="btn" onClick={() => print()}>Download PDF</button></div>
    <article className="dv-page">
      <p className="mute dv-k"><AppIcon app="writer" size={14} still /> Delivery file · {client}</p>
      <h1>{file.title}</h1>
      {file.data.intro ? <p className="mute">{file.data.intro}</p> : null}
      <div className="dv-note"><span>Only copy the text on the right. The labels say where each line goes. Everything here is signed off.</span><button className="btn sm solid" onClick={() => copy('all', all)} disabled={!done.length}><Copy size={12} aria-hidden />{copied === 'all' ? 'Copied all' : 'Copy all text'}</button></div>
      {done.map((p) => <section key={p.id} className="dv-piece">
        <div className="dv-ph"><h2>{p.name}</h2><span className="dv-signed"><Lock size={11} aria-hidden />Signed off{p.signedBy ? ` by ${p.signedBy}` : ''}{p.signedAt ? ` · ${new Date(p.signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span></div>
        <p className="dv-for">For: {p.templates.map((t) => templateById(t).label).join(' · ')}</p>
        {pieceBits(p).map((b, k) => <div key={k} className="dv-row"><span className="mute">{b.label}</span><p>{b.text}</p><button className="btn sm" onClick={() => copy(p.id + k, b.text)}><Copy size={12} aria-hidden />{copied === p.id + k ? 'Copied' : 'Copy'}</button></div>)}
      </section>)}
      {!done.length ? <p className="mute">Nothing signed off yet.</p> : null}
      {rest.length ? <div className="dv-rest"><strong>Still in progress, not included</strong>{rest.map((p) => <span key={p.id} className="mute">{p.name} · {ST[p.status][0]}</span>)}</div> : null}
    </article>
  </div>;
}
