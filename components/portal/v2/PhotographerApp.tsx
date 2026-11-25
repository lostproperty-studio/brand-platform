'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, Images, Loader2, Plus, RefreshCw, Search, Sparkles, Trash2, Upload, Wand2, X, Info } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { PhotoEditor } from '@/components/portal/v2/PhotoEditor';
import { VERDICT, strip, type Collection, type Photo, type Review } from '@/lib/photographer/model';

// Portal v2 Photographer: collections of on-brand images. It opens on the collections, with All images first. In a
// collection the team adds pictures (from their computer, Death to Stock, or generated in the brand's style), and
// Lost Property's art director checks each one against the guidelines' art direction as it arrives. Click an image
// to see the review, open it to crop it and add effect layers.

type Col = { id: string; title: string; count: number; cover: string | null; covers: string[]; updated_at: string };
type Lib = { collections: Col[]; images: (Photo & { collection: string; collectionTitle: string })[]; error?: string | null; staff: boolean };
type Direction = { pointers: string[]; prompt: string; empty?: boolean; error?: string };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const uid = () => Math.random().toString(36).slice(2, 10);
const ago = (iso: string) => { const m = (Date.now() - new Date(iso).getTime()) / 60000; return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
const j = async (r: Response) => { const t = await r.text(); let x: Record<string, any> = {}; try { x = JSON.parse(t); } catch { /* plain */ } if (!r.ok) throw new Error(x.error || t.slice(0, 160) || 'Something went wrong'); return x; }; // eslint-disable-line @typescript-eslint/no-explicit-any
const post = (url: string, body: object) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j);

