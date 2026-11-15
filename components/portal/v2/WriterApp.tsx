'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, Check, ChevronDown, Copy, Heart, Loader2, Lock, MoreHorizontal, Plus, Redo2, RefreshCw, Search, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { TEMPLATE_GROUPS, WRITER_TEMPLATES, templateById, type WriterPart, type WriterTemplate } from '@/lib/writerTemplates';
import { KIND_LABEL, type KnowledgeEntry } from '@/lib/voiceKnowledge';

// Portal v2 Writer: Docs first (one per campaign or project), then a doc of pieces. Each piece is written for one
// or more places (Instagram, email, a poster…), gets options from the Writer in the brand's voice, and moves
// Draft → In review → Signed off. Signed-off pieces lock and can be copied part by part, and the doc's delivery
// file holds only the signed-off text.
type Status = 'draft' | 'review' | 'signed';
type Val = string | string[];
/** An idea from the Writer: an angle on the piece, its core line, and a taste of it in each place it's going */
export type Idea = { id: string; angle: string; line: string; why: string; tastes: { place: string; text: string }[]; loved?: boolean };
/** The finished copy for one place (a template), part by part */
export type Out = Record<string, Val>;
type Length = 'line' | 'short' | 'medium' | 'long';
export type Piece = { id: string; name: string; text: string; templates: string[]; status: Status; parts?: Record<string, Val>; signedBy?: string; signedAt?: string;
  ideas?: Idea[]; idea?: string; out?: Record<string, Out>; mode?: 'ideas' | 'refine'; length?: Length; audience?: string };
export type DocData = { intro?: string; tone?: number; pieces: Piece[] };
/** The client's look, for previews of where the copy is going */
export type BrandLook = { name: string; handle: string; dark: string; light: string; avatar: string | null };
type FileRow = { id: string; title: string; status: Status; data: DocData; updated_at: string };

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const uid = () => Math.random().toString(36).slice(2, 9);
const ST: Record<Status, [string, string]> = { draft: ['Draft', 'w2-st draft'], review: ['In review', 'w2-st review'], signed: ['Signed off', 'w2-st signed'] };
const ago = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const newPiece = (name = 'Untitled piece'): Piece => ({ id: uid(), name, text: '', templates: ['instagram'], status: 'draft' });
const docStatus = (d: DocData): Status => (d.pieces.length && d.pieces.every((p) => p.status === 'signed') ? 'signed' : d.pieces.some((p) => p.status !== 'draft') ? 'review' : 'draft');
const asList = (v?: Val) => (Array.isArray(v) ? v : v ? [v] : []);

const partsOf = (t: WriterTemplate): WriterPart[] => (t.parts.length ? t.parts : [{ key: 'body', label: 'Copy', body: true }]);
const outText = (t: WriterTemplate, o: Out) => partsOf(t).filter((x) => asList(o[x.key]).length).map((x) => asList(o[x.key]).join('\n')).join('\n\n');

