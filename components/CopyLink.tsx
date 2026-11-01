'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyLink({ url, label = 'Copy link' }: { url: string; label?: string }) {
  const [done, setDone] = useState(false);
  return <button className="btn ic" onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked */ } }}>
    {done ? <Check size={15} strokeWidth={1.75} aria-hidden /> : <Copy size={15} strokeWidth={1.75} aria-hidden />}{done ? 'Copied' : label}
  </button>;
}
