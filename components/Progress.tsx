'use client';
import { useEffect, useRef, useState } from 'react';

// Progress for long jobs whose steps report when they start and finish but not how far through they are.
// Each phase has a typical duration; the bar fills with elapsed time inside the running phase and slows
// down rather than stopping if a phase runs long, so it never sits at 100% while work is still going.

export type Phase = { label: string; expected: number }; // expected seconds

export function useProgress(phases: Phase[], current: number, done: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const started = useRef<{ index: number; at: number }>({ index: -1, at: Date.now() });
  if (current !== started.current.index) started.current = { index: current, at: Date.now() };
  useEffect(() => { if (done || current < 0) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [done, current]);

  const total = phases.reduce((n, p) => n + p.expected, 0) || 1;
  if (done) return { value: 1, remaining: 0, slow: false, label: '' };
  if (current < 0) return { value: 0, remaining: total, slow: false, label: phases[0]?.label || '' };
  const before = phases.slice(0, current).reduce((n, p) => n + p.expected, 0);
  const e = phases[current]?.expected || 1;
  const t = Math.max(0, (now - started.current.at) / 1000);
  const frac = t < 0.85 * e ? t / e : 0.85 + 0.13 * (1 - Math.exp(-(t - 0.85 * e) / e));
  const after = phases.slice(current + 1).reduce((n, p) => n + p.expected, 0);
  return { value: Math.min(0.99, (before + frac * e) / total), remaining: Math.max(after + e - t, 0), slow: t > e * 1.15, label: phases[current]?.label || '' };
}

const fmt = (s: number) => (s < 10 ? 'a few seconds' : s < 50 ? `about ${Math.round(s / 5) * 5} seconds` : s < 90 ? 'about a minute' : `about ${Math.round(s / 60)} minutes`);

export function ProgressBar({ value, remaining, slow, label, failed }: { value: number; remaining: number; slow: boolean; label?: string; failed?: boolean }) {
  const pct = Math.round(value * 100);
  return (
    <div className="pg">
      <div className="pg-top"><span>{failed ? 'Stopped' : label}</span><span className="mute">{failed ? '' : value >= 1 ? 'Done' : slow ? 'Taking a little longer than usual…' : `${pct}% · ${fmt(remaining)} left`}</span></div>
      <div className={'pg-bar' + (failed ? ' failed' : '')} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label || 'Progress'}><i style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/** Progress for a single request with a typical duration (no step reports). */
export function TimedProgress({ label, expected, running, done, failed }: { label: string; expected: number; running: boolean; done?: boolean; failed?: boolean }) {
  const p = useProgress([{ label, expected }], running || done ? 0 : -1, !!done);
  if (!running && !done && !failed) return null;
  return <ProgressBar {...p} label={label} failed={failed} />;
}