/** The text that can be copied from a piece, part by part: its finished copy for each place, or its text */
export function pieceBits(p: Piece): { label: string; text: string }[] {
  const out = p.out ? p.templates.filter((t) => p.out![t]) : [];
  if (out.length) return out.flatMap((id) => { const t = templateById(id); return partsOf(t).filter((x) => asList(p.out![id][x.key]).length).map((x) => ({ label: `${t.label} · ${x.label}`, text: asList(p.out![id][x.key]).join('\n') })); });
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

export function WriterApp({ slug, client, audiences, me, note, brand }: { slug: string; client: string; audiences: string[]; me: string; note?: string; brand: BrandLook }) {
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
  if (open) return <DocEditor key={open.id} slug={slug} client={client} audiences={audiences} me={me} brand={brand} file={open} onBack={() => go(null)} onDeliver={() => go(open.id, true)} />;

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
const TONES: [number, string][] = [[10, 'Functional'], [30, 'Mostly functional'], [50, 'Balanced'], [70, 'Mostly expressive'], [90, 'Expressive']];
const LENGTHS: [Length, string][] = [['line', 'A line'], ['short', 'Short'], ['medium', 'A paragraph'], ['long', 'Long']];
type Cmd = { kind: 'ideas' | 'fit'; n: number };

function DocEditor({ slug, client, audiences, me, brand, file, onBack, onDeliver }: { slug: string; client: string; audiences: string[]; me: string; brand: BrandLook; file: FileRow; onBack: () => void; onDeliver: () => void }) {
  const A = useMemo(() => api(slug), [slug]);
  const [title, setTitle] = useState(file.title);
  const [doc, setDoc] = useState<DocData>(file.data);
  const [active, setActive] = useState(file.data.pieces[0]?.id || '');
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [cardsW, setCardsW] = useState(380);
  const [cmd, setCmd] = useState<Cmd>({ kind: 'ideas', n: 0 });
  const [know, setKnow] = useState(false);
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
  const pi = piece ? doc.pieces.indexOf(piece) : -1;
  const signed = doc.pieces.filter((p) => p.status === 'signed').length;
  const ready = doc.pieces.filter((p) => p.status === 'draft' && (p.text.trim() || p.out));
  const tone = doc.tone ?? 70;
  const resize = (e: React.MouseEvent) => { e.preventDefault(); const x0 = e.clientX, w0 = cardsW; const mv = (m: MouseEvent) => setCardsW(Math.max(320, Math.min(600, w0 - (m.clientX - x0)))); const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  const ex = (c: string) => (e: React.MouseEvent) => { e.preventDefault(); document.execCommand(c); };
  const sendAll = () => setDoc((d) => ({ ...d, pieces: d.pieces.map((p) => (p.status === 'draft' && (p.text.trim() || p.out) ? { ...p, status: 'review' } : p)) }));

  return <div className="w2">
    <header className="w2-top">
      <button className="w2-ic" onClick={onBack} aria-label="Back to Docs" title="Back to Docs"><ArrowLeft {...I} /></button>
      <AppIcon app="writer" size={18} play /><button className="w2-crumb" onClick={onBack}>Writer</button><span className="mute">/</span>
      <input className="w2-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Doc name" />
      <span className={ST[docStatus(doc)][1]}>{ST[docStatus(doc)][0]}</span>
      <span className="mute w2-saved" role="status">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>
      <span className="fb-sp" />
      <span className="w3-know-wrap"><button className="w2-ic" onClick={() => setKnow(!know)} aria-expanded={know} aria-label="Writer’s knowledge" title="Writer’s knowledge"><Brain {...I} /></button>
        {know ? <Knowledge slug={slug} client={client} onClose={() => setKnow(false)} /> : null}</span>
      <button className="btn" onClick={sendAll} disabled={!ready.length} title={ready.length ? `Move ${ready.length} piece${ready.length === 1 ? '' : 's'} to In review` : 'Write a piece first'}>Send for approval</button>
      <button className="btn solid" onClick={onDeliver} disabled={!signed} title={signed ? 'The signed-off text, ready to copy and share' : 'Sign off a piece first'}>Deliver{signed ? ` · ${signed}` : ''}</button>
    </header>
    <div className="w2-body" style={{ gridTemplateColumns: `240px minmax(0, 1fr) ${cardsW}px` }}>
      <aside className="w2-side" aria-label="Pieces">
        <div className="w2-side-h"><strong>Pieces</strong><span className="mute">{doc.pieces.length}</span></div>
        <a className="w3-voice" href={`/p/${slug}/guidelines`}><BookOpen size={14} strokeWidth={1.6} aria-hidden /><span>Voice from Guidelines</span><span className="w3-tag ok">In sync</span></a>
        <div className="w2-list">{doc.pieces.map((p, i) => <button key={p.id} className={'w2-row' + (p.id === piece?.id ? ' on' : '')} onClick={() => { setActive(p.id); document.getElementById(`pc-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
          <span className="mute w2-n">{i + 1}</span><span className="w2-row-t"><span>{p.name}</span><span className="mute">{p.out ? `${Object.keys(p.out).length} place${Object.keys(p.out).length === 1 ? '' : 's'} fitted` : p.text.trim() ? `${p.text.trim().split(/\s+/).length} words` : 'Empty'} · {p.templates.map((t) => templateById(t).label.split(' ')[0]).join(', ')}</span></span>
          <span className={ST[p.status][1]}>{p.status === 'signed' ? <Check size={11} aria-hidden /> : ST[p.status][0]}</span></button>)}
          <button className="w2-add" onClick={addPiece}><Plus size={14} aria-hidden />New piece</button>
        </div>
      </aside>
      <section className="w2-doc" aria-label="The doc">
        <div className="w2-tb" role="toolbar" aria-label="Writing">
          <button onMouseDown={ex('undo')} aria-label="Undo" title="Undo ⌘Z"><Undo2 {...I} /></button><button onMouseDown={ex('redo')} aria-label="Redo" title="Redo ⇧⌘Z"><Redo2 {...I} /></button><span className="w2-sep" />
          <label className="w3-tone"><span className="sr">Tone</span><select value={tone} onChange={(e) => setDoc((d) => ({ ...d, tone: Number(e.target.value) }))}>{TONES.map(([v, l]) => <option key={v} value={v}>Tone: {l}</option>)}</select><ChevronDown size={12} aria-hidden /></label>
          <span className="w2-sep" /><button onClick={addPiece}><Plus {...I} />Piece</button><span className="w2-sep" /><span className="mute w2-tb-note">Plain text, so it pastes cleanly anywhere</span>
        </div>
        <article className="w2-page">
          <p className="mute w2-kick">{client} · {doc.pieces.length} piece{doc.pieces.length === 1 ? '' : 's'}</p>
          <input className="w2-h1" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Doc name" />
          <textarea className="w2-intro" value={doc.intro || ''} onChange={(e) => setDoc((d) => ({ ...d, intro: e.target.value }))} placeholder="What’s this doc for? A line or two about the campaign or project." rows={2} />
          {doc.pieces.map((p, i) => <PieceBlock key={p.id} n={i + 1} p={p} on={p.id === piece?.id} me={me} onFocus={() => setActive(p.id)} set={(x) => setPiece(p.id, x)} onDelete={() => delPiece(p.id)} />)}
          <button className="btn" onClick={addPiece}><Plus {...I} />New piece</button>
        </article>
        {piece && piece.status !== 'signed' ? <div className="w3-bar">
          <span className="w3-bar-n">{piece.name}</span>
          <button className="btn pink" onClick={() => setCmd({ kind: 'ideas', n: cmd.n + 1 })}><Sparkles size={14} aria-hidden />Write 3 options</button>
          <button className="btn" onClick={() => setCmd({ kind: 'fit', n: cmd.n + 1 })}>Fit to templates</button>
        </div> : null}
      </section>
      <aside className="w2-cards" aria-label="Cards for this piece">
        <span className="w2-grip" role="separator" aria-orientation="vertical" aria-label="Resize" onMouseDown={resize}><i /></span>
        {piece ? <Cards key={piece.id} slug={slug} audiences={audiences} brand={brand} n={pi + 1} piece={piece} intro={doc.intro || ''} tone={tone} cmd={cmd} set={(x) => setPiece(piece.id, x)} /> : <p className="mute" style={{ padding: 16 }}>Add a piece to start.</p>}
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
  const fitted = p.out ? p.templates.filter((t) => p.out![t]) : [];
  return <div id={`pc-${p.id}`} className={'w2-piece' + (on ? ' on' : '') + (p.status === 'signed' ? ' locked' : '')} onClick={onFocus}>
    <div className="w2-ph">
      <span className="mute w2-n">Piece {n}</span>
      <input className="w2-pname" value={p.name} onChange={(e) => set({ name: e.target.value })} aria-label="Piece name" disabled={p.status === 'signed'} />
      <span className="fb-sp" />
      {p.status === 'draft' ? <><span className={ST.draft[1]}>Draft</span><button className="btn sm" onClick={() => set({ status: 'review' })} disabled={!p.text.trim() && !p.out}>Request review</button></> : null}
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
      : fitted.length
        ? <div className="w2-bits">{fitted.map((id) => { const t = templateById(id); return <div key={id} className="w2-bit"><div className="w2-bit-h"><span>{t.label}</span><button className="btn sm" onClick={(e) => { e.stopPropagation(); set({ text: fitted.map((x) => `${templateById(x).label}\n${outText(templateById(x), p.out![x])}`).join('\n\n'), out: undefined }); }}>Edit as text</button></div>
            {partsOf(t).filter((x) => asList(p.out![id][x.key]).length).map((x) => <p key={x.key}><span className="mute w3-pl">{x.label} · </span>{asList(p.out![id][x.key]).join('\n')}</p>)}</div>; })}</div>
        : <textarea className="w2-text" value={p.text} onChange={(e) => set({ text: e.target.value, parts: undefined })} placeholder="Write here, or a brief: what does this piece need to say? Then Write 3 options, or Fit to templates." rows={Math.max(3, p.text.split('\n').length + 1)} />}
  </div>;
}

// ---------- The Writer's knowledge: lines the team love, that worked, or that missed
function Knowledge({ slug, client, onClose }: { slug: string; client: string; onClose: () => void }) {
  const [list, setList] = useState<KnowledgeEntry[] | null>(null);
  useEffect(() => { fetch(`/api/p/${slug}/writer/knowledge`).then((r) => r.json()).then((j) => setList(j.entries || [])).catch(() => setList([])); }, [slug]);
  return <div className="w3-know" role="dialog" aria-label="Writer’s knowledge" onMouseLeave={onClose}>
    <p className="w3-know-h"><strong>What the Writer has learned</strong><button className="w2-ic" onClick={onClose} aria-label="Close"><X size={13} aria-hidden /></button></p>
    <p className="mute w3-know-s">Examples from the {client} team, used alongside the voice. Add one with the heart on any idea.</p>
    {list === null ? <p className="mute"><Loader2 size={13} className="spin" aria-hidden /> Loading</p> : !list.length ? <p className="mute">Nothing yet.</p>
      : <ul>{list.slice(0, 30).map((e) => <li key={e.id}><span className="w3-tag">{KIND_LABEL[e.kind]}</span><span>{e.text}</span></li>)}</ul>}
  </div>;
}

// ---------- The cards on the right: Ideas (angles on the piece), then Refine (fitted to each place it's going)
function writerApi(slug: string) {
  const post = async (body: object) => {
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) throw new Error(j.error || 'Something went wrong. Try again.');
    return j;
  };
  return { post };
}
const ideaText = (i: Idea) => `${i.angle}: ${i.line}`;

function Cards({ slug, audiences, brand, n, piece, intro, tone, cmd, set }: { slug: string; audiences: string[]; brand: BrandLook; n: number; piece: Piece; intro: string; tone: number; cmd: Cmd; set: (x: Partial<Piece>) => void }) {
  const W = useMemo(() => writerApi(slug), [slug]);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fitting, setFitting] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');
  const mode = piece.mode || 'ideas';
  const length = piece.length || 'short';
  const tpls = piece.templates.map(templateById);
  const locked = piece.status === 'signed';
  const chosen = piece.ideas?.find((i) => i.id === piece.idea);
  const brief = () => [piece.text.trim() || `${piece.name}.`, intro.trim() ? `Context: ${intro.trim()}` : ''].filter(Boolean).join('\n\n');
  const copy = async (k: string, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1400); } catch { /* blocked */ } };
  // Keep the latest piece for async work, so results land on the piece as it is when they arrive
  const cur = useRef(piece); cur.current = piece;

  async function ideas(like?: Idea) {
    if (locked) return;
    setErr(''); setBusy(true); set({ mode: 'ideas' });
    try {
      const j = await W.post({ mode: 'ideas', brief: brief(), places: tpls.map((t) => t.label), audience: piece.audience || undefined, tone, length, count: 3, like: like ? { idea: ideaText(like) } : undefined });
      const fresh: Idea[] = (j.ideas || []).map((x: Omit<Idea, 'id'>) => ({ ...x, id: uid() }));
      set({ ideas: [...fresh, ...(cur.current.ideas || [])].slice(0, 12) });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  async function fitOne(id: string, idea?: Idea, like?: Out) {
    const t = templateById(id);
    const j = await W.post({ mode: 'write', brief: brief(), template: t.label, templateNote: t.note, parts: partsOf(t), audience: piece.audience || undefined, tone, length: t.length || length, count: 1, idea: idea ? ideaText(idea) : undefined, like });
    return (j.options?.[0] || null) as Out | null;
  }
  async function fit(idea?: Idea, only?: string) {
    if (locked) return;
    const ids = only ? [only] : piece.templates;
    setErr(''); set({ mode: 'refine', ...(idea ? { idea: idea.id } : {}) }); setFitting(ids);
    const res = await Promise.allSettled(ids.map((id) => fitOne(id, idea || chosen, only ? piece.out?.[only] : undefined)));
    const out = { ...(cur.current.out || {}) };
    res.forEach((r, k) => { if (r.status === 'fulfilled' && r.value) { const { why: _w, ...o } = r.value as Out & { why?: string }; out[ids[k]] = o; } });
    const failed = res.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (failed) setErr((failed.reason as Error).message);
    set({ out, mode: 'refine' }); setFitting([]);
  }
  // The buttons under the doc
  const seen = useRef(cmd.n);
  useEffect(() => { if (cmd.n === seen.current) return; seen.current = cmd.n; if (cmd.kind === 'ideas') ideas(); else fit(); }, [cmd]); // eslint-disable-line react-hooks/exhaustive-deps

  async function love(i: Idea) {
    set({ ideas: (piece.ideas || []).map((x) => (x.id === i.id ? { ...x, loved: !x.loved } : x)) });
    if (!i.loved) await fetch(`/api/p/${slug}/writer/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'liked', text: i.line, note: i.why, where: tpls.map((t) => t.label).join(', ').slice(0, 80) }) }).catch(() => {});
  }
  const toggleTpl = (id: string) => { const has = piece.templates.includes(id); if (has && piece.templates.length === 1) return; set({ templates: has ? piece.templates.filter((x) => x !== id) : [...piece.templates, id] }); };
  const allOut = piece.templates.filter((t) => piece.out?.[t]).map((t) => `${templateById(t).label}\n${outText(templateById(t), piece.out![t])}`).join('\n\n');

  return <div className="w3-cards">
    <div className="w3-ch">
      <div className="w3-ch-row">
        <div className="w3-ch-t"><p className="mute">Piece {n}</p><p>{piece.name}</p></div>
        <div className="w3-tabs" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'ideas'} onClick={() => set({ mode: 'ideas' })}>Ideas</button>
          <button role="tab" aria-selected={mode === 'refine'} onClick={() => set({ mode: 'refine' })}>Refine</button>
        </div>
      </div>
      <div className="w2-for">
        <span className="mute">For</span>
        <div className="w2-for-strip" role="list" aria-label="Where this piece is going" onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
          {tpls.map((t) => <span key={t.id} role="listitem" className="w2-chip">{t.label}{!locked && tpls.length > 1 ? <button onClick={() => toggleTpl(t.id)} aria-label={`Remove ${t.label}`}><X size={11} aria-hidden /></button> : null}</span>)}
        </div>
        {tpls.length > 1 ? <span className="mute w2-cnt">{tpls.length}</span> : null}
        {!locked ? <button className="w2-ic sq" onClick={() => setPick(!pick)} aria-label="Add a place it’s going" title="Add a place it’s going" aria-expanded={pick}><Plus size={13} aria-hidden /></button> : null}
      </div>
      {pick ? <Places chosen={piece.templates} onToggle={toggleTpl} onDone={() => setPick(false)} /> : null}
      {mode === 'ideas' && !locked ? <div className="w2-conds">
        <label className="w2-pill"><span className="mute">Audience</span><select value={piece.audience || ''} onChange={(e) => set({ audience: e.target.value || undefined })}><option value="">Anyone</option>{audiences.map((a) => <option key={a}>{a}</option>)}</select><ChevronDown size={12} aria-hidden /></label>
        <label className="w2-pill"><span className="mute">Length</span><select value={length} onChange={(e) => set({ length: e.target.value as Length })}>{LENGTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select><ChevronDown size={12} aria-hidden /></label>
      </div> : null}
    </div>

    <div className="w3-cb">
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
      {locked ? <p className="mute w2-cards-note"><Lock size={12} aria-hidden /> Signed off. Reopen it from the piece’s ⋯ menu to change it.</p> : null}

      {mode === 'ideas' ? <>
        {busy ? [0, 1].map((k) => <div key={k} className="w3-card w3-skel" aria-busy><i /><i /><i /></div>) : null}
        {!busy && !piece.ideas?.length && !locked ? <div className="w3-empty">
          <p>Write what this piece needs to say on the page, then get three different ideas for it, each in the {brand.name} voice.</p>
          <button className="btn pink" onClick={() => ideas()}><Sparkles size={14} aria-hidden />Write 3 options</button>
        </div> : null}
        {(piece.ideas || []).map((o, k) => <article key={o.id} className={'w3-card' + (o.id === piece.idea ? ' on' : '')}>
          <div className="w3-card-h"><p className="mute">Option {k + 1}</p><span className="w3-tag">{o.angle}</span></div>
          <p className="w3-line">{o.line}</p>
          {o.tastes.map((b, j) => <p key={j} className="w3-taste"><span className="mute">{b.place} · </span>{b.text}</p>)}
          <p className="mute w3-why">{o.why}</p>
          {!locked ? <div className="w3-acts">
            <button className="btn solid" onClick={() => fit(o)}>Refine this</button>
            <button className="btn" onClick={() => ideas(o)} disabled={busy}>More like this</button>
            <button className="btn" onClick={() => copy(o.id, o.line)}>{copied === o.id ? 'Copied' : 'Copy'}</button>
            <button className={'btn w3-heart' + (o.loved ? ' on' : '')} onClick={() => love(o)} aria-pressed={!!o.loved} aria-label="Teach the Writer: we love this one" title={o.loved ? 'Added to what the Writer has learned' : 'Teach the Writer: we love this one'}><Heart size={14} strokeWidth={1.6} aria-hidden /></button>
          </div> : null}
        </article>)}
      </> : <>
        {chosen ? <p className="mute w3-from">From <strong>{chosen.angle}</strong>: “{chosen.line}”</p> : null}
        {!piece.out && !fitting.length && !locked ? <div className="w3-empty">
          <p>Fit this piece to {tpls.map((t) => t.label).join(', ')}: every part each place needs, inside its limits, in the {brand.name} voice. Refine an idea first, or fit what’s on the page.</p>
          <button className="btn solid" onClick={() => fit()}>Fit to templates</button>
        </div> : null}
        {tpls.map((t) => { const o = piece.out?.[t.id]; const wait = fitting.includes(t.id); if (!o && !wait) return null; return <article key={t.id} className="w3-card">
          <div className="w3-card-h"><p className="w3-card-l">{t.label}</p><span className={ST[piece.status][1]}>{ST[piece.status][0]}</span></div>
          {wait ? <div className="w3-skel" aria-busy><i /><i /><i /></div> : <>
            <Preview t={t} o={o!} brand={brand} />
            <p className="mute w3-counts">{counts(t, o!)}</p>
            {!locked ? <div className="w3-acts">
              <button className="btn" onClick={() => copy(t.id, outText(t, o!))}>{copied === t.id ? 'Copied' : 'Copy'}</button>
              <button className="btn" onClick={() => set({ text: piece.templates.filter((x) => piece.out?.[x]).map((x) => `${templateById(x).label}\n${outText(templateById(x), piece.out![x])}`).join('\n\n'), out: undefined })} title="Turn the fitted copy into text on the page, to edit by hand">Edit on page</button>
              <button className="btn" onClick={() => fit(chosen, t.id)}><RefreshCw size={12} aria-hidden />Another version</button>
            </div> : null}
          </>}
        </article>; })}
        {piece.out && !locked ? <div className="w3-foot">
          <span className="mute">{piece.status === 'draft' ? 'Draft: nobody’s seen it yet' : 'In review'}</span>
          <button className="btn" onClick={() => copy('all', allOut)}>{copied === 'all' ? 'Copied' : 'Copy all'}</button>
          {piece.status === 'draft' ? <button className="btn solid" onClick={() => set({ status: 'review' })}>Send this piece for approval</button> : null}
        </div> : null}
      </>}
    </div>
  </div>;
}

// Where the piece is going: every place, grouped, chosen together
function Places({ chosen, onToggle, onDone }: { chosen: string[]; onToggle: (id: string) => void; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onDone]);
  const sum = (t: WriterTemplate) => t.parts.length ? t.parts.map((p) => `${p.label}${p.count && p.count > 1 ? ` ×${p.count}` : ''}${p.limit ? ` ${p.soft ? '~' : ''}${p.limit.toLocaleString('en-GB')}${p.unit === 'words' ? 'w' : ''}` : ''}`).join(' · ') : 'Choose the parts yourself';
  return <div ref={box} className="w3-places" role="dialog" aria-label="Where it’s going">
    <div className="w3-places-h"><p>Where is this piece going? Choose one or more.</p><button className="btn solid" onClick={onDone}>Done</button></div>
    {TEMPLATE_GROUPS.map((g) => { const ts = WRITER_TEMPLATES.filter((t) => t.group === g && t.id !== 'custom'); return ts.length ? <section key={g}>
      <p className="mute w3-places-g">{g}</p>
      <div className="w3-places-grid">{ts.map((t) => { const on = chosen.includes(t.id); return <button key={t.id} className={'w3-place' + (on ? ' on' : '')} aria-pressed={on} onClick={() => onToggle(t.id)}><span><span>{t.label}</span>{on ? <Check size={13} aria-hidden /> : null}</span><span>{sum(t)}</span></button>; })}</div>
    </section> : null; })}
  </div>;
}

// ---------- How the copy will look where it's going
const len = (s: string, unit?: 'chars' | 'words') => (unit === 'words' ? s.trim().split(/\s+/).filter(Boolean).length : [...s].length);
function counts(t: WriterTemplate, o: Out) {
  return partsOf(t).filter((x) => asList(o[x.key]).length).map((x) => {
    const v = asList(o[x.key]);
    if (v.length > 1) return `${x.label} ×${v.length}${x.limit ? `, longest ${Math.max(...v.map((s) => len(s, x.unit)))}/${x.limit}` : ''}`;
    return `${x.label} ${len(v[0], x.unit).toLocaleString('en-GB')}${x.limit ? `/${x.limit.toLocaleString('en-GB')}` : ''}${x.unit === 'words' ? ' words' : ''}`;
  }).join(' · ');
}
function Preview({ t, o, brand }: { t: WriterTemplate; o: Out; brand: BrandLook }) {
  const g = (k: string) => asList(o[k]).join(' ');
  const look = { '--bd': brand.dark, '--bl': brand.light } as React.CSSProperties;
  const Av = () => brand.avatar ? <img className="w3-av" src={brand.avatar} alt="" /> : <span className="w3-av" />;
  if (t.id === 'instagram' || t.id === 'instagram-story' || t.id === 'tiktok') {
    const cap = [g('caption') || g('overlay'), g('hashtags')].filter(Boolean).join(' ');
    return <div className="w3-pv w3-ig" style={look}><div className="w3-ig-h"><Av /><span>{brand.handle}</span></div><div className="w3-ig-img">{t.id !== 'instagram' && g('overlay') ? <span>{g('overlay')}</span> : null}</div>
      <p><strong>{brand.handle}</strong> {cap.slice(0, 125)}{cap.length > 125 ? <span className="w3-more">… more</span> : null}</p></div>;
  }
  if (t.id === 'email' || t.id === 'newsletter') return <div className="w3-pv w3-mail" style={look}>
    <div className="w3-mail-h"><strong>{brand.name}</strong><span>{g('subject')}</span><span className="w3-grey">{g('preview')}</span></div>
    <div className="w3-mail-b"><span className="w3-kick">{brand.name.toUpperCase()}</span>{g('headline') ? <span className="w3-big">{g('headline')}</span> : null}<span className="w3-grey">{g('body') || g('intro')}</span>{g('cta') ? <span className="w3-btn">{g('cta')}</span> : null}</div></div>;
  if (t.id === 'hero' || t.id === 'web-page') return <div className="w3-pv w3-web" style={look}>
    <div className="w3-web-bar"><i /><i /><i /><span>{brand.handle}.com</span></div>
    <div className="w3-web-b"><span className="w3-big">{g('headline')}</span><span>{g('subheading')}</span>{g('body') ? <span className="w3-small">{g('body')}</span> : null}{g('cta') ? <span className="w3-btn inv">{g('cta')}</span> : null}</div></div>;
  if (t.id === 'sms' || t.id === 'push') return <div className="w3-pv w3-sms"><span>{t.id === 'push' ? <><strong>{g('title')}</strong><br /></> : null}{g('message') || g('body')}</span></div>;
  if (t.id === 'poster') return <div className="w3-pv w3-wall" style={look}><div className="w3-poster"><span className="w3-kick">{brand.name.toUpperCase()}</span><div><p className="w3-big">{g('headline')}</p><p>{g('line')}</p></div></div></div>;
  if (t.id === 'signage') return <div className="w3-pv w3-wall" style={look}><div className="w3-sign"><span>{g('sign')}</span><span>↓</span></div>{g('detail') ? <p className="w3-sign-d">{g('detail')}</p> : null}</div>;
  if (t.id === 'video-script') return <div className="w3-pv w3-script">{asList(o.scenes).map((sc, k) => { const [shot, words] = sc.split('|').map((x) => x.trim()); return <div key={k}><span className="mute">{k + 1}</span><i /><span><span>{shot}</span>{words ? <span className="mute">{words}</span> : null}</span></div>; })}</div>;
  // Everything else: each part, as it'll be pasted
  return <div className="w3-pv w3-text">{partsOf(t).filter((x) => asList(o[x.key]).length).map((x) => <div key={x.key}><span className="mute">{x.label}</span>{asList(o[x.key]).map((v, k) => <p key={k}>{v}</p>)}</div>)}</div>;
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
