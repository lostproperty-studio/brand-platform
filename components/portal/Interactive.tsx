'use client';
import { useState } from 'react';
import { weightName } from '@/lib/fonts';

export function CopyHex({ hex }: { hex: string }) {
  const [done, setDone] = useState(false);
  return <button className="pt-copy" onClick={() => { navigator.clipboard?.writeText(hex); setDone(true); setTimeout(() => setDone(false), 1200); }} aria-label={`Copy ${hex}`}>{done ? 'Copied' : hex}</button>;
}

type F = { role: string; label: string; name: string; hasFiles: boolean; licensed: boolean; weights: number[] };
// Type specimens in the brand's own fonts, with a box to try your own words.
export function TypeTester({ fonts }: { fonts: F[] }) {
  const [text, setText] = useState('');
  return (
    <div className="pt-tt">
      <label className="sr" htmlFor="tt">Type to preview</label>
      <input id="tt" className="in" placeholder="Type here to preview every typeface" value={text} onChange={(e) => setText(e.target.value)} />
      {fonts.map((f) => <div key={f.role} className="pt-spec">
        <p className="mute">{f.label}{f.hasFiles ? '' : ' · preview uses a fallback font'}</p>
        <p className="pt-spec-name">{f.name}</p>
        <p className="pt-spec-s" style={{ fontFamily: `var(--font-${f.role}), sans-serif` }}>{text || 'The quick brown fox jumps over the lazy dog'}</p>
        <p className="pt-spec-g" style={{ fontFamily: `var(--font-${f.role}), sans-serif` }}>ABCDEFGHIJKLMNOPQRSTUVWXYZ<br />abcdefghijklmnopqrstuvwxyz 0123456789 &amp;@£€%!?</p>
        {f.weights.length ? <div className="row">{f.weights.map((w) => <span key={w} className="tag" style={{ fontFamily: `var(--font-${f.role}), sans-serif`, fontWeight: w }}>{weightName(w)}</span>)}</div> : null}
      </div>)}
    </div>
  );
}
