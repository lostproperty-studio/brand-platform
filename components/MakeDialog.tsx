'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LpMark } from '@/components/portal/LpMark';

// Make an image or a short video with Krea, straight into a frame. Runs on the studio's Krea plan.
export function MakeDialog({ onMake, onClose, aspect }: { onMake: (prompt: string, kind: 'image' | 'video') => Promise<string | null>; onClose: () => void; aspect?: string }) {
  const [prompt, setPrompt] = useState('');
  const [kind, setKind] = useState<'image' | 'video'>('image');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => { if (prompt.trim().length < 3 || busy) return; setBusy(true); setErr(''); const e = await onMake(prompt.trim(), kind); setBusy(false); if (e) setErr(e); };
  return <div className="cf-back" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="cf mk" role="dialog" aria-label="Make with Krea">
      <h2 className="cf-t">Make {kind === 'image' ? 'an image' : 'a video'}</h2>
      <p className="cf-b">With Krea, on the studio’s plan{aspect ? `, at ${aspect}` : ''}. It goes straight into the frame.</p>
      <div className="dp-seg mk-kind" role="radiogroup" aria-label="What to make"><button type="button" role="radio" aria-checked={kind === 'image'} className={kind === 'image' ? 'on' : ''} onClick={() => setKind('image')}>Image</button><button type="button" role="radio" aria-checked={kind === 'video'} className={kind === 'video' ? 'on' : ''} onClick={() => setKind('video')}>Video</button></div>
      <textarea className="cd-ta mk-ta" rows={4} autoFocus value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe it: subject, light, mood, colour, camera…" disabled={busy} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); }} />
      {busy ? <div className="mk-busy"><span className="cd-mark"><LpMark state="scan" /></span>Making it with Krea. {kind === 'video' ? 'Videos take a few minutes.' : 'This takes about a minute.'}</div> : null}
      {err ? <p className="cd-err" role="alert">{err}</p> : null}
      <div className="cf-row"><button className="btn" onClick={onClose} disabled={busy}>Cancel</button><button className="btn solid ic" onClick={go} disabled={busy || prompt.trim().length < 3}><Sparkles size={15} strokeWidth={1.75} aria-hidden />Make</button></div>
    </div>
  </div>;
}
