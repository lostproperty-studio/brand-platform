'use client';
import { useEffect, useRef, useState } from 'react';
import type { FileRow } from '@/lib/director/model';
import { api } from './api';

/** Saves a file a moment after each change. Returns the save state for the top bar, and a way to save right now. */
export function useSave(slug: string, file: FileRow) {
  const A = api(slug);
  const [state, setState] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const first = useRef(true);
  const latest = useRef(file); latest.current = file;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = async () => {
    if (timer.current) clearTimeout(timer.current);
    setState('saving');
    try { await A.save(latest.current); setState('saved'); } catch { setState('error'); }
  };
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setState('unsaved');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(now, 1200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  // Save on the way out
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (state === 'unsaved' || state === 'saving') { e.preventDefault(); } };
    addEventListener('beforeunload', before); return () => removeEventListener('beforeunload', before);
  }, [state]);
  return { state, now };
}

export const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Saving…', error: 'Couldn’t save' } as const;
