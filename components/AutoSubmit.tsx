'use client';
import { useEffect, useRef } from 'react';
/** Submits the surrounding form once the page has loaded in a real browser */
export function AutoSubmit() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const f = ref.current?.closest('form'); if (f) setTimeout(() => f.requestSubmit(), 50); }, []);
  return <span ref={ref} hidden />;
}