/** A smaller JPEG of a picture, for the art director to look at */
export async function forReview(src: Blob | HTMLImageElement | HTMLCanvasElement, max = 1024): Promise<string> {
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src;
  const w = 'naturalWidth' in bmp ? bmp.naturalWidth : bmp.width, h = 'naturalHeight' in bmp ? bmp.naturalHeight : bmp.height;
  const s = Math.min(1, max / Math.max(w, h)); const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d')!.drawImage(bmp as CanvasImageSource, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export function photoApi(slug: string) {
  const base = `/api/p/${slug}`;
  return {
    library: () => fetch(`${base}/photographer/library`, { cache: 'no-store' }).then(j) as Promise<Lib>,
    direction: (fresh = false) => fetch(`${base}/photographer/direction${fresh ? '?fresh=1' : ''}`, { cache: 'no-store' }).then(j) as Promise<Direction>,
    create: (title: string) => post(`${base}/apps/photographer`, { title, data: { images: [] } }) as Promise<{ id: string }>,
    open: (id: string) => fetch(`${base}/apps/photographer/${id}`, { cache: 'no-store' }).then(j) as Promise<{ file: { id: string; title: string; data: Collection } }>,
    save: (id: string, body: { title?: string; data?: Collection }) => fetch(`${base}/apps/photographer/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body.data ? { ...body, data: strip({ ...body.data, images: body.data.images.filter((x) => x.path) }) } : body) }).then(j),
    remove: (id: string) => fetch(`${base}/apps/photographer/${id}`, { method: 'DELETE' }).then(j),
    view: (paths: string[]) => post(`${base}/photographer/media`, { action: 'view', paths }) as Promise<{ urls: Record<string, string> }>,
    upload: async (blob: Blob, name: string) => {
      const s = await post(`${base}/photographer/media`, { action: 'sign', name, type: blob.type || 'image/jpeg' });
      const fd = new FormData(); fd.append('cacheControl', '3600'); fd.append('', blob, name);
      const up = await fetch(s.signedUrl, { method: 'PUT', body: fd, headers: { 'x-upsert': 'true' } }); if (!up.ok) throw new Error(`Couldn’t upload ${name}.`);
      return s.path as string;
    },
    review: (image: string, source: string, note?: string) => post(`${base}/photographer/review`, { image, source, note }) as Promise<{ review: Review }>,
    generate: (prompt: string, style: string, aspect: string) => post(`${base}/photographer/generate`, { prompt, style, aspect }) as Promise<{ path: string; url: string }>
  };
}

export function PhotographerApp({ slug, client, staff, labs, me }: { slug: string; client: string; staff: boolean; labs: boolean; me: string }) {
  const A = useMemo(() => photoApi(slug), [slug]);
  const [lib, setLib] = useState<Lib | null>(null);
  const [err, setErr] = useState('');
  const [dir, setDir] = useState<Direction | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const refresh = useCallback(() => { A.library().then((r) => { setLib(r); setErr(r.error || ''); }).catch((e) => setErr(e.message)); }, [A]);
  useEffect(() => { refresh(); A.direction().then(setDir).catch(() => setDir({ pointers: [], prompt: '' })); }, [refresh, A]);
  // The open collection follows the address (?c=…, or ?c=all)
  useEffect(() => { const read = () => setOpenId(new URLSearchParams(location.search).get('c')); read(); addEventListener('popstate', read); return () => removeEventListener('popstate', read); }, []);
  const open = (id: string | null) => { setOpenId(id); history.pushState({}, '', id ? `?c=${id}` : location.pathname); if (!id) refresh(); };

  if (openId) return <CollectionView key={openId} A={A} id={openId} lib={lib} client={client} staff={staff} me={me} dir={dir} back={() => open(null)} />;

  const create = async () => { try { const { id } = await A.create('Untitled collection'); open(id); } catch (e) { setErr((e as Error).message); } };
  const list = (lib?.collections || []).filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()));
  const latest = (lib?.images || []).slice(0, 4).map((x) => x.url).filter(Boolean) as string[];
  return <div className="fb">
    <header className="fb-top">
      <AppIcon app="photographer" size={18} /><strong>Photographer</strong><span className="mute">/</span><span>Collections</span>
      <span className="fb-sp" />
      <label className="fb-search"><Search {...I} /><span className="sr">Search collections</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search collections" /></label>
      <Link className="btn fb-about" href={`/p/${slug}/preview/photographer`} title="What Photographer does"><Info {...I} /><span>About</span></Link>
      <button className="btn solid" onClick={create}><Plus {...I} />New collection</button>
    </header>
    <div className="fb-body">
      <div className="fb-bar"><h1>Collections</h1><span className="mute">{lib ? `${lib.collections.length} collection${lib.collections.length === 1 ? '' : 's'} · ${lib.images.length} image${lib.images.length === 1 ? '' : 's'}` : ''}</span></div>
      {labs ? <p className="dr-labs" role="status">Labs: only the studio can see Photographer.</p> : null}
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
      <div className="fb-grid">
        <button className="fb-card fb-new" onClick={create}><span className="fb-th"><Plus size={20} strokeWidth={1.5} aria-hidden /><span>New collection</span></span><span className="fb-name">New collection</span><span className="fb-meta mute">A folder of images for a campaign or a use</span></button>
        <div className="fb-card"><button className="fb-open" onClick={() => open('all')} aria-label="Open All images">
          <span className="fb-th"><Mosaic urls={latest} icon /></span><span className="fb-name">All images</span><span className="fb-meta mute">{lib ? `${lib.images.length} across every collection` : ''}</span></button></div>
        {lib === null ? <div className="fb-card" aria-busy><span className="fb-th" /></div> : list.map((c) => <div key={c.id} className="fb-card">
          <button className="fb-open" onClick={() => open(c.id)} aria-label={`Open ${c.title}`}>
            <span className="fb-th"><Mosaic urls={c.covers} /></span><span className="fb-name">{c.title}</span>
            <span className="fb-meta mute">{c.count} image{c.count === 1 ? '' : 's'} · {ago(c.updated_at)}</span></button>
          <button className="fb-del" onClick={async () => { if (!confirm(`Delete the collection “${c.title}” and its ${c.count} image${c.count === 1 ? '' : 's'}?`)) return; await A.remove(c.id).catch(() => {}); refresh(); }} aria-label={`Delete ${c.title}`} title="Delete"><Trash2 size={14} strokeWidth={1.6} aria-hidden /></button>
        </div>)}
      </div>
      {dir?.pointers.length ? <section className="ph-rules"><h2><Sparkles size={13} aria-hidden /> Art direction, in short</h2><ul>{dir.pointers.map((p) => <li key={p}>{p}</li>)}</ul></section> : null}
    </div>
  </div>;
}

function Mosaic({ urls, icon }: { urls: string[]; icon?: boolean }) {
  if (!urls.length) return <span className="ph-mosaic empty">{icon ? <Images size={22} strokeWidth={1.4} aria-hidden /> : null}</span>;
  return <span className={'ph-mosaic n' + Math.min(4, urls.length)}>{urls.slice(0, 4).map((u) => <img key={u} src={u} alt="" loading="lazy" />)}</span>;
}

// ---------- A collection (or All images)

type Busy = Record<string, string>;
function CollectionView({ A, id, lib, client, staff, me, dir, back }: { A: ReturnType<typeof photoApi>; id: string; lib: Lib | null; client: string; staff: boolean; me: string; dir: Direction | null; back: () => void }) {
  const all = id === 'all';
  const [title, setTitle] = useState(all ? 'All images' : '');
  const [col, setCol] = useState<Collection | null>(null);
  const [allImgs, setAllImgs] = useState<Lib['images']>([]);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>({});
  const [panel, setPanel] = useState<'stock' | 'generate' | null>(null);
  const [drag, setDrag] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const colRef = useRef<Collection | null>(null); colRef.current = col;

  useEffect(() => {
    if (all) { A.library().then((r) => setAllImgs(r.images)).catch((e) => setErr(e.message)); return; }
    A.open(id).then(async ({ file: f }) => {
      setTitle(f.title); const c = { ...f.data, images: f.data.images || [] } as Collection;
      const { urls } = await A.view(c.images.flatMap((x) => [x.path, x.original].filter(Boolean) as string[]));
      setCol({ ...c, images: c.images.map((x) => ({ ...x, url: urls[x.path], originalUrl: x.original ? urls[x.original] : undefined })) });
    }).catch((e) => setErr(e.message));
  }, [A, id, all]);

  // Saving: a moment after a change, the whole collection
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = (fn: (c: Collection) => Collection) => {
    setCol((c) => { const n = fn(c || { images: [] }); colRef.current = n; return n; });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (colRef.current) A.save(id, { data: colRef.current }).catch((e) => setErr(e.message)); }, 600);
  };
  const setPhoto = (pid: string, x: Partial<Photo>) => update((c) => ({ ...c, images: c.images.map((p) => (p.id === pid ? { ...p, ...x } : p)) }));

  /** Asks the art director about a picture, and keeps the answer on it */
  const review = async (pid: string, image: Blob | HTMLImageElement | HTMLCanvasElement, source: string) => {
    setBusy((b) => ({ ...b, [pid]: 'Art director is looking' }));
    try { const { review: r } = await A.review(await forReview(image), source); setPhoto(pid, { review: r }); }
    catch (e) { setPhoto(pid, { review: { score: 0, verdict: 'close', summary: `Couldn’t review it: ${(e as Error).message}`, good: [], fix: [], at: new Date().toISOString() } }); }
    setBusy((b) => { const { [pid]: _, ...rest } = b; return rest; }); // eslint-disable-line @typescript-eslint/no-unused-vars
  };
  /** Adds files from the computer (or stock downloads), then reviews each */
  const addFiles = async (files: File[], source: Photo['source'] = 'upload') => {
    const ims = files.filter((f) => /^image\/(jpeg|png|webp|gif|avif)$/.test(f.type)); if (!ims.length) { setErr('Drop JPG, PNG, WebP or AVIF images.'); return; }
    setPanel(null);
    for (const f of ims) {
      const pid = uid(); const url = URL.createObjectURL(f);
      const bmp = await createImageBitmap(f).catch(() => null);
      const ph: Photo = { id: pid, path: '', name: f.name.replace(/\.[a-z0-9]+$/i, ''), w: bmp?.width || 0, h: bmp?.height || 0, source, added: new Date().toISOString(), by: me, url };
      setCol((c) => ({ ...(c || { images: [] }), images: [...(c?.images || []), ph] }));
      setBusy((b) => ({ ...b, [pid]: 'Uploading' }));
      try { const path = await A.upload(f, f.name); setPhoto(pid, { path }); review(pid, f, source); }
      catch (e) { setErr((e as Error).message); setCol((c) => c && { ...c, images: c.images.filter((x) => x.id !== pid) }); setBusy((b) => { const { [pid]: _, ...rest } = b; return rest; }); } // eslint-disable-line @typescript-eslint/no-unused-vars
    }
  };
  const generate = async (prompt: string, aspect: string, useStyle: boolean) => {
    setPanel(null);
    const pid = uid();
    setCol((c) => ({ ...(c || { images: [] }), images: [...(c?.images || []), { id: pid, path: '', name: prompt.slice(0, 60), w: 0, h: 0, source: 'generated', prompt, added: new Date().toISOString(), by: me }] }));
    setBusy((b) => ({ ...b, [pid]: 'Generating' }));
    try {
      const g = await A.generate(prompt, useStyle ? dir?.prompt || '' : '', aspect);
      const img = await loadImg(g.url);
      setPhoto(pid, { path: g.path, url: g.url, w: img.naturalWidth, h: img.naturalHeight });
      review(pid, img, 'generated');
    } catch (e) { setErr((e as Error).message); setCol((c) => c && { ...c, images: c.images.filter((x) => x.id !== pid) }); setBusy((b) => { const { [pid]: _, ...rest } = b; return rest; }); } // eslint-disable-line @typescript-eslint/no-unused-vars
  };

  const images: (Photo & { collection?: string; collectionTitle?: string })[] = all ? allImgs : col?.images || [];
  const cur = images.find((x) => x.id === sel) || null;
  const rename = (t: string) => { setTitle(t); A.save(id, { title: t.trim() || 'Untitled collection' }).catch(() => {}); };

  if (editing) {
    const ph = images.find((x) => x.id === editing);
    if (ph) return <PhotoEditor photo={ph} client={client} staff={staff} pointers={dir?.pointers || []} A={A} onClose={() => setEditing(null)}
      onSave={async (next, copy) => {
        if (all) {
          // Saved back into the image's own collection
          const cid = (ph as Lib['images'][number]).collection; const f = await A.open(cid); const c = f.file.data;
          const ims = copy ? [...c.images, next] : c.images.map((x) => (x.id === ph.id ? next : x));
          await A.save(cid, { data: { ...c, images: ims } }); const r = await A.library(); setAllImgs(r.images);
        } else update((c) => ({ ...c, images: copy ? [...c.images, next] : c.images.map((x) => (x.id === ph.id ? next : x)) }));
        setSel(next.id); setEditing(null);
      }} />;
  }

  return <div className="ph" onDragOver={(e) => { if (all) return; e.preventDefault(); setDrag(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
    onDrop={(e) => { if (all) return; e.preventDefault(); setDrag(false); addFiles([...e.dataTransfer.files], panel === 'stock' ? 'stock' : 'upload'); }}>
    <header className="w2-top">
      <button className="w2-ic" onClick={back} aria-label="Back to Collections" title="Back to Collections"><ArrowLeft {...I} /></button>
      <AppIcon app="photographer" size={18} /><button className="w2-crumb" onClick={back}>Photographer</button><span className="mute">/</span>
      {all ? <strong className="ph-t">All images</strong> : <input className="w2-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => rename(e.target.value)} aria-label="Collection name" />}
      <span className="mute">{images.length} image{images.length === 1 ? '' : 's'}</span>
      <span className="fb-sp" />
      {!all ? <>
        <button className="btn" onClick={() => setPanel(panel === 'stock' ? null : 'stock')}><Search {...I} />Death to Stock</button>
        <button className="btn" onClick={() => setPanel(panel === 'generate' ? null : 'generate')}><Wand2 {...I} />Generate</button>
        <button className="btn solid" onClick={() => file.current?.click()}><Upload {...I} />Add images</button>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple hidden onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
      </> : null}
    </header>
    <div className="ph-body">
      <main className="ph-main">
        {err ? <p className="cd-err" role="alert">{err} <button className="mo-link" onClick={() => setErr('')}>Dismiss</button></p> : null}
        {panel === 'stock' ? <StockPanel close={() => setPanel(null)} pick={(f) => addFiles(f, 'stock')} /> : null}
        {panel === 'generate' ? <GeneratePanel staff={staff} dir={dir} close={() => setPanel(null)} go={generate} /> : null}
        {!all && col && !images.length && !panel ? <div className="ph-empty"><Upload size={22} strokeWidth={1.4} aria-hidden /><strong>Drop images here</strong><span className="mute">Or add them from your computer, find them on Death to Stock, or generate them in the {client} style. The art director checks each one.</span>
          <button className="btn solid" onClick={() => file.current?.click()}><Upload {...I} />Add images</button></div> : null}
        {(all ? true : !!col) ? <div className="ph-grid">{images.map((p) => <button key={p.id} className={'ph-it' + (sel === p.id ? ' on' : '')} onClick={() => setSel(p.id)} onDoubleClick={() => p.url && setEditing(p.id)}>
          {p.url ? <img src={p.url} alt={p.name} loading="lazy" style={p.w && p.h ? { aspectRatio: `${p.w} / ${p.h}` } : undefined} /> : <span className="ph-ph" />}
          {busy[p.id] ? <span className="ph-busy"><Loader2 size={12} className="spin" aria-hidden />{busy[p.id]}</span> : p.review ? <span className={'ph-badge ' + p.review.verdict} title={p.review.summary}>{VERDICT[p.review.verdict]}</span> : null}
          {all && p.collectionTitle ? <span className="ph-col">{p.collectionTitle}</span> : null}
          {p.source === 'edit' ? <span className="ph-tag">Edited</span> : p.source === 'generated' ? <span className="ph-tag">Generated</span> : p.source === 'stock' ? <span className="ph-tag">Stock</span> : null}
        </button>)}</div> : <p className="mute">Loading…</p>}
        {drag ? <div className="ph-drop"><Upload size={26} strokeWidth={1.4} aria-hidden /><strong>Drop to add to {title}</strong></div> : null}
      </main>
      <aside className="ph-side" aria-label="Art director">
        {cur ? <>
          <div className="ph-prev">{cur.url ? <img src={cur.url} alt="" /> : null}</div>
          <div className="ph-meta"><strong>{cur.name}</strong><span className="mute">{cur.w && cur.h ? `${cur.w} × ${cur.h}` : ''}{cur.source === 'generated' ? ' · generated' : cur.source === 'stock' ? ' · Death to Stock' : cur.source === 'edit' ? ' · edited' : ''}</span></div>
          <div className="ph-acts">
            <button className="btn solid" onClick={() => setEditing(cur.id)} disabled={!cur.url}><Wand2 {...I} />Edit and add effects</button>
            {!all ? <button className="btn" onClick={() => { update((c) => ({ ...c, images: c.images.filter((x) => x.id !== cur.id) })); setSel(null); }} aria-label="Remove from collection" title="Remove from collection"><Trash2 {...I} /></button> : null}
          </div>
          <ReviewCard r={cur.review} busy={busy[cur.id]} again={!all && cur.url ? async () => review(cur.id, await loadImg(cur.url!), cur.source) : undefined} />
          {cur.prompt ? <div className="ph-sec"><p className="ph-h">Asked for</p><p className="ph-small">{cur.prompt}</p></div> : null}
        </> : <>
          <div className="ph-sec"><p className="ph-h"><Sparkles size={13} aria-hidden /> Art director</p><p className="ph-small mute">Every image you add is checked against {client}’s art direction. Select one to see what works and what to change.</p></div>
          {dir === null ? <p className="ph-small mute"><Loader2 size={12} className="spin" aria-hidden /> Reading the art direction…</p>
            : dir.pointers.length ? <div className="ph-sec"><p className="ph-h">Rules of thumb</p><ul className="ph-rule-l">{dir.pointers.map((p) => <li key={p}>{p}</li>)}</ul></div>
            : <p className="ph-small mute">{dir.empty ? 'The guidelines don’t have an art direction chapter yet, so the art director is working from the brand’s design qualities.' : dir.error || ''}</p>}
          {images.some((x) => x.review) ? <Tally images={images} /> : null}
        </>}
      </aside>
    </div>
  </div>;
}

export function loadImg(url: string) { return new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => bad(new Error('That image couldn’t be loaded.')); i.src = url; }); }

function Tally({ images }: { images: Photo[] }) {
  const n = { on: 0, close: 0, off: 0 }; images.forEach((x) => x.review && n[x.review.verdict]++);
  return <div className="ph-sec"><p className="ph-h">This collection</p><div className="ph-tally">{(['on', 'close', 'off'] as const).map((k) => <span key={k} className={'ph-badge ' + k}>{n[k]} {VERDICT[k].toLowerCase()}</span>)}</div></div>;
}

export function ReviewCard({ r, busy, again }: { r?: Review; busy?: string; again?: () => void }) {
  if (busy) return <div className="ph-sec"><p className="ph-small mute"><Loader2 size={12} className="spin" aria-hidden /> {busy}…</p></div>;
  if (!r) return again ? <div className="ph-sec"><button className="btn" onClick={again}><Sparkles {...I} />Ask the art director</button></div> : null;
  return <div className="ph-sec ph-review">
    <div className="ph-score"><span className={'ph-badge ' + r.verdict}>{VERDICT[r.verdict]}</span><span className="ph-num">{r.score}<span className="mute">/100</span></span>{again ? <button className="fx-ic ph-again" onClick={again} title="Review again" aria-label="Review again"><RefreshCw size={13} aria-hidden /></button> : null}</div>
    <p className="ph-small">{r.summary}</p>
    {r.good.length ? <><p className="ph-h">Works</p><ul className="ph-list good">{r.good.map((x) => <li key={x}><Check size={12} aria-hidden />{x}</li>)}</ul></> : null}
    {r.fix.length ? <><p className="ph-h">To bring it closer</p><ul className="ph-list fix">{r.fix.map((x) => <li key={x}>{x}</li>)}</ul></> : null}
  </div>;
}

/** Death to Stock: there's no way yet for other apps to search its library, so for now the team finds pictures on
 *  the site and drops the downloads here, where they're checked like any other. */
function StockPanel({ close, pick }: { close: () => void; pick: (f: File[]) => void }) {
  const f = useRef<HTMLInputElement>(null);
  return <section className="ph-panel">
    <header><strong>Death to Stock</strong><button className="fx-ic" onClick={close} aria-label="Close"><X size={14} aria-hidden /></button></header>
    <p className="ph-small">Searching Death to Stock from here needs your account linked, and Death to Stock doesn’t yet offer a way for other apps to search its library. Lost Property is asking them for access.</p>
    <p className="ph-small mute">Until then: find pictures on Death to Stock with your own login, download them, and drop them here. They’re marked as stock and checked by the art director.</p>
    <div className="ph-panel-b"><a className="btn" href="https://deathtothestockphoto.com" target="_blank" rel="noreferrer"><ExternalLink {...I} />Open Death to Stock</a>
      <button className="btn solid" onClick={() => f.current?.click()}><Upload {...I} />Add downloads</button>
      <input ref={f} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { pick([...(e.target.files || [])]); e.target.value = ''; }} /></div>
  </section>;
}

function GeneratePanel({ staff, dir, close, go }: { staff: boolean; dir: Direction | null; close: () => void; go: (prompt: string, aspect: string, style: boolean) => void }) {
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('4:5');
  const [style, setStyle] = useState(true);
  return <section className="ph-panel">
    <header><strong>Generate in the brand’s style</strong><button className="fx-ic" onClick={close} aria-label="Close"><X size={14} aria-hidden /></button></header>
    {!staff ? <p className="ph-small">Generating needs your own Krea account, which you’ll be able to connect in Settings soon.</p> : <>
      <textarea className="ph-ta" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What’s in the picture: subject, setting, moment" />
      <div className="ph-panel-b">
        <span className="dp-seg ph-asp">{['4:5', '1:1', '3:4', '16:9', '9:16'].map((a) => <button key={a} className={aspect === a ? 'on' : ''} onClick={() => setAspect(a)}>{a}</button>)}</span>
        <label className="ph-chk"><input type="checkbox" checked={style} onChange={(e) => setStyle(e.target.checked)} disabled={!dir?.prompt} />Follow the art direction</label>
        <span className="fb-sp" />
        <button className="btn solid" onClick={() => go(prompt, aspect, style)} disabled={prompt.trim().length < 3}><Sparkles {...I} />Generate</button>
      </div>
      {style && dir?.prompt ? <p className="ph-small mute">Style: {dir.prompt}</p> : null}
    </>}
  </section>;
}
