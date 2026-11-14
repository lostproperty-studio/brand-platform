'use client';
import { useCallback, useEffect, useState } from 'react';
import { Clapperboard, FileVideo, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { ASPECTS, type Aspect, type BrandKit, type FileRow } from '@/lib/director/model';
import { api, ago, secs, type Tile } from './api';
import { Planner } from './Planner';
import { Editor } from './Editor';

const I = { size: 16, strokeWidth: 1.6, 'aria-hidden': true } as const;
const LENGTHS = [6, 15, 30, 60];
const STEPS = ['Reading the brief', 'Stepping into the brand’s world', 'Planning the shots', 'Writing the storyboard'];

// Director: the team's videos as tiles, a new video from a brief or a blank canvas, then the storyboard and the editor
export function DirectorApp({ slug, kit, canGenerate, badge, labs }: { slug: string; kit: BrandKit; canGenerate: boolean; badge: string | null; labs: boolean }) {
  const A = api(slug);
  const [tiles, setTiles] = useState<Tile[] | null>(null);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState<FileRow | null>(null);
  const [making, setMaking] = useState(false);
  const [loading, setLoading] = useState('');

  const refresh = useCallback(() => { A.list().then((r) => { setTiles(r.files); setNote(r.error || ''); }).catch((e) => setNote(e.message)); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [refresh]);

  // The open file follows the address (?f=…), so the back button and links work
  const openFile = useCallback(async (id: string, push = true) => {
    setLoading(id);
    try { const { file } = await A.open(id); setOpen(file); if (push) history.pushState({ f: id }, '', `?f=${id}`); }
    catch (e) { setNote((e as Error).message); }
    setLoading('');
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('f'); if (id) openFile(id, false);
    const pop = () => { const f = new URLSearchParams(location.search).get('f'); if (f) openFile(f, false); else { setOpen(null); refresh(); } };
    addEventListener('popstate', pop); return () => removeEventListener('popstate', pop);
  }, [openFile, refresh]);
  const close = () => { setOpen(null); history.pushState({}, '', location.pathname); refresh(); };

  const remove = async (t: Tile) => {
    if (!window.confirm(`Delete “${t.title}”? This can’t be undone.`)) return;
    await A.remove(t.id).catch(() => {}); refresh();
  };

  if (open?.status === 'plan') return <Planner key={open.id + 'p'} slug={slug} kit={kit} file={open} onChange={setOpen} onBack={close} onBuild={(f) => setOpen(f)} />;
  if (open) return <Editor key={open.id} slug={slug} kit={kit} file={open} setFile={(fn) => setOpen((o) => (o ? fn(o) : o))} onBack={close} canGenerate={canGenerate} />;

  return <div className="dr-files">
    <header className="dr-files-head">
      <div>
        <h1 className="dr-files-title"><Clapperboard size={26} strokeWidth={1.4} aria-hidden />Director{badge ? <span className={'pt-badge big ' + badge.toLowerCase()}>{badge}</span> : null}</h1>
        <p className="mute">Short-form video for {kit.client}, made in the brand’s world, with its type, logos and colours built in.</p>
      </div>
      <button className="btn solid dr-new-btn" onClick={() => setMaking(true)}><Plus {...I} />New video</button>
    </header>
    {labs ? <p className="dr-labs" role="status">Labs: only the studio can see Director. {kit.client}’s team won’t see it until it’s moved to Client beta in Admin settings → Releases.</p> : null}
    {note ? <p className="cd-err" role="alert">{note}</p> : null}
    <div className="dr-grid">
      <button className="dr-tile dr-tile-new" onClick={() => setMaking(true)}><span className="dr-tile-new-in"><Plus size={22} strokeWidth={1.4} aria-hidden />New video</span></button>
      {tiles === null ? <div className="dr-tile dr-tile-ghost" aria-busy /> : tiles.map((t) => {
        const a = ASPECTS.find((x) => x.id === t.aspect) || ASPECTS[0];
        return <div key={t.id} className="dr-tile">
          <button className="dr-tile-open" onClick={() => openFile(t.id)} aria-label={`Open ${t.title}`}>
            <span className="dr-thumb" style={{ background: t.cover || 'var(--fill-2)' }}>
              <span className="dr-thumb-frame" style={{ aspectRatio: `${a.w} / ${a.h}` }}>
                {t.thumbUrl ? (t.thumbKind === 'video' ? <video src={t.thumbUrl + '#t=0.5'} muted playsInline preload="metadata" /> : <img src={t.thumbUrl} alt="" />) : <FileVideo size={22} strokeWidth={1.2} aria-hidden />}
              </span>
              {loading === t.id ? <span className="dr-thumb-busy"><Loader2 size={18} className="spin" aria-hidden /></span> : null}
            </span>
            <span className="dr-tile-meta">
              <span className="dr-tile-t">{t.title}</span>
              <span className="mute">{t.status === 'plan' ? 'Storyboard' : `${t.scenes} scene${t.scenes === 1 ? '' : 's'} · ${secs(t.seconds)}`} · {t.aspect} · {ago(t.updated_at)}</span>
            </span>
          </button>
          <button className="dr-tile-del" onClick={() => remove(t)} aria-label={`Delete ${t.title}`} title="Delete"><Trash2 size={14} strokeWidth={1.6} aria-hidden /></button>
        </div>;
      })}
    </div>
    {tiles?.length === 0 ? <p className="mute dr-empty">No videos yet. Start one from a brief and Director will plan it for you, or open a blank canvas.</p> : null}
    {making ? <NewVideo slug={slug} onClose={() => setMaking(false)} onOpen={(id) => { setMaking(false); openFile(id); }} /> : null}
  </div>;
}

function NewVideo({ slug, onClose, onOpen }: { slug: string; onClose: () => void; onOpen: (id: string) => void }) {
  const A = api(slug);
  const [mode, setMode] = useState<'brief' | 'blank'>('brief');
  const [prompt, setPrompt] = useState('');
  const [mood, setMood] = useState('');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [length, setLength] = useState(15);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  useEffect(() => { if (!busy) return; const t = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), 6000); return () => clearInterval(t); }, [busy]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [busy, onClose]);
  const go = async () => {
    setErr(''); setBusy(true); setStep(0);
    try {
      const r = mode === 'brief' ? await A.plan({ prompt, length, aspect, mood: mood || undefined }) : await A.create('Untitled video', aspect);
      onOpen(r.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return <div className="dr-modal" role="dialog" aria-modal aria-label="New video" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="dr-modal-card">
      <div className="dr-modal-head"><h2>New video</h2><button className="dr-x" onClick={onClose} disabled={busy} aria-label="Close"><X {...I} /></button></div>
      <div className="dr-seg" role="tablist">
        <button role="tab" aria-selected={mode === 'brief'} className={mode === 'brief' ? 'on' : ''} onClick={() => setMode('brief')}><Sparkles {...I} /><span><strong>Start from a brief</strong><span className="mute">Director plans and storyboards it</span></span></button>
        <button role="tab" aria-selected={mode === 'blank'} className={mode === 'blank' ? 'on' : ''} onClick={() => setMode('blank')}><FileVideo {...I} /><span><strong>Blank canvas</strong><span className="mute">Build it scene by scene</span></span></button>
      </div>
      {mode === 'brief' ? <>
        <label className="dr-lab">What’s the video for?</label>
        <textarea className="dr-ta" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. A 15-second reel announcing our new evening opening hours, for regulars and people who’ve never been" autoFocus />
        <label className="dr-lab">Feel <span className="mute">(optional)</span></label>
        <input className="in" value={mood} onChange={(e) => setMood(e.target.value)} placeholder="e.g. slow and quiet, warm light" />
        <label className="dr-lab">Length</label>
        <div className="dr-chips">{LENGTHS.map((l) => <button key={l} className={'dr-chip' + (length === l ? ' on' : '')} onClick={() => setLength(l)}>{l}s</button>)}</div>
      </> : null}
      <label className="dr-lab">Canvas</label>
      <div className="dr-aspects">{ASPECTS.map((a) => <button key={a.id} className={'dr-aspect' + (aspect === a.id ? ' on' : '')} onClick={() => setAspect(a.id)}>
        <span className="dr-aspect-shape" style={{ aspectRatio: `${a.w} / ${a.h}` }} /><strong>{a.id}</strong><span className="mute">{a.use}</span>
      </button>)}</div>
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
      <div className="dr-modal-foot">
        {busy && mode === 'brief' ? <span className="mute dr-step"><Loader2 size={14} className="spin" aria-hidden />{STEPS[step]}…</span> : <span />}
        <button className="btn solid" onClick={go} disabled={busy || (mode === 'brief' && prompt.trim().length < 3)}>{busy ? <Loader2 size={14} className="spin" aria-hidden /> : null}{mode === 'brief' ? 'Plan it' : 'Create'}</button>
      </div>
    </div>
  </div>;
}
