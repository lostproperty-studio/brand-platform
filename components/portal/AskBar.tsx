'use client';
import { useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { AskMark } from '@/components/portal/AskAnswer';

// The Ask bar at the top of a home page: the question goes to Ask (the dock at the bottom of every page), which
// answers in place. Used by both portals' home pages.
export function AskBar({ className = '' }: { className?: string }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(false);
  const ask = (e: React.FormEvent) => { e.preventDefault(); if (!q.trim()) return; window.dispatchEvent(new CustomEvent('lp-ask', { detail: q.trim() })); setQ(''); };
  return <form className={'h2-ask' + (active ? ' on' : '') + (className ? ' ' + className : '')} onSubmit={ask}>
    <AskMark state={active ? 'scan' : 'rest'} />
    <label htmlFor="h2-q" className="sr">Ask or search</label>
    <input id="h2-q" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setActive(true)} onBlur={() => setActive(false)} placeholder="Ask about the brand, find a file, or describe what you need to make" autoComplete="off" />
    <button type="submit" aria-label="Ask" disabled={!q.trim()}><ArrowUp size={16} strokeWidth={1.75} aria-hidden /></button>
  </form>;
}
