'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Brain, Check, ChevronDown, Layers, Copy, Heart, Loader2, Lock, MessageSquare, MessageSquarePlus, MoreHorizontal, Plus, Redo2, RefreshCw, Search, ShieldCheck, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { TEMPLATE_GROUPS, WRITER_TEMPLATES, templateById, type WriterPart, type WriterTemplate } from '@/lib/writerTemplates';
import { KIND_LABEL, type KnowledgeEntry } from '@/lib/voiceKnowledge';
import { FactButton } from '@/components/portal/v2/FactSheet';
import { BlockCanvas, blocksOf, contextFor, type Block } from '@/components/portal/v2/WriterBlocks';

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
  ideas?: Idea[]; idea?: string; out?: Record<string, Out>; mode?: 'ideas' | 'refine'; length?: Length; audience?: string;
  owner?: string; reviewer?: string; due?: string; tags?: string[]; links?: Link[]; comments?: Comment[]; history?: Event[] };
/** A person on the project, for owners, reviewers and hand-offs */
export type Person = { id: string; name: string; org: string; studio: boolean };
/** A file in another app (or another doc) that a piece is linked to */
export type Link = { app: 'writer' | 'director' | 'designer' | 'photographer'; id: string; title: string };
/** A comment on a piece, maybe on some of its words. The Writer leaves its own when it checks the voice. */
export type Comment = { id: string; by: string; byId?: string; writer?: boolean; kind?: 'changes'; quote?: string; text: string; rule?: string; fix?: string; at: string; replies?: { by: string; text: string; at: string }[]; resolved?: boolean };
/** What happened to a piece, and who did it */
export type Event = { at: string; by: string; what: string };
type OptProp = 'reviewers' | 'tags' | 'audience' | 'region' | 'brief';
/** The doc's details. Campaign, owner and due date always show; the rest once they're added with + Property */
export type DocProps = { campaign?: string; owner?: string; due?: string; reviewers?: string[]; tags?: string[]; audience?: string; region?: string; brief?: string; show?: OptProp[] };
export type DocData = { intro?: string; tone?: number; props?: DocProps; pieces: Piece[]; blocks?: Block[] };
/** The client's look, for previews of where the copy is going */
export type BrandLook = { name: string; handle: string; dark: string; light: string; avatar: string | null };
type FileRow = { id: string; title: string; status: Status; data: DocData; updated_at: string };

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
/** True on a phone-width screen: the Writer becomes one column, with the cards in a sheet that slides up */
function useNarrow() {
  const [n, setN] = useState(false);
  useEffect(() => { const q = matchMedia('(max-width: 760px)'); const f = () => setN(q.matches); f(); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []);
  return n;
}
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

export function WriterApp({ slug, client, audiences, me, note, brand, facts = false }: { facts?: boolean; slug: string; client: string; audiences: string[]; me: string; note?: string; brand: BrandLook }) {
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

  if (open && deliver) return <Delivery file={open} client={client} brand={brand} onBack={() => go(open.id, false)} />;
  if (open) return <DocEditor facts={facts} key={open.id} slug={slug} client={client} audiences={audiences} me={me} brand={brand} file={open} onBack={() => go(null)} onDeliver={() => go(open.id, true)} />;

  const create = async () => {
    try { const { id } = await A.create('Untitled doc', { intro: '', pieces: [newPiece('First piece')] }); go(id); } catch (e) { setErr((e as Error).message); }
  };
  return <Browser slug={slug} facts={facts} files={files} err={err} note={note} onOpen={(id) => go(id)} onNew={create} onDelete={async (f) => { if (!confirm(`Delete “${f.title}”? This can’t be undone.`)) return; await A.remove(f.id).catch(() => {}); refresh(); }} />;
}

// ---------- Docs: the first screen
function Browser({ slug, facts, files, err, note, onOpen, onNew, onDelete }: { slug: string; facts: boolean; files: FileRow[] | null; err: string; note?: string; onOpen: (id: string) => void; onNew: () => void; onDelete: (f: FileRow) => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const list = (files || []).filter((f) => (filter === 'all' || f.status === filter) && (!q || f.title.toLowerCase().includes(q.toLowerCase())));
  return <div className="fb">
    <header className="fb-top">
      <AppIcon app="writer" size={18} play /><strong>Writer</strong><span className="mute fb-crumb">/</span><span className="fb-crumb">Docs</span>
      <span className="fb-sp" />
      <label className="fb-search"><Search {...I} /><span className="sr">Search docs</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs" /></label>
      {facts ? <FactButton slug={slug} /> : null}
      <button className="btn solid fb-newb" onClick={onNew} aria-label="New doc"><Plus {...I} /><span>New doc</span></button>
    </header>
    <div className="fb-body">
      {note ? <p className="wr-note-studio" role="note">{note}</p> : null}
      <label className="fb-search fb-search-m"><Search {...I} /><span className="sr">Search docs</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search docs" /></label>
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
              <span className="fb-meta"><span className={ST[f.status][1]}>{ST[f.status][0]}</span><span className="mute">{f.data?.pieces?.length || 0} piece{f.data?.pieces?.length === 1 ? '' : 's'} · {f.data?.props?.due ? `Due ${fmtDay(f.data.props.due)}` : ago(f.updated_at)}</span></span>
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

function DocEditor({ slug, client, audiences, me, brand, file, onBack, onDeliver, facts }: { facts: boolean; slug: string; client: string; audiences: string[]; me: string; brand: BrandLook; file: FileRow; onBack: () => void; onDeliver: () => void }) {
  const A = useMemo(() => api(slug), [slug]);
  const [title, setTitle] = useState(file.title);
  const [doc, setDoc] = useState<DocData>(file.data);
  const [active, setActive] = useState(file.data.pieces[0]?.id || '');
  const [saved, setSaved] = useState<'saved' | 'saving' | 'error'>('saved');
  const [cardsW, setCardsW] = useState(380);
  const [cmd, setCmd] = useState<Cmd>({ kind: 'ideas', n: 0 });
  const [know, setKnow] = useState(false);
  const { people, me: myId } = usePeople(slug);
  const [sending, setSending] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [checking, setChecking] = useState('');
  const [flash, setFlash] = useState('');
  const narrow = useNarrow();
  const [sheet, setSheet] = useState(false);
  const [more, setMore] = useState(false);
  const say = (t: string) => { setFlash(t); setTimeout(() => setFlash(''), 3500); };
  const first = useRef(true);
  // Saves a moment after the last change
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = setTimeout(() => { A.save(file.id, { title: title.trim() || 'Untitled doc', data: doc, status: docStatus(doc) }).then(() => setSaved('saved')).catch(() => setSaved('error')); }, 700);
    return () => clearTimeout(t);
  }, [doc, title, A, file.id]);
  const setPiece = (id: string, p: Partial<Piece>) => setDoc((d) => ({ ...d, pieces: d.pieces.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  const addPiece = () => { const p = newPiece(); setDoc((d) => ({ ...d, pieces: [...d.pieces, p] })); setActive(p.id); return p.id; };
  // The page is blocks (WriterBlocks); pieces are one kind of block, and older docs open with one block per piece
  const blocks = useMemo(() => blocksOf(doc.blocks, doc.pieces), [doc.blocks, doc.pieces]);
  const setBlocks = useCallback((fn: (b: Block[]) => Block[]) => setDoc((d) => ({ ...d, blocks: fn(blocksOf(d.blocks, d.pieces)) })), []);
  const outline = blocks.filter((b) => b.type === 'h1' || b.type === 'h2' || b.type === 'piece');
  const jump = (id: string) => document.querySelector(`[data-block="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const delPiece = (id: string) => { if (!confirm('Delete this piece?')) return; setDoc((d) => ({ ...d, pieces: d.pieces.filter((x) => x.id !== id) })); };
  const piece = doc.pieces.find((p) => p.id === active) || doc.pieces[0];
  const pi = piece ? doc.pieces.indexOf(piece) : -1;
  const signed = doc.pieces.filter((p) => p.status === 'signed').length;
  const ready = doc.pieces.filter((p) => p.status === 'draft' && (p.text.trim() || p.out));
  const tone = doc.tone ?? 70;
  const resize = (e: React.MouseEvent) => { e.preventDefault(); const x0 = e.clientX, w0 = cardsW; const mv = (m: MouseEvent) => setCardsW(Math.max(320, Math.min(600, w0 - (m.clientX - x0)))); const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); };
  const ex = (c: string) => (e: React.MouseEvent) => { e.preventDefault(); document.execCommand(c); };
  const openComments = doc.pieces.reduce((n, p) => n + (p.comments || []).filter((c) => !c.resolved).length, 0);
  // Send for approval: every piece that's written goes to one person, with one note and one email
  const sendAll = async (to: string, msg: string) => {
    const names = ready.map((p) => p.name); const who = people.find((x) => x.id === to)?.name || 'them';
    setDoc((d) => ({ ...d, pieces: d.pieces.map((p) => (ready.some((r) => r.id === p.id) ? { ...p, status: 'review', reviewer: to, history: [...(p.history || []), note(me, `Sent to ${who} for approval${msg ? `: “${msg}”` : ''}`)] } : p)) }));
    setSending(false);
    say((await notify(slug, file.id, { to, kind: 'handoff', pieces: names, note: msg || undefined })) ? `Sent to ${who}. They’ll get an email.` : `Sent to ${who}. No email went (email isn’t set up here), so let them know.`);
  };
  // The Writer reads the piece against the voice and leaves a comment on anything off brand, with a fix
  async function checkVoice(p: Piece) {
    const text = allText(p).trim(); if (!text) { say('Write something in this piece first.'); return; }
    setChecking(p.id);
    const tpls = p.templates.map(templateById);
    const r = await fetch(`/api/p/${slug}/writer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'review', brief: text, template: tpls.map((t) => t.label).join(' + '), parts: tpls.flatMap(partsOf).slice(0, 8), tone }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setChecking('');
    if (!r?.ok) { say(j.error || 'The check didn’t work. Try again.'); return; }
    const notes = (j.review?.notes || []) as { kind: 'good' | 'fix'; quote?: string; rule?: string; note: string; fix?: string }[];
    const fixes = notes.filter((n) => n.kind === 'fix');
    const at = new Date().toISOString();
    const add: Comment[] = fixes.length ? fixes.map((n) => ({ id: uid(), by: 'Writer', writer: true, quote: n.quote, rule: n.rule, text: n.note, fix: n.fix, at }))
      : [{ id: uid(), by: 'Writer', writer: true, text: j.review?.summary || 'Reads on brand. Nothing to change.', at, resolved: false }];
    setPiece(p.id, { comments: [...(p.comments || []).filter((c) => !(c.writer && !c.resolved)), ...add] });
    say(fixes.length ? `${fixes.length} thing${fixes.length === 1 ? '' : 's'} to look at, marked on the piece.` : 'On brand. Nothing to change.');
  }

  return <div className="w2">
    <header className="w2-top">
      <button className="w2-ic" onClick={onBack} aria-label="Back to Docs" title="Back to Docs"><ArrowLeft {...I} /></button>
      <AppIcon app="writer" size={18} play /><button className="w2-crumb" onClick={onBack}>Writer</button><span className="mute">/</span>
      <input className="w2-title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Doc name" />
      <span className={ST[docStatus(doc)][1] + ' w2-hide-m'}>{ST[docStatus(doc)][0]}</span>
      <span className="mute w2-saved w2-hide-m" role="status">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span>
      <span className="fb-sp" />
      {narrow ? <span className="w3-know-wrap"><button className="w2-ic" onClick={() => setMore(!more)} aria-expanded={more} aria-label="More" title="More"><MoreHorizontal {...I} />{openComments ? <i className="w2-dot" /> : null}</button>
        {more ? <><div className="w2-scrim" onClick={() => setMore(false)} /><div className="w2-menu w2-more" role="menu">
          <div className="w2-kv"><span className="mute">Status</span><span><span className={ST[docStatus(doc)][1]}>{ST[docStatus(doc)][0]}</span> <span className="mute">{saved === 'saving' ? 'Saving…' : saved === 'error' ? 'Not saved' : 'Saved'}</span></span></div>
          <hr />
          {facts ? <FactButton slug={slug} asItem /> : null}
          <button role="menuitem" onClick={() => { setMore(false); setKnow(true); }}><Brain {...I} />Writer’s knowledge</button>
          <button role="menuitem" onClick={() => { setShowDone(!showDone); }}><MessageSquare {...I} />{showDone ? 'Hide resolved comments' : 'Show resolved comments'}{openComments ? <span className="mute"> · {openComments} open</span> : null}</button>
          <button role="menuitem" disabled={!ready.length} onClick={() => { setMore(false); setSending(true); }}><Sparkles {...I} />Send {ready.length || ''} for approval</button>
        </div></>: null}
        {know ? <><div className="w2-scrim" onClick={() => setKnow(false)} /><Knowledge slug={slug} client={client} onClose={() => setKnow(false)} /></> : null}
        {sending ? <><div className="w2-scrim" onClick={() => setSending(false)} /><div className="w3-know w3-send"><HandOff people={people} myId={myId} title={`Send ${ready.length} piece${ready.length === 1 ? '' : 's'} for approval`} onSend={sendAll} onCancel={() => setSending(false)} /></div></> : null}
      </span> : <>
      <Faces people={people} ids={[doc.props?.owner, ...(doc.props?.reviewers || [])]} />
      <span className="w3-know-wrap"><button className="w2-ic" onClick={() => setKnow(!know)} aria-expanded={know} aria-label="Writer’s knowledge" title="Writer’s knowledge"><Brain {...I} /></button>
        {know ? <Knowledge slug={slug} client={client} onClose={() => setKnow(false)} /> : null}</span>
      {facts ? <FactButton slug={slug} /> : null}
      <button className={'w2-ic w3-cm' + (showDone ? ' on' : '')} onClick={() => setShowDone(!showDone)} aria-pressed={showDone} aria-label={showDone ? 'Hide resolved comments' : 'Show resolved comments too'} title={`${openComments} open comment${openComments === 1 ? '' : 's'} · ${showDone ? 'hide' : 'show'} resolved`}><MessageSquare {...I} />{openComments ? <i>{openComments}</i> : null}</button>
      <span className="w3-know-wrap"><button className="btn" onClick={() => setSending(!sending)} disabled={!ready.length} title={ready.length ? `Send ${ready.length} piece${ready.length === 1 ? '' : 's'} to someone to approve` : 'Write a piece first'}>Send for approval</button>
        {sending ? <div className="w3-know w3-send"><HandOff people={people} myId={myId} title={`Send ${ready.length} piece${ready.length === 1 ? '' : 's'} for approval`} onSend={sendAll} onCancel={() => setSending(false)} /></div> : null}</span></>}
      <button className="btn solid" onClick={onDeliver} disabled={!signed} title={signed ? 'The signed-off text, ready to copy and share' : 'Sign off a piece first'}>Deliver{signed ? ` · ${signed}` : ''}</button>
    </header>
    {narrow ? <nav className="w2-strip" aria-label="Pieces">{doc.pieces.map((p, i) => <button key={p.id} className={'w2-sp' + (p.id === piece?.id ? ' on' : '')} onClick={() => { setActive(p.id); document.getElementById(`pc-${p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
      <span className="mute">{i + 1}</span>{p.name}{p.status === 'signed' ? <Check size={11} aria-hidden /> : p.status === 'review' ? <i className="w2-sp-dot" /> : null}</button>)}
      <button className="w2-sp add" onClick={addPiece} aria-label="New piece"><Plus size={13} aria-hidden /></button></nav> : null}
    <div className="w2-body" style={narrow ? undefined : { gridTemplateColumns: `240px minmax(0, 1fr) ${cardsW}px` }}>
      <aside className="w2-side" aria-label="Pieces">
        <div className="w2-side-h"><strong>On this page</strong><span className="mute">{doc.pieces.length} piece{doc.pieces.length === 1 ? '' : 's'}</span></div>
        <a className="w3-voice" href={`/p/${slug}/guidelines`}><BookOpen size={14} strokeWidth={1.6} aria-hidden /><span>Voice from Guidelines</span><span className="w3-tag ok">In sync</span></a>
        <div className="w2-list">{outline.map((o) => { if (o.type !== 'piece') return o.text?.trim() ? <button key={o.id} className={'w2-row w2-oh ' + o.type} onClick={() => jump(o.id)}><span className="w2-row-t"><span>{o.text}</span></span></button> : null;
          const p = doc.pieces.find((x) => x.id === o.pieceId); if (!p) return null; const i = doc.pieces.indexOf(p);
          return <button key={p.id} className={'w2-row' + (p.id === piece?.id ? ' on' : '')} onClick={() => { setActive(p.id); jump(o.id); }}>
          <span className="mute w2-n">{i + 1}</span><span className="w2-row-t"><span>{p.name}</span><span className="mute">{p.out ? `${Object.keys(p.out).length} place${Object.keys(p.out).length === 1 ? '' : 's'} fitted` : p.text.trim() ? `${p.text.trim().split(/\s+/).length} words` : 'Empty'} · {p.templates.map((t) => templateById(t).label.split(' ')[0]).join(', ')}</span></span>
          <span className={ST[p.status][1]}>{p.status === 'signed' ? <Check size={11} aria-hidden /> : ST[p.status][0]}</span></button>; })}
          <button className="w2-add" onClick={addPiece}><Plus size={14} aria-hidden />New piece</button>
        </div>
      </aside>
      <section className="w2-doc" aria-label="The doc">
        <div className="w2-tb" role="toolbar" aria-label="Writing">
          <button onMouseDown={ex('undo')} aria-label="Undo" title="Undo ⌘Z"><Undo2 {...I} /></button><button onMouseDown={ex('redo')} aria-label="Redo" title="Redo ⇧⌘Z"><Redo2 {...I} /></button><span className="w2-sep" />
          <label className="w3-tone"><span className="sr">Tone</span><select value={tone} onChange={(e) => setDoc((d) => ({ ...d, tone: Number(e.target.value) }))}>{TONES.map(([v, l]) => <option key={v} value={v}>Tone: {l}</option>)}</select><ChevronDown size={12} aria-hidden /></label>
          <span className="w2-sep" /><button onClick={() => { const id = addPiece(); setTimeout(() => document.getElementById(`pc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); }}><Plus {...I} />Piece</button><span className="w2-sep" /><span className="mute w2-tb-note">Plain text, so it pastes cleanly anywhere</span>
        </div>
        <article className="w2-page">
          <p className="w2-kick"><AppIcon app="writer" size={14} />{client}<span>·</span>{doc.pieces.length} piece{doc.pieces.length === 1 ? '' : 's'}<span>·</span>{signed} signed off</p>
          <input className="w2-h1" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Doc name" />
          <textarea className="w2-intro" value={doc.intro || ''} onChange={(e) => setDoc((d) => ({ ...d, intro: e.target.value }))} placeholder="What’s this doc for? A line or two about the campaign or project." rows={2} />
          <DocDetails props={doc.props || {}} people={people} audiences={audiences} signed={signed} total={doc.pieces.length} set={(x) => setDoc((d) => ({ ...d, props: { ...(d.props || {}), ...x } }))} />
          <BlockCanvas blocks={blocks} setBlocks={setBlocks} slug={slug} facts={facts} addPiece={addPiece} removePiece={(id) => setDoc((d) => ({ ...d, pieces: d.pieces.filter((x) => x.id !== id) }))}
            renderPiece={(id, n) => { const p = doc.pieces.find((x) => x.id === id); return p ? <PieceBlock n={n} p={p} on={p.id === piece?.id} me={me} myId={myId} showDone={showDone} say={say} slug={slug} docId={file.id} people={people} onFocus={() => setActive(p.id)} set={(x) => setPiece(p.id, x)} onDelete={() => delPiece(p.id)} /> : null; }} />
        </article>
        <div className="w3-dock">
        {flash ? <p className="w3-flash" role="status">{flash}</p> : null}
        {piece && piece.status !== 'signed' ? <div className="w3-bar">
          <span className="w3-bar-n">{piece.name}</span>
          <button className="btn pink" onClick={() => { setCmd({ kind: 'ideas', n: cmd.n + 1 }); if (narrow) setSheet(true); }}><Sparkles size={14} aria-hidden />{narrow ? 'Write' : 'Write 3 options'}</button>
          <button className="btn" onClick={() => { setCmd({ kind: 'fit', n: cmd.n + 1 }); if (narrow) setSheet(true); }}>{narrow ? 'Fit' : 'Fit to templates'}</button>
          <button className="btn" onClick={() => checkVoice(piece)} disabled={!!checking} title="The Writer reads it against the voice and comments on anything off brand">{checking ? <Loader2 size={14} className="spin" aria-hidden /> : <ShieldCheck size={14} aria-hidden />}{narrow ? 'Check' : 'Check voice'}</button>
          {narrow ? <button className="btn w3-optb" onClick={() => setSheet(true)} aria-label="Options and places"><Layers size={14} aria-hidden />{piece.ideas?.length || (piece.out ? Object.keys(piece.out).length : 0) || ''}</button> : null}
        </div> : narrow && piece ? <div className="w3-bar"><span className="w3-bar-n">{piece.name}</span><button className="btn" onClick={() => setSheet(true)}><Layers size={14} aria-hidden />Options and places</button></div> : null}
        </div>
      </section>
      {narrow && sheet ? <div className="w2-scrim sheet" onClick={() => setSheet(false)} /> : null}
      <aside className={'w2-cards' + (narrow ? ' sheet' + (sheet ? ' open' : '') : '')} aria-label="Cards for this piece" aria-hidden={narrow && !sheet ? true : undefined}>
        {narrow ? <div className="w2-sheet-h"><span className="w2-grab" /><button className="w2-ic" onClick={() => setSheet(false)} aria-label="Close"><X {...I} /></button></div>
          : <span className="w2-grip" role="separator" aria-orientation="vertical" aria-label="Resize" onMouseDown={resize}><i /></span>}
        {piece ? <Cards key={piece.id} slug={slug} audiences={audiences} brand={brand} n={pi + 1} piece={piece} intro={[doc.intro || '', contextFor(blocks, piece.id)].filter((x) => x.trim()).join('\n')} tone={tone} cmd={cmd} set={(x) => setPiece(piece.id, x)} /> : <p className="mute" style={{ padding: 16 }}>Add a piece to start.</p>}
      </aside>
    </div>
  </div>;
}

function PieceBlock({ n, p, on, me, myId, showDone, say, slug, docId, people, onFocus, set, onDelete }: { n: number; p: Piece; on: boolean; me: string; myId: string; showDone: boolean; say: (t: string) => void; slug: string; docId: string; people: Person[]; onFocus: () => void; set: (x: Partial<Piece>) => void; onDelete: () => void }) {
  const [box, setBox] = useState<null | 'handoff' | 'comment' | 'changes'>(null);
  const sel = useRef('');
  const nameOfId = (id?: string) => people.find((x) => x.id === id)?.name;
  const log = (what: string) => [...(p.history || []), note(me, what)];
  const comments = (p.comments || []).filter((c) => showDone || !c.resolved);
  const setC = (id: string, x: Partial<Comment>) => set({ comments: (p.comments || []).map((c) => (c.id === id ? { ...c, ...x } : c)) });
  const handOff = async (to: string, msg: string) => {
    const who = nameOfId(to) || 'them'; setBox(null);
    set({ status: 'review', reviewer: to, history: log(`Handed to ${who}${msg ? `: “${msg}”` : ''}`) });
    say((await notify(slug, docId, { to, kind: 'handoff', pieces: [p.name], note: msg || undefined })) ? `Sent to ${who}. They’ll get an email.` : `Sent to ${who}. No email went (email isn’t set up here), so let them know.`);
  };
  const signOff = () => { set({ status: 'signed', signedBy: me, signedAt: new Date().toISOString(), history: log('Signed off') }); if (p.owner && p.owner !== myId) notify(slug, docId, { to: p.owner, kind: 'signed', pieces: [p.name] }); };
  const askChanges = (t: string) => { setBox(null); set({ status: 'draft', comments: [...(p.comments || []), { id: uid(), by: me, byId: myId, kind: 'changes', text: t, at: new Date().toISOString() }], history: log('Asked for changes') }); if (p.owner && p.owner !== myId) notify(slug, docId, { to: p.owner, kind: 'changes', pieces: [p.name], note: t }); };
  const comment = (t: string) => { setBox(null); set({ comments: [...(p.comments || []), { id: uid(), by: me, byId: myId, quote: sel.current || undefined, text: t, at: new Date().toISOString() }] }); sel.current = ''; };
  const [menu, setMenu] = useState(false);
  const [linking, setLinking] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // The ⋯ menu holds pickers, so it closes on a click elsewhere rather than when the pointer leaves it
  useEffect(() => { if (!menu) return; const c = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.parentElement!.contains(e.target as Node)) setMenu(false); }; addEventListener('mousedown', c); return () => removeEventListener('mousedown', c); }, [menu]);
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
      {p.status !== 'signed' ? <button className="w2-ic" onClick={(e) => { e.stopPropagation(); setBox(box === 'comment' ? null : 'comment'); }} aria-label="Comment" title="Comment (select words first to comment on them)"><MessageSquarePlus {...I} /></button> : null}
      {p.status === 'draft' ? <><span className={ST.draft[1]}>Draft</span><button className="btn sm" onClick={(e) => { e.stopPropagation(); setBox('handoff'); }} disabled={!p.text.trim() && !p.out}>Request review</button></> : null}
      {p.status === 'review' ? <><span className={ST.review[1]}>{nameOfId(p.reviewer) ? <><Face p={people.find((x) => x.id === p.reviewer)} size={14} />With {nameOfId(p.reviewer)!.split(' ')[0]}</> : 'In review'}</span><button className="btn sm" onClick={(e) => { e.stopPropagation(); setBox('changes'); }}>Request changes</button><button className="btn sm solid" onClick={signOff}>Sign off</button></> : null}
      {p.status === 'signed' ? <span className="w2-lock"><Lock size={12} aria-hidden />Signed off</span> : null}
      <span className="w2-menu-wrap">
        <button className="w2-ic" onClick={(e) => { e.stopPropagation(); setMenu(!menu); }} aria-label="Piece details and actions" aria-expanded={menu}><MoreHorizontal {...I} /></button>
        {menu ? <div className="w2-menu" role="menu" ref={menuRef}>
          <div className="w2-kv"><span className="mute">For</span><span>{places}</span></div>
          <div className="w2-kv"><span className="mute">Written by</span><PersonPick people={people} value={p.owner} onPick={(id) => set({ owner: id })} placeholder="Choose" /></div>
          <div className="w2-kv"><span className="mute">Reviewer</span><PersonPick people={people} value={p.reviewer} onPick={(id) => set({ reviewer: id })} placeholder="Choose" /></div>
          <div className="w2-kv"><span className="mute">Due</span><input type="date" className="w3-date" value={p.due || ''} onChange={(e) => set({ due: e.target.value || undefined })} /></div>
          <div className="w2-kv"><span className="mute">Tags</span><Tags tags={p.tags || []} set={(tags) => set({ tags })} /></div>
          {p.signedBy ? <div className="w2-kv"><span className="mute">Signed off</span><span>{p.signedBy} · {new Date(p.signedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></div> : null}
          <hr />
          {p.status === 'draft' ? <button role="menuitem" onClick={() => { setMenu(false); setBox('handoff'); }}>Hand off to…</button> : null}
          {p.status === 'review' ? <button role="menuitem" onClick={() => { setMenu(false); setBox('changes'); }}>Request changes</button> : null}
          {p.status === 'signed' ? <><button role="menuitem" onClick={() => copy('all', bits.map((b) => b.text).join('\n\n'))}>Copy all text</button><button role="menuitem" onClick={() => { set({ status: 'draft', signedBy: undefined, signedAt: undefined }); setMenu(false); }}>Reopen for edits</button></> : null}
          <button role="menuitem" onClick={() => { setMenu(false); setLinking(true); }}>Link a file…</button>
          {p.history?.length ? <><hr /><div className="w3-hist">{p.history.slice(-6).reverse().map((h, k) => <p key={k}><span>{h.what}</span><span className="mute">{h.by} · {when(h.at)}</span></p>)}</div><hr /></> : null}
          <button role="menuitem" className="danger" onClick={() => { setMenu(false); onDelete(); }}>Delete piece</button>
        </div> : null}
      </span>
    </div>
    {box === 'handoff' ? <HandOff people={people} myId={myId} title="Hand off for review" onSend={handOff} onCancel={() => setBox(null)} /> : null}
    {box === 'changes' ? <NoteBox label="What needs to change?" cta="Send back" onSend={askChanges} onCancel={() => setBox(null)} /> : null}
    {box === 'comment' ? <NoteBox label="Comment" quote={sel.current || undefined} cta="Comment" onSend={comment} onCancel={() => setBox(null)} /> : null}
    {p.links?.length || linking ? <Links slug={slug} docId={docId} links={p.links || []} adding={linking} onDone={() => setLinking(false)} set={(links) => set({ links })} /> : null}
    {p.status === 'signed'
      ? <div className="w2-bits">{bits.length ? bits.map((b, k) => <div key={k} className="w2-bit"><div className="w2-bit-h"><span>{b.label}</span><button className="btn sm" onClick={() => copy(String(k), b.text)}><Copy size={12} aria-hidden />{copied === String(k) ? 'Copied' : 'Copy'}</button></div><p>{b.text}</p></div>) : <p className="mute">Nothing written in this piece.</p>}</div>
      : fitted.length
        ? <div className="w2-bits" onMouseUp={() => { sel.current = (getSelection()?.toString() || '').trim().slice(0, 300); }}>{fitted.map((id) => { const t = templateById(id); return <div key={id} className="w2-bit"><div className="w2-bit-h"><span>{t.label}</span><button className="btn sm" onClick={(e) => { e.stopPropagation(); set({ text: fitted.map((x) => `${templateById(x).label}\n${outText(templateById(x), p.out![x])}`).join('\n\n'), out: undefined }); }}>Edit as text</button></div>
            {partsOf(t).filter((x) => asList(p.out![id][x.key]).length).map((x) => <p key={x.key}><span className="mute w3-pl">{x.label} · </span>{asList(p.out![id][x.key]).join('\n')}</p>)}</div>; })}</div>
        : <textarea className="w2-text" value={p.text} onSelect={(e) => { const t = e.currentTarget; sel.current = t.value.slice(t.selectionStart, t.selectionEnd).trim().slice(0, 300); }} onChange={(e) => set({ text: e.target.value, parts: undefined })} placeholder="Write here, or a brief: what does this piece need to say? Then Write 3 options, or Fit to templates." rows={Math.max(3, p.text.split('\n').length + 1)} />}
    {comments.length ? <div className="w3-ths">{comments.map((c) => <Thread key={c.id} c={c} me={me} writerIcon={!!c.writer} canApply={!!c.quote && !!c.fix && !!applyFix(p, c.quote, c.fix)}
      onApply={c.writer && c.quote && c.fix && p.status !== 'signed' ? () => { const x = applyFix(p, c.quote!, c.fix!); if (x) set({ ...x, comments: (p.comments || []).map((y) => (y.id === c.id ? { ...y, resolved: true } : y)) }); } : undefined}
      onReply={(t) => setC(c.id, { replies: [...(c.replies || []), { by: me, text: t, at: new Date().toISOString() }] })} onResolve={() => setC(c.id, { resolved: true })} />)}</div> : null}
  </div>;
}

// ---------- Review: hand-offs, comments on lines, the Writer's voice check, and a record of what happened
const when = (iso: string) => { const d = new Date(iso); return Date.now() - d.getTime() < 864e5 ? ago(iso) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const note = (by: string, what: string): Event => ({ at: new Date().toISOString(), by, what });
const allText = (p: Piece) => (p.out ? p.templates.filter((t) => p.out![t]).map((t) => outText(templateById(t), p.out![t])).join('\n\n') : p.text);
/** Puts the fix in place of the quoted words, wherever they are in the piece */
function applyFix(p: Piece, quote: string, fix: string): Partial<Piece> | null {
  if (p.out) {
    let hit = false;
    const out = Object.fromEntries(Object.entries(p.out).map(([k, o]) => [k, Object.fromEntries(Object.entries(o).map(([pk, v]) => [pk, Array.isArray(v) ? v.map((x) => { if (x.includes(quote)) { hit = true; return x.replace(quote, fix); } return x; }) : (v.includes(quote) ? (hit = true, v.replace(quote, fix)) : v)]))]));
    return hit ? { out } : null;
  }
  return p.text.includes(quote) ? { text: p.text.replace(quote, fix) } : null;
}
function notify(slug: string, docId: string, body: { to: string; kind: 'handoff' | 'changes' | 'signed'; pieces: string[]; note?: string }) {
  return fetch(`/api/p/${slug}/apps/writer/${docId}/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).then((j) => !!j.emailed).catch(() => false);
}

/** Hand off to a named person, with a note: who should look at it next */
function HandOff({ people, myId, title, onSend, onCancel }: { people: Person[]; myId: string; title: string; onSend: (to: string, note: string) => void; onCancel: () => void }) {
  const [to, setTo] = useState<string | undefined>();
  const [msg, setMsg] = useState('');
  const others = people.filter((p) => p.id !== myId);
  return <div className="w3-box" onClick={(e) => e.stopPropagation()}>
    <p className="w3-box-h"><strong>{title}</strong><button className="w2-ic" onClick={onCancel} aria-label="Cancel"><X size={13} aria-hidden /></button></p>
    <div className="w3-who">{others.length ? others.map((p) => <button key={p.id} className={'w3-who-b' + (to === p.id ? ' on' : '')} aria-pressed={to === p.id} onClick={() => setTo(p.id)}><Face p={p} size={22} /><span><span>{p.name}</span><span className="mute">{p.org}</span></span></button>)
      : <p className="mute">Nobody else is on this project yet. Invite the team from Settings.</p>}</div>
    <textarea className="w3-note" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Add a note (optional): what should they look at?" rows={2} />
    <div className="w3-box-a"><span className="mute">They’ll get an email with a link.</span><button className="btn solid" disabled={!to} onClick={() => to && onSend(to, msg.trim())}>Send</button></div>
  </div>;
}

/** A note box: a comment, a reply, or what needs to change */
function NoteBox({ label, quote, cta, onSend, onCancel }: { label: string; quote?: string; cta: string; onSend: (text: string) => void; onCancel: () => void }) {
  const [t, setT] = useState('');
  return <div className="w3-box" onClick={(e) => e.stopPropagation()}>
    <p className="w3-box-h"><strong>{label}</strong><button className="w2-ic" onClick={onCancel} aria-label="Cancel"><X size={13} aria-hidden /></button></p>
    {quote ? <p className="w3-quote">“{quote}”</p> : null}
    <textarea className="w3-note" autoFocus value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && t.trim()) onSend(t.trim()); }} rows={2} placeholder="Write a note…" />
    <div className="w3-box-a"><span className="mute">⌘↵ to send</span><button className="btn solid" disabled={!t.trim()} onClick={() => onSend(t.trim())}>{cta}</button></div>
  </div>;
}

function Thread({ c, me, writerIcon, onReply, onResolve, onApply, canApply }: { c: Comment; me: string; writerIcon: boolean; onReply: (t: string) => void; onResolve: () => void; onApply?: () => void; canApply: boolean }) {
  const [r, setR] = useState('');
  return <div className={'w3-th' + (c.resolved ? ' done' : '') + (c.writer ? ' wr' : '') + (c.kind === 'changes' ? ' ch' : '')} onClick={(e) => e.stopPropagation()}>
    <div className="w3-th-h">{writerIcon ? <span className="w3-th-wi"><AppIcon app="writer" size={12} still /></span> : <span className="w3-face" style={{ width: 20, height: 20, fontSize: 8.5, background: faceOf(c.byId || c.by) }}>{initials(c.by)}</span>}
      <strong>{c.by}</strong><span className="mute">{c.writer ? `Brand voice${c.rule ? ` · ${c.rule}` : ''}` : c.kind === 'changes' ? 'Asked for changes' : when(c.at)}</span>
      <span className="fb-sp" />{c.resolved ? <span className="mute"><Check size={11} aria-hidden /> Resolved</span> : <button className="btn sm" onClick={onResolve}>{c.writer ? 'Dismiss' : 'Resolve'}</button>}</div>
    {c.quote ? <p className="w3-quote">“{c.quote}”</p> : null}
    <p className="w3-th-t">{c.text}</p>
    {c.fix && !c.resolved ? <div className="w3-fix"><span className="mute">Try</span><span>{c.fix}</span>{onApply ? <button className="btn sm solid" onClick={onApply} disabled={!canApply} title={canApply ? 'Put this in place of the quoted words' : 'Those words have changed since the check'}>Apply</button> : null}</div> : null}
    {(c.replies || []).map((x, k) => <p key={k} className="w3-th-r"><strong>{x.by}</strong> {x.text} <span className="mute">· {when(x.at)}</span></p>)}
    {!c.resolved && !c.writer ? <input className="w3-th-in" value={r} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && r.trim()) { onReply(r.trim()); setR(''); } }} placeholder={`Reply as ${me.split(' ')[0]}…`} /> : null}
  </div>;
}

// ---------- Doc details: campaign, owner, due date, and any extra properties the team add
const fmtDay = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const FACE = ['#0D99FF', '#F28EE8', '#2f7a4b', '#6b5a4a', '#7a5af8', '#e5743a'];
const faceOf = (id: string) => FACE[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % FACE.length];

/** Closes a popover on a click outside it, or Escape */
function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    addEventListener('mousedown', c); addEventListener('keydown', k);
    return () => { removeEventListener('mousedown', c); removeEventListener('keydown', k); };
  }, [open, close]);
  return ref;
}

function usePeople(slug: string) {
  const [v, setV] = useState<{ people: Person[]; me: string }>({ people: [], me: '' });
  useEffect(() => { fetch(`/api/p/${slug}/apps/people`).then((r) => (r.ok ? r.json() : {}) as Promise<{ people?: Person[]; me?: string }>).then((j) => setV({ people: j.people || [], me: j.me || '' })).catch(() => {}); }, [slug]);
  return v;
}

function Face({ p, size = 18 }: { p?: Person; size?: number }) {
  if (!p) return null;
  return <span className="w3-face" title={`${p.name} · ${p.org}`} style={{ width: size, height: size, fontSize: size * 0.42, background: faceOf(p.id), color: p.studio ? '#000' : '#fff' }}>{initials(p.name)}</span>;
}
function Faces({ people, ids }: { people: Person[]; ids: (string | undefined)[] }) {
  const list = [...new Set(ids.filter(Boolean) as string[])].map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[];
  return list.length ? <span className="w3-faces">{list.slice(0, 4).map((p) => <Face key={p.id} p={p} size={24} />)}</span> : null;
}

/** Choose a person: a small menu of the client team, then Lost Property */
function PersonPick({ people, value, onPick, placeholder = 'Add', multi }: { people: Person[]; value?: string | string[]; onPick: (id: string | undefined) => void; placeholder?: string; multi?: boolean }) {
  const [open, setOpen] = useState(false);
  const ids = Array.isArray(value) ? value : value ? [value] : [];
  const chosen = ids.map((id) => people.find((p) => p.id === id)).filter(Boolean) as Person[];
  const orgs = [...new Set(people.map((p) => p.org))];
  const ref = useOutside(open, useCallback(() => setOpen(false), []));
  return <span className="w3-pp" ref={ref} onClick={(e) => e.stopPropagation()}>
    <button type="button" className="w3-pp-b" onClick={() => setOpen(!open)} aria-expanded={open}>
      {chosen.length ? chosen.map((p) => <span key={p.id} className="w3-pp-who"><Face p={p} />{multi && chosen.length > 1 ? null : p.name.split(' ')[0]}</span>) : <span className="mute">{placeholder}</span>}
    </button>
    {open ? <span className="w3-pp-pop" role="menu">
      {!people.length ? <span className="mute w3-pp-none">Nobody on this project yet. Invite the team from Settings.</span> : null}
      {orgs.map((o) => <span key={o} className="w3-pp-g"><span className="mute">{o}</span>{people.filter((p) => p.org === o).map((p) => { const on = ids.includes(p.id); return <button key={p.id} role="menuitemcheckbox" aria-checked={on} className={'w3-pp-row' + (on ? ' on' : '')} onClick={() => { onPick(on && !multi ? undefined : p.id); if (!multi) setOpen(false); }}><Face p={p} /><span>{p.name}</span>{on ? <Check size={12} aria-hidden /> : null}</button>; })}</span>)}
      {ids.length && !multi ? <button className="w3-pp-row mute" onClick={() => { onPick(undefined); setOpen(false); }}>Nobody</button> : null}
    </span> : null}
  </span>;
}

function Tags({ tags, set }: { tags: string[]; set: (t: string[]) => void }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !tags.includes(t)) set([...tags, t]); setV(''); };
  return <span className="w3-tags" onClick={(e) => e.stopPropagation()}>
    {tags.map((t) => <span key={t} className="w3-tag">{t}<button onClick={() => set(tags.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X size={10} aria-hidden /></button></span>)}
    <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} onBlur={add} placeholder="+ Tag" aria-label="Add a tag" size={6} />
  </span>;
}

const OPT: [OptProp, string][] = [['reviewers', 'Reviewers'], ['tags', 'Tags'], ['audience', 'Audience'], ['region', 'Region'], ['brief', 'Brief']];
function DocDetails({ props: d, people, audiences, signed, total, set }: { props: DocProps; people: Person[]; audiences: string[]; signed: number; total: number; set: (x: Partial<DocProps>) => void }) {
  const [menu, setMenu] = useState(false);
  const mref = useOutside(menu, useCallback(() => setMenu(false), []));
  const shown = new Set<OptProp>([...(d.show || []), ...OPT.filter(([k]) => { const v = d[k]; return Array.isArray(v) ? v.length : !!v; }).map(([k]) => k)]);
  const hide = (k: OptProp) => set({ show: (d.show || []).filter((x) => x !== k), [k]: undefined });
  const X_ = ({ k }: { k: OptProp }) => <button className="w3-prop-x" onClick={() => hide(k)} aria-label={`Remove ${k}`}><X size={10} aria-hidden /></button>;
  return <div className="w3-props">
    <label className="w3-camp"><span className="sr">Campaign</span><input value={d.campaign || ''} onChange={(e) => set({ campaign: e.target.value })} placeholder="Campaign" size={Math.max(8, (d.campaign || '').length)} /></label>
    <span className="w3-prop"><span className="mute">Owner</span><PersonPick people={people} value={d.owner} onPick={(id) => set({ owner: id })} placeholder="Choose" /></span>
    <label className="w3-prop"><span className="mute">Due</span><input type="date" className="w3-date" value={d.due || ''} onChange={(e) => set({ due: e.target.value || undefined })} /></label>
    <span className="w3-prop mute">{signed} of {total} signed off</span>
    {shown.has('reviewers') ? <span className="w3-prop"><span className="mute">Reviewers</span><PersonPick multi people={people} value={d.reviewers || []} onPick={(id) => id && set({ reviewers: (d.reviewers || []).includes(id) ? (d.reviewers || []).filter((x) => x !== id) : [...(d.reviewers || []), id] })} /><X_ k="reviewers" /></span> : null}
    {shown.has('tags') ? <span className="w3-prop"><span className="mute">Tags</span><Tags tags={d.tags || []} set={(tags) => set({ tags })} /><X_ k="tags" /></span> : null}
    {shown.has('audience') ? <label className="w3-prop"><span className="mute">Audience</span><input list="w3-aud" value={d.audience || ''} onChange={(e) => set({ audience: e.target.value })} placeholder="Who it’s for" size={Math.max(10, (d.audience || '').length)} /><datalist id="w3-aud">{audiences.map((a) => <option key={a} value={a} />)}</datalist><X_ k="audience" /></label> : null}
    {shown.has('region') ? <label className="w3-prop"><span className="mute">Region</span><input value={d.region || ''} onChange={(e) => set({ region: e.target.value })} placeholder="e.g. London" size={Math.max(8, (d.region || '').length)} /><X_ k="region" /></label> : null}
    {shown.has('brief') ? <label className="w3-prop"><span className="mute">Brief</span>{d.brief && /^https?:\/\//.test(d.brief) ? <a href={d.brief} target="_blank" rel="noopener">Open</a> : null}<input value={d.brief || ''} onChange={(e) => set({ brief: e.target.value })} placeholder="Paste a link" size={Math.max(12, Math.min(40, (d.brief || '').length))} /><X_ k="brief" /></label> : null}
    {OPT.some(([k]) => !shown.has(k)) ? <span className="w3-pp" ref={mref}><button className="w3-addprop" onClick={() => setMenu(!menu)} aria-expanded={menu}>+ Property</button>
      {menu ? <span className="w3-pp-pop" role="menu">{OPT.filter(([k]) => !shown.has(k)).map(([k, l]) => <button key={k} role="menuitem" className="w3-pp-row" onClick={() => { set({ show: [...(d.show || []), k] }); setMenu(false); }}>{l}</button>)}</span> : null}</span> : null}
  </div>;
}

// ---------- Links from a piece to files in the other apps (a film in Director, another doc), so they stay together
const APP_PATH: Record<Link['app'], string> = { writer: 'writer', director: 'director', designer: 'designer', photographer: 'photographer' };
function Links({ slug, docId, links, adding, onDone, set }: { slug: string; docId: string; links: Link[]; adding: boolean; onDone: () => void; set: (l: Link[]) => void }) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Link[] | null>(null);
  const lref = useOutside(open, useCallback(() => setOpen(false), []));
  useEffect(() => {
    if (!adding || all) return;
    Promise.all((['director', 'writer'] as const).map((app) => fetch(`/api/p/${slug}/apps/${app}`).then((r) => r.json()).then((j) => (j.files || []).filter((f: { id: string }) => f.id !== docId).map((f: { id: string; title: string }) => ({ app, id: f.id, title: f.title }))).catch(() => [])))
      .then((x) => setAll(x.flat()));
  }, [adding, all, slug, docId]);
  const href = (l: Link) => `/p/${slug}/${APP_PATH[l.app]}?${l.app === 'director' ? 'p' : 'f'}=${l.id}`;
  return <div className="w3-links" onClick={(e) => e.stopPropagation()}>
    {links.length ? <span className="w3-pp" ref={lref}><button className="w3-lk" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Linked to ${links.length}`}>
      <span className="w3-lk-ic">{[...new Set(links.map((l) => l.app))].map((a) => <AppIcon key={a} app={a} size={13} still />)}</span>{links.length}</button>
      {open ? <span className="w3-pp-pop" role="menu">{links.map((l) => <span key={l.app + l.id} className="w3-pp-row"><AppIcon app={l.app} size={13} still /><a href={href(l)}>{l.title}</a><button className="w3-prop-x" onClick={() => set(links.filter((x) => !(x.app === l.app && x.id === l.id)))} aria-label={`Unlink ${l.title}`}><X size={10} aria-hidden /></button></span>)}</span> : null}
    </span> : null}
    {adding ? <span className="w3-pp"><span className="w3-pp-pop static" role="menu">
      <span className="w3-pp-h"><strong>Link a file</strong><button className="w2-ic" onClick={onDone} aria-label="Close"><X size={12} aria-hidden /></button></span>
      {all === null ? <span className="mute w3-pp-none"><Loader2 size={12} className="spin" aria-hidden /> Loading</span> : !all.length ? <span className="mute w3-pp-none">No other files yet. Films from Director and other docs show here.</span>
        : all.map((l) => { const on = links.some((x) => x.app === l.app && x.id === l.id); return <button key={l.app + l.id} className={'w3-pp-row' + (on ? ' on' : '')} onClick={() => set(on ? links.filter((x) => !(x.app === l.app && x.id === l.id)) : [...links, l])}><AppIcon app={l.app} size={13} still /><span>{l.title}</span>{on ? <Check size={12} aria-hidden /> : null}</button>; })}
    </span></span> : null}
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

// ---------- The delivery file: only the signed-off text, by piece or by place, to copy or download
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function save(name: string, type: string, body: string) {
  const u = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000);
}
function Delivery({ file, client, brand, onBack }: { file: FileRow; client: string; brand: BrandLook; onBack: () => void }) {
  const [copied, setCopied] = useState('');
  const [by, setBy] = useState<'piece' | 'place'>('piece');
  const copy = async (k: string, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(''), 1400); } catch { /* blocked */ } };
  const done = file.data.pieces.filter((p) => p.status === 'signed');
  const rest = file.data.pieces.filter((p) => p.status !== 'signed');
  const all = done.flatMap((p) => pieceBits(p).map((b) => b.text)).join('\n\n');
  const d = file.data.props || {};
  const fileName = (file.title || 'Delivery').replace(/[^\w -]+/g, '').trim() || 'Delivery';
  // Every place the signed-off pieces are going, with each piece's copy for it
  const places = [...new Set(done.flatMap((p) => p.templates))].map((tid) => ({ t: templateById(tid), rows: done.filter((p) => p.templates.includes(tid)).map((p) => ({ p, o: p.out?.[tid] })) }));
  const asText = () => [`${file.title} · ${client}`, file.data.intro || '', ...done.map((p) => [`\n${p.name.toUpperCase()}`, ...pieceBits(p).map((b) => `${b.label}\n${b.text}`)].join('\n\n'))].filter(Boolean).join('\n');
  const asWord = () => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(file.title)}</title><style>body{font-family:Arial,sans-serif;font-size:11pt}h1{font-size:22pt;font-weight:normal}h2{font-size:14pt;margin-top:24pt}p.l{color:#777;font-size:9pt;margin:12pt 0 2pt}</style></head><body>
<p class="l">${esc(client)} · Delivery file</p><h1>${esc(file.title)}</h1>${file.data.intro ? `<p>${esc(file.data.intro)}</p>` : ''}
${done.map((p) => `<h2>${esc(p.name)}</h2>${pieceBits(p).map((b) => `<p class="l">${esc(b.label)}</p><p>${esc(b.text).replace(/\n/g, '<br>')}</p>`).join('')}`).join('')}</body></html>`;
  return <div className="dv">
    <div className="dv-bar"><button className="btn" onClick={onBack}><ArrowLeft {...I} />Back to the doc</button><span className="fb-sp" />
      <div className="w3-tabs" role="tablist" aria-label="Show"><button role="tab" aria-selected={by === 'piece'} onClick={() => setBy('piece')}>By piece</button><button role="tab" aria-selected={by === 'place'} onClick={() => setBy('place')}>By place</button></div>
      <span className="fb-sp" />
      <button className="btn" onClick={() => navigator.clipboard?.writeText(location.href)}>Copy link</button>
      <button className="btn" onClick={() => save(`${fileName}.doc`, 'application/msword', asWord())} disabled={!done.length}>Word</button>
      <button className="btn" onClick={() => save(`${fileName}.txt`, 'text/plain;charset=utf-8', asText())} disabled={!done.length}>Text</button>
      <button className="btn" onClick={() => print()}>PDF</button></div>
    <article className="dv-page">
      <p className="mute dv-k"><AppIcon app="writer" size={14} still /> Delivery file · {client}</p>
      <h1>{file.title}</h1>
      {file.data.intro ? <p className="mute">{file.data.intro}</p> : null}
      {d.campaign || d.due ? <p className="dv-meta">{d.campaign ? <span className="w3-tag ok">{d.campaign}</span> : null}{d.due ? <span className="mute">Due {fmtDay(d.due)}</span> : null}<span className="mute">{done.length} of {file.data.pieces.length} pieces signed off</span></p> : null}
      <div className="dv-note"><span>Only copy the text on the right. The labels say where each line goes. Everything here is signed off.</span><button className="btn sm solid" onClick={() => copy('all', all)} disabled={!done.length}><Copy size={12} aria-hidden />{copied === 'all' ? 'Copied all' : 'Copy all text'}</button></div>
      {by === 'piece' ? done.map((p) => <section key={p.id} className="dv-piece">
        <div className="dv-ph"><h2>{p.name}</h2><span className="dv-signed"><Lock size={11} aria-hidden />Signed off{p.signedBy ? ` by ${p.signedBy}` : ''}{p.signedAt ? ` · ${new Date(p.signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span></div>
        <p className="dv-for">For: {p.templates.map((t) => templateById(t).label).join(' · ')}</p>
        {pieceBits(p).map((b, k) => <div key={k} className="dv-row"><span className="mute">{b.label}</span><p>{b.text}</p><button className="btn sm" onClick={() => copy(p.id + k, b.text)}><Copy size={12} aria-hidden />{copied === p.id + k ? 'Copied' : 'Copy'}</button></div>)}
      </section>)
      : places.map(({ t, rows }) => <section key={t.id} className="dv-piece">
        <div className="dv-ph"><h2>{t.label}</h2><span className="mute">{rows.length} piece{rows.length === 1 ? '' : 's'}</span></div>
        {rows.map(({ p, o }) => <div key={p.id} className="dv-place">
          <div className="dv-place-pv">{o ? <Preview t={t} o={o} brand={brand} /> : <div className="w3-pv w3-text"><div><span className="mute">Copy</span><p>{p.text}</p></div></div>}</div>
          <div className="dv-place-c"><p className="dv-for">{p.name}</p>
            {(o ? partsOf(t).filter((x) => asList(o[x.key]).length).map((x) => ({ label: x.label, text: asList(o[x.key]).join('\n') })) : [{ label: 'Copy', text: p.text.trim() }]).map((b, k) => <div key={k} className="dv-row"><span className="mute">{b.label}</span><p>{b.text}</p><button className="btn sm" onClick={() => copy(p.id + t.id + k, b.text)}><Copy size={12} aria-hidden />{copied === p.id + t.id + k ? 'Copied' : 'Copy'}</button></div>)}
          </div>
        </div>)}
      </section>)}
      {!done.length ? <p className="mute">Nothing signed off yet.</p> : null}
      {rest.length ? <div className="dv-rest"><strong>Still in progress, not included</strong>{rest.map((p) => <span key={p.id} className="mute">{p.name} · {ST[p.status][0]}</span>)}</div> : null}
    </article>
  </div>;
}
