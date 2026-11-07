'use client';
import { useEffect, useRef, useState } from 'react';
import { Search, Upload, X } from 'lucide-react';
import { cleanSvg } from '@/lib/figma/blocks';

// Icons from a library: Lucide by default, or any of the open icon sets on Iconify (Phosphor, Tabler, Material
// Symbols…), or the brand's own SVGs uploaded from the computer. The chosen icon is kept as its SVG.

const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;
const API = 'https://api.iconify.design';
export const ICON_SETS: [string, string][] = [['lucide', 'Lucide'], ['ph', 'Phosphor'], ['tabler', 'Tabler'], ['material-symbols', 'Material Symbols'], ['heroicons', 'Heroicons'], ['iconoir', 'Iconoir'], ['ri', 'Remix'], ['carbon', 'Carbon'], ['fluent', 'Fluent'], ['mingcute', 'MingCute'], ['solar', 'Solar']];
export type PickedIcon = { set: string; name: string; svg: string };

export function IconPicker({ set: initialSet = 'lucide', onPick, onSet, onClose }: { set?: string; onPick: (icon: PickedIcon) => void; onSet?: (set: string) => void; onClose: () => void }) {
  const [set, setSet] = useState(initialSet);
  const [other, setOther] = useState(!ICON_SETS.some(([k]) => k === initialSet));
  const [q, setQ] = useState('');
  const [names, setNames] = useState<string[] | null>(null);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => {
    if (!set.trim()) return;
    let off = false; setNames(null); setErr('');
    const t = setTimeout(async () => {
      try {
        if (q.trim()) {
          const r = await fetch(`${API}/search?query=${encodeURIComponent(q.trim())}&prefix=${encodeURIComponent(set)}&limit=96`); const j = await r.json();
          if (!off) setNames(((j.icons || []) as string[]).map((x) => x.split(':')[1]));
        } else {
          const r = await fetch(`${API}/collection?prefix=${encodeURIComponent(set)}`); if (!r.ok) throw new Error();
          const j = await r.json() as { uncategorized?: string[]; categories?: Record<string, string[]> };
          if (!off) setNames([...(j.uncategorized || []), ...Object.values(j.categories || {}).flat()].filter((v, i, a) => a.indexOf(v) === i).slice(0, 120));
        }
      } catch { if (!off) { setNames([]); setErr('That library couldn’t be loaded. Check the name, or your connection.'); } }
    }, q ? 250 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [set, q]);
  const choose = async (name: string) => {
    try { const r = await fetch(`${API}/${set}/${name}.svg`); const svg = cleanSvg(await r.text()); if (!svg) throw new Error(); onSet?.(set); onPick({ set, name, svg }); } catch { setErr('That icon couldn’t be loaded. Try again.'); }
  };
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="cf ip" role="dialog" aria-label="Choose an icon">
      <div className="ip-top"><h2 className="cf-t">Icons</h2><button type="button" className="fk-ic" onClick={onClose} aria-label="Close"><X {...I} /></button></div>
      <div className="ip-bar">
        <label className="ip-search"><Search {...I} /><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search icons" aria-label="Search icons" /></label>
        <select value={other ? '__other' : set} onChange={(e) => { if (e.target.value === '__other') { setOther(true); setSet(''); } else { setOther(false); setSet(e.target.value); } }} aria-label="Icon library">
          {ICON_SETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}<option value="__other">Another library…</option>
        </select>
      </div>
      {other ? <label className="ip-other">Iconify library name<input value={set} onChange={(e) => setSet(e.target.value.trim().toLowerCase())} placeholder="e.g. mdi, bi, simple-icons" /><a href="https://icon-sets.iconify.design/" target="_blank" rel="noreferrer">Browse libraries</a></label> : null}
      <div className="ip-grid" role="listbox" aria-label="Icons">
        {names === null ? <p className="ip-note">Loading…</p> : !names.length ? <p className="ip-note">{err || 'No icons found.'}</p>
          : names.map((n) => <button key={n} type="button" role="option" aria-selected={false} className="ip-ic" onClick={() => choose(n)} title={n}><img src={`${API}/${set}/${n}.svg`} alt={n} loading="lazy" /></button>)}
      </div>
      {err && names?.length ? <p className="cd-err">{err}</p> : null}
      <div className="cf-row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn ic" onClick={() => file.current?.click()}><Upload {...I} />Upload your own SVG</button>
        <span className="mute" style={{ fontSize: 12 }}>Icons from Iconify</span>
      </div>
      <input ref={file} type="file" accept=".svg,image/svg+xml" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const svg = cleanSvg(await f.text()); if (!svg) { setErr('That file isn’t an SVG.'); return; } onPick({ set: 'custom', name: f.name.replace(/\.svg$/i, ''), svg }); }} />
    </div>
  </div>;
}
