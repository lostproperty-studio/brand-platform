'use client';
import { ArrowLeft, Camera, Hammer, Image as ImageIcon, Music, Plus, Square, Trash2, Upload, Video } from 'lucide-react';
import { newCaption, newScene, total, type BrandKit, type FileRow, type Scene, type Source } from '@/lib/director/model';
import { api, secs } from './api';
import { SAVE_LABEL, useSave } from './useSave';

const I = { size: 14, strokeWidth: 1.7, 'aria-hidden': true } as const;
export const SOURCES: { id: string; label: string; Icon: typeof Video; make: (s: Scene) => Source }[] = [
  { id: 'video', label: 'Generate video', Icon: Video, make: (s) => ({ kind: 'generate', model: 'video', prompt: s.source.kind === 'generate' ? s.source.prompt : s.note }) },
  { id: 'image', label: 'Generate image', Icon: ImageIcon, make: (s) => ({ kind: 'generate', model: 'image', prompt: s.source.kind === 'generate' ? s.source.prompt : s.note }) },
  { id: 'upload', label: 'Your footage', Icon: Upload, make: (s) => ({ kind: 'upload', ask: s.source.kind === 'upload' ? s.source.ask : s.note }) },
  { id: 'card', label: 'Brand card', Icon: Square, make: () => ({ kind: 'card' }) }
];
export const sourceId = (s: Source) => (s.kind === 'generate' ? s.model : s.kind);

// The storyboard Director planned from the brief: every scene, what it shows, where its picture comes from and
// its words, to adjust before building the edit
export function Planner({ slug, kit, file, onChange, onBack, onBuild }: { slug: string; kit: BrandKit; file: FileRow; onChange: (f: FileRow) => void; onBack: () => void; onBuild: (f: FileRow) => void }) {
  const { state, now } = useSave(slug, file);
  const d = file.data;
  const setScenes = (scenes: Scene[]) => onChange({ ...file, data: { ...d, scenes } });
  const set = (id: string, patch: Partial<Scene>) => setScenes(d.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const music = d.audio.find((a) => a.kind === 'music');
  const build = async () => { const f: FileRow = { ...file, status: 'edit' }; await api(slug).save(f).catch(() => {}); onBuild(f); };
  const counts = { gen: d.scenes.filter((s) => s.source.kind === 'generate').length, up: d.scenes.filter((s) => s.source.kind === 'upload').length };

  return <div className="dr-plan">
    <header className="dr-bar">
      <button className="btn ic" onClick={async () => { await now(); onBack(); }}><ArrowLeft {...I} />Videos</button>
      <input className="dr-title-in" value={file.title} onChange={(e) => onChange({ ...file, title: e.target.value })} aria-label="Title" />
      <span className="mute dr-save">{SAVE_LABEL[state]}</span>
      <span className="dr-bar-gap" />
      <span className="mute">{d.scenes.length} scenes · {secs(total(d))} · {file.aspect}</span>
      <button className="btn solid" onClick={build} disabled={!d.scenes.length}><Hammer {...I} />Build</button>
    </header>
    <div className="dr-plan-body">
      <section className="dr-plan-intro">
        <p className="dr-kicker">Storyboard</p>
        <h1 className="dr-plan-h">{d.logline || file.title}</h1>
        {d.brief ? <p className="mute">Brief: {d.brief.prompt}</p> : null}
        <p className="mute">Check the shots, words and where each picture comes from, then Build to open it in the editor. {counts.gen ? `${counts.gen} will be generated` : ''}{counts.gen && counts.up ? ' and ' : ''}{counts.up ? `${counts.up} need your footage` : ''}.</p>
      </section>
      <ol className="dr-board">
        {d.scenes.map((s, i) => <li key={s.id} className="dr-card">
          <div className="dr-card-frame" style={{ background: s.background }}>
            <span className="dr-card-n">{String(i + 1).padStart(2, '0')}</span>
            <span className="dr-card-src">{(() => { const S = SOURCES.find((x) => x.id === sourceId(s.source))!; return <><S.Icon {...I} />{S.label}</>; })()}</span>
            {s.captions[0] ? <span className="dr-card-cap">{s.captions[0].text}</span> : null}
          </div>
          <div className="dr-card-row">
            <input className="dr-card-t" value={s.title} onChange={(e) => set(s.id, { title: e.target.value })} aria-label="Scene title" />
            <label className="dr-card-dur"><input type="number" min={1} max={20} step={0.5} value={s.duration} onChange={(e) => set(s.id, { duration: Math.max(0.5, Number(e.target.value) || 1) })} aria-label="Seconds" />s</label>
          </div>
          <textarea className="dr-card-note" rows={3} value={s.note} onChange={(e) => set(s.id, { note: e.target.value })} aria-label="What the shot shows" placeholder="What we see" />
          <div className="dr-card-srcs">{SOURCES.map((x) => <button key={x.id} className={'dr-mini' + (sourceId(s.source) === x.id ? ' on' : '')} onClick={() => set(s.id, { source: x.make(s), motion: x.id === 'image' ? 'push' : 'none' })} title={x.label} aria-label={x.label}><x.Icon {...I} /></button>)}</div>
          {s.source.kind === 'generate' ? <textarea className="dr-card-prompt" rows={4} value={s.source.prompt} onChange={(e) => set(s.id, { source: { ...s.source, prompt: e.target.value } as Source })} aria-label="Prompt" placeholder="Prompt for the model" /> : null}
          {s.source.kind === 'upload' ? <p className="dr-card-ask"><Camera {...I} /><textarea rows={3} value={s.source.ask} onChange={(e) => set(s.id, { source: { kind: 'upload', ask: e.target.value } })} aria-label="Shot to film or find" /></p> : null}
          <input className="in dr-card-capin" value={s.captions[0]?.text || ''} placeholder="Words on screen (optional)" aria-label="Words on screen"
            onChange={(e) => { const v = e.target.value; set(s.id, { captions: v ? (s.captions[0] ? [{ ...s.captions[0], text: v }, ...s.captions.slice(1)] : [newCaption(kit, { text: v, end: s.duration - 0.2 })]) : s.captions.slice(1) }); }} />
          <button className="dr-card-del" onClick={() => setScenes(d.scenes.filter((x) => x.id !== s.id))} aria-label="Remove scene"><Trash2 {...I} /></button>
        </li>)}
        <li><button className="dr-card dr-card-add" onClick={() => setScenes([...d.scenes, newScene(kit)])}><Plus size={18} strokeWidth={1.5} aria-hidden />Add a scene</button></li>
      </ol>
      {music ? <section className="dr-plan-music">
        <p className="dr-kicker"><Music {...I} />Sound</p>
        <textarea className="dr-ta" rows={2} value={music.prompt || ''} onChange={(e) => onChange({ ...file, data: { ...d, audio: d.audio.map((a) => (a.id === music.id ? { ...a, prompt: e.target.value } : a)) } })} aria-label="Music prompt" />
        <p className="mute">A bespoke track made with Krea for this edit. You can generate it in the editor.</p>
      </section> : null}
    </div>
  </div>;
}
