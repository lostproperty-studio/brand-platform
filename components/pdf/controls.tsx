'use client';
import { useEffect, useId, useState } from 'react';
import { ImagePlus, RotateCcw } from 'lucide-react';
import type { Layout, Span } from '@/lib/pdf';

// Small, calm controls for the PDF inspector: a labelled row that shows when a slide differs from the document (with
// a reset), segmented choices, colour swatches, numbers, grid column runs, picture pickers and a focal point.

export const I = { size: 14, strokeWidth: 1.75, 'aria-hidden': true } as const;

/** A labelled row. When `over` is set the slide differs from the document here, and Reset puts it back. */
export function Row({ label, over, onReset, children, id }: { label: string; over?: boolean; onReset?: () => void; children: React.ReactNode; id?: string }) {
  return <div className={'pd2-r' + (over ? ' ov' : '')}>
    <span className="pd2-rl" id={id}>{label}</span>
    <div style={{ minWidth: 0 }}>{children}</div>
    {over && onReset ? <button type="button" className="pd2-reset" onClick={onReset} aria-label={`Reset ${label.toLowerCase()} to the document’s`} title="Reset to the document’s"><RotateCcw {...I} size={13} /></button> : <span />}
  </div>;
}

export function Seg<T extends string>({ value, opts, set, label }: { value: T; opts: [T, React.ReactNode, string?][]; set: (v: T) => void; label: string }) {
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
    e.preventDefault(); const n = (i + d + opts.length) % opts.length; set(opts[n][0]);
    ((e.currentTarget.parentElement?.children[n]) as HTMLElement | undefined)?.focus();
  };
  return <div className="pd2-seg" role="radiogroup" aria-label={label}>{opts.map(([k, l, name], i) => <button key={k} type="button" role="radio" aria-checked={value === k} tabIndex={value === k ? 0 : -1}
    onClick={() => set(k)} onKeyDown={(e) => move(e, i)} aria-label={name} title={name}>{l}</button>)}</div>;
}

export function Swatches({ value, colours, set, label }: { value: string; colours: { name: string; hex: string }[]; set: (hex: string) => void; label: string }) {
  const list = [...colours, { name: 'White', hex: '#ffffff' }, { name: 'Black', hex: '#111111' }].filter((c, i, a) => /^#[0-9a-f]{6}$/i.test(c.hex) && a.findIndex((x) => x.hex.toLowerCase() === c.hex.toLowerCase()) === i).slice(0, 14);
  const cur = list.findIndex((c) => c.hex.toLowerCase() === value.toLowerCase());
  const move = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
    e.preventDefault(); const n = (i + d + list.length) % list.length; set(list[n].hex); ((e.currentTarget.parentElement?.children[n]) as HTMLElement | undefined)?.focus();
  };
  return <div className="pd2-sw" role="radiogroup" aria-label={label}>
    {list.map((c, i) => { const on = i === cur; return <button key={c.hex} type="button" role="radio" aria-checked={on} tabIndex={on || (cur < 0 && i === 0) ? 0 : -1} style={{ background: c.hex }}
      onClick={() => set(c.hex)} onKeyDown={(e) => move(e, i)} aria-label={`${c.name} ${c.hex.toUpperCase()}`} title={`${c.name} · ${c.hex.toUpperCase()}`} />; })}
  </div>;
}

/** A number you can type or step; it saves when it's a number in range, and settles in range when you leave it */
export function Num({ label, value, set, min, max, step = 1, unit, hideLabel }: { label: string; value: number; set: (n: number) => void; min: number; max: number; step?: number; unit?: string; hideLabel?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const id = useId();
  const input = <input id={id} className="pd2-in" type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} aria-label={hideLabel ? label : undefined}
    onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) set(n); }}
    onBlur={() => { const n = Number(draft); const c = Number.isFinite(n) && draft !== '' ? Math.max(min, Math.min(max, n)) : value; setDraft(String(c)); if (c !== value) set(c); }} />;
  if (hideLabel) return input;
  return <label className="pd2-nf" htmlFor={id}><span>{label}{unit ? ` (${unit})` : ''}</span>{input}</label>;
}

