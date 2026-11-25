'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Copy, Crop as CropIcon, Layers, Loader2, Save, Sparkles } from 'lucide-react';
import { AppIcon } from '@/components/portal/AppIcon';
import { AddEffect, EffectView, LayersPanel, PresetLibrary } from '@/components/effects/Effects';
import { renderFile } from '@/lib/effects/render';
import { ASPECTS, NO_CROP, cropRect, type Crop, type Photo } from '@/lib/photographer/model';
import type { EffectLayer } from '@/lib/effects/model';
import { ReviewCard, forReview, loadImg, type photoApi } from '@/components/portal/v2/PhotographerApp';

// One image, opened: crop it to a shape, and add effect layers from Lost Property's presets (the studio can add
// single effects and change every setting). Edits are kept with the image and always start from the original, so
// they can be changed later. Saving makes the edited picture at full size; the art director checks it again.
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const PREVIEW = 1600, FULL = 4096;

export function PhotoEditor({ photo, client, staff, pointers, A, onClose, onSave }: { photo: Photo; client: string; staff: boolean; pointers: string[]; A: ReturnType<typeof photoApi>; onClose: () => void; onSave: (p: Photo, copy: boolean) => Promise<void> }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [err, setErr] = useState('');
  const [crop, setCrop] = useState<Crop>(photo.edit?.crop || NO_CROP);
  const [layers, setLayers] = useState<EffectLayer[]>(photo.edit?.layers || []);
  const [tab, setTab] = useState<'effects' | 'crop'>('effects');
  const [saving, setSaving] = useState('');
  const [check, setCheck] = useState<{ busy?: string; r?: Photo['review'] }>({ r: photo.review });
  // Always from the original, so edits never stack up
  useEffect(() => { loadImg(photo.originalUrl || photo.url!).then(setImg).catch((e) => setErr(e.message)); }, [photo.originalUrl, photo.url]);

  // The cropped picture, at preview size, that the effects are drawn on
  const src = useRef<HTMLCanvasElement | null>(null);
  const [ver, setVer] = useState(0);
  const r = useMemo(() => (img ? cropRect(img.naturalWidth, img.naturalHeight, crop) : null), [img, crop]);
  useEffect(() => {
    if (!img || !r) return;
    const s = Math.min(1, PREVIEW / Math.max(r.w, r.h)); const c = src.current || document.createElement('canvas');
    c.width = Math.round(r.w * s); c.height = Math.round(r.h * s); c.getContext('2d')!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    src.current = c; setVer((v) => v + 1);
  }, [img, r]);
  const live = layers.some((l) => l.on && l.effects.some((e) => e.on && e.kind === 'noise' && Number(e.params.speed) > 0));

  // Dragging the picture moves the crop
  const pan = (e: React.PointerEvent) => {
    if (tab !== 'crop' || !img || !r) return;
    const x0 = e.clientX, y0 = e.clientY, c0 = crop; const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const fx = img.naturalWidth - r.w, fy = img.naturalHeight - r.h;
    const mv = (ev: PointerEvent) => setCrop({ ...c0, x: fx ? Math.max(-1, Math.min(1, c0.x - ((ev.clientX - x0) / box.width) * r.w / fx * 2)) : 0, y: fy ? Math.max(-1, Math.min(1, c0.y - ((ev.clientY - y0) / box.height) * r.h / fy * 2)) : 0 });
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  };

  /** The edited picture at full size */
  const make = async () => {
    if (!img || !r) throw new Error('The image hasn’t loaded.');
    const s = Math.min(1, FULL / Math.max(r.w, r.h)); const c = document.createElement('canvas'); c.width = Math.round(r.w * s); c.height = Math.round(r.h * s);
    c.getContext('2d')!.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return { blob: layers.length ? await renderFile(c, c.width, c.height, layers, 'image/jpeg', 0.92) : await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Couldn’t save.'))), 'image/jpeg', 0.92)), w: c.width, h: c.height };
  };
  const save = async (copy: boolean) => {
    setSaving(copy ? 'Saving a copy' : 'Saving'); setErr('');
    try {
      const { blob, w, h } = await make();
      const path = await A.upload(blob, `${photo.name}-edit.jpg`);
      const original = photo.original || photo.path;
      setSaving('The art director is looking');
      const rv = await A.review(await forReview(blob), 'edit').then((x) => x.review).catch(() => undefined);
      const next: Photo = copy
        ? { id: Math.random().toString(36).slice(2, 10), path, name: `${photo.name} (edit)`, w, h, source: 'edit', from: photo.id, original, edit: { crop, layers }, review: rv, added: new Date().toISOString(), url: URL.createObjectURL(blob), originalUrl: photo.originalUrl || photo.url }
        : { ...photo, path, w, h, original, edit: { crop, layers }, review: rv, url: URL.createObjectURL(blob), originalUrl: photo.originalUrl || photo.url };
      await onSave(next, copy);
    } catch (e) { setErr((e as Error).message); setSaving(''); }
  };
  /** The art director on the edit as it stands, before saving */
  const checkNow = async () => {
    if (!src.current) return; setCheck({ busy: 'Looking at the edit' });
    try {
      const c = document.createElement('canvas'); c.width = src.current.width; c.height = src.current.height;
      const blob = layers.length ? await renderFile(src.current, c.width, c.height, layers) : null;
      const { review } = await A.review(await forReview(blob || src.current), 'edit'); setCheck({ r: review });
    } catch (e) { setCheck({ r: { score: 0, verdict: 'close', summary: (e as Error).message, good: [], fix: [], at: '' } }); }
  };
  const changed = JSON.stringify({ crop, layers }) !== JSON.stringify(photo.edit || { crop: NO_CROP, layers: [] });
  const ar = r ? r.w / r.h : 1;
  // The frame, as big as fits the stage at the crop's shape
  const stage = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ w: 600, h: 400 });
  useEffect(() => { const el = stage.current; if (!el) return; const fit = () => setBox({ w: el.clientWidth - 48, h: el.clientHeight - 48 }); fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect(); }, []);
  const fw = Math.max(40, Math.min(box.w, box.h * ar)), fh = fw / ar;

  return <div className="pe">
    <header className="w2-top">
      <button className="w2-ic" onClick={onClose} aria-label="Back to the collection" title="Back"><ArrowLeft {...I} /></button>
      <AppIcon app="photographer" size={18} /><span className="w2-crumb">{photo.name}</span>
      <span className="mute">{r ? `${r.w} × ${r.h}` : ''}</span>
      <span className="fb-sp" />
      {saving ? <span className="mute pe-saving"><Loader2 size={13} className="spin" aria-hidden /> {saving}…</span> : null}
      <button className="btn" onClick={() => save(true)} disabled={!!saving || !img || !changed}><Copy {...I} />Save as a copy</button>
      <button className="btn solid" onClick={() => save(false)} disabled={!!saving || !img || !changed}><Save {...I} />Save</button>
    </header>
    <div className="pe-body">
      <main ref={stage} className="pe-stage" onPointerDown={pan} style={{ cursor: tab === 'crop' ? 'grab' : undefined }}>
        {err ? <p className="cd-err" role="alert">{err}</p> : null}
        {img ? <div className="pe-frame" style={{ width: fw, height: fh }}>
          <EffectView source={() => src.current} layers={layers} live={live} version={ver} />
          {tab === 'crop' ? <span className="pe-thirds" aria-hidden /> : null}
        </div> : <Loader2 size={18} className="spin" aria-hidden />}
      </main>
      <aside className="pe-side">
        <div className="mo-seg pe-tabs" role="tablist"><button role="tab" aria-checked={tab === 'effects'} onClick={() => setTab('effects')}><Layers size={13} aria-hidden /> Effects</button><button role="tab" aria-checked={tab === 'crop'} onClick={() => setTab('crop')}><CropIcon size={13} aria-hidden /> Crop</button></div>
        {tab === 'crop' ? <div className="ph-sec">
          <p className="ph-h">Shape</p>
          <div className="pe-asp">{ASPECTS.map((a) => <button key={a.id} className={'fx-chip' + (crop.aspect === a.id ? ' on' : '')} onClick={() => setCrop({ ...crop, aspect: a.id, x: 0, y: 0 })}>{a.label}</button>)}</div>
          <label className="fx-amt"><span className="mute">Zoom</span><input type="range" min={1} max={4} step={0.01} value={crop.zoom} onChange={(e) => setCrop({ ...crop, zoom: Number(e.target.value) })} /><span className="fx-mono">{crop.zoom.toFixed(2)}</span></label>
          <p className="ph-small mute">Drag the picture to move the crop.</p>
          <button className="btn sm" onClick={() => setCrop(NO_CROP)} disabled={JSON.stringify(crop) === JSON.stringify(NO_CROP)}>Reset crop</button>
        </div> : <>
          <div className="ph-sec"><p className="ph-h">Layers</p><LayersPanel layers={layers} set={setLayers} studio={staff} /></div>
          <div className="ph-sec"><p className="ph-h">Lost Property presets</p><PresetLibrary img={img} onAdd={(l) => setLayers((x) => [...x, l])} /></div>
          {staff ? <div className="ph-sec"><p className="ph-h">Single effects <span className="mute">· studio</span></p><AddEffect onAdd={(l) => setLayers((x) => [...x, l])} /></div> : null}
        </>}
        <div className="ph-sec"><p className="ph-h"><Sparkles size={13} aria-hidden /> Art director</p>
          {pointers.length ? <ul className="ph-rule-l">{pointers.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul> : null}</div>
        <ReviewCard r={check.r} busy={check.busy} again={img ? checkNow : undefined} />
        <p className="ph-small mute pe-foot">Edits keep the original, so you can change them later. {client}’s effects are set up by Lost Property.</p>
      </aside>
    </div>
  </div>;
}