/** A run of grid columns: from one column to another */
export function SpanPick({ value, cols, set, label }: { value: Span; cols: number; set: (s: Span) => void; label: string }) {
  const opts = Array.from({ length: cols }, (_, i) => i + 1);
  return <div className="pd2-ins">
    <select className="pd2-in" value={value[0]} onChange={(e) => { const a = Number(e.target.value); set([a, Math.max(a, value[1])]); }} aria-label={`${label}: first column`}>{opts.map((n) => <option key={n} value={n}>From {n}</option>)}</select>
    <select className="pd2-in" value={value[1]} onChange={(e) => { const b = Number(e.target.value); set([Math.min(value[0], b), b]); }} aria-label={`${label}: last column`}>{opts.map((n) => <option key={n} value={n}>To {n}</option>)}</select>
  </div>;
}

/** Pick a picture: none, one of the guide's, or upload one */
export function Pics({ value, pics, set, onUpload, label, none = true }: { value?: string; pics: { path: string; url: string }[]; set: (path: string) => void; onUpload?: (f: File) => void; label: string; none?: boolean }) {
  return <div className="pd2-pics" role="radiogroup" aria-label={label}>
    {none ? <button type="button" role="radio" aria-checked={!value} onClick={() => set('')}>None</button> : null}
    {pics.map((p, i) => <button key={p.path} type="button" role="radio" aria-checked={value === p.path} onClick={() => set(p.path)} aria-label={`Picture ${i + 1}`}><img src={p.url} alt="" loading="lazy" /></button>)}
    {onUpload ? <label title="Upload a picture"><span style={{ display: 'grid', placeItems: 'center', gap: 2 }}><ImagePlus {...I} />Upload</span><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="sr-only" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} aria-label="Upload a picture" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }} /></label> : null}
  </div>;
}

/** Click (or use the arrow keys) to set the point of a picture that stays in view when it's cropped */
export function Focus({ url, value, set }: { url: string; value: [number, number]; set: (v: [number, number]) => void }) {
  const at = (e: React.MouseEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); set([Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100)]); };
  const key = (e: React.KeyboardEvent) => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }; const m = d[e.key]; if (!m) return;
    e.preventDefault(); set([Math.max(0, Math.min(100, value[0] + m[0])), Math.max(0, Math.min(100, value[1] + m[1]))]);
  };
  return <div className="pd2-focus" role="slider" tabIndex={0} aria-label="Focal point" aria-valuetext={`${value[0]}% across, ${value[1]}% down`} aria-valuenow={value[0]} onClick={at} onKeyDown={key}>
    <img src={url} alt="" /><i style={{ left: `${value[0]}%`, top: `${value[1]}%` }} />
  </div>;
}

/** A tiny drawing of each layout */
export function LayoutIcon({ id }: { id: Layout }) {
  const t = '#111', m = '#cfcfcf', p = '#F28EE8';
  const lines = (x: number, y: number, w: number, n = 2) => Array.from({ length: n }, (_, i) => <rect key={i} x={x} y={y + i * 3} width={i === n - 1 ? w * 0.7 : w} height={1.4} rx={.7} fill={m} />);
  const body: Record<Layout, React.ReactNode> = {
    text: <><rect x={4} y={9} width={14} height={3} rx={1} fill={t} />{lines(22, 9, 14, 3)}</>,
    'text-image': <><rect x={4} y={9} width={10} height={3} rx={1} fill={t} />{lines(4, 15, 10)}<rect x={22} y={0} width={18} height={22.5} fill={p} /></>,
    'image-text': <><rect x={0} y={0} width={18} height={22.5} fill={p} /><rect x={24} y={9} width={12} height={3} rx={1} fill={t} />{lines(24, 15, 12)}</>,
    image: <><rect x={0} y={0} width={40} height={22.5} fill={p} /><rect x={4} y={15} width={16} height={3} rx={1} fill="#fff" /></>,
    statement: <><rect x={4} y={8} width={30} height={3.4} rx={1} fill={t} /><rect x={4} y={13} width={22} height={3.4} rx={1} fill={t} /></>,
    grid: <><rect x={4} y={5} width={12} height={2.4} rx={1} fill={t} />{[4, 15, 26].map((x) => <rect key={x} x={x} y={10} width={10} height={8} fill={p} />)}</>,
    swatches: <><rect x={4} y={5} width={12} height={2.4} rx={1} fill={t} />{[[4, '#111'], [12.5, p], [21, '#e6e6e6'], [29.5, '#9ad']].map(([x, c]) => <rect key={x} x={x as number} y={10} width={7.5} height={8} fill={c as string} />)}</>
  };
  return <svg viewBox="0 0 40 22.5" aria-hidden>{body[id]}</svg>;
}
