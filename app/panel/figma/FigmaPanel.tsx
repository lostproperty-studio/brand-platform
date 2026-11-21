'use client';
import { useEffect, useMemo, useState } from 'react';
import { PanelShell } from '@/components/panel/PanelShell';
import { PanelSession } from '@/components/panel/linkSession';
import { figmaHello, figmaHost, figmaName, figmaOpen, figmaStore } from '@/components/panel/hosts/figma';

// Waits for the plugin to say hello (with the saved sign-in and which editor it's in), then shows the panel.
// Opened outside Figma, it says so rather than pretending to work.
export function FigmaPanel({ hint }: { hint?: string }) {
  const [hello, setHello] = useState<{ store: Record<string, string | null>; editor: string } | null | 'outside'>(null);
  useEffect(() => { if (window.parent === window) { setHello('outside'); return; } figmaHello().then((h) => setHello(h || 'outside')); }, []);
  const session = useMemo(() => (hello && hello !== 'outside' ? new PanelSession('', 'figma', figmaStore(hello.store)) : null), [hello]);
  const host = useMemo(() => (hello && hello !== 'outside' ? figmaHost(hello.editor) : null), [hello]);
  if (hello === 'outside') return <div className="lpx lpx-gate"><span className="lpx-mark" aria-hidden /><p className="lpx-client">Open this in Figma</p><p className="lpx-lede">This is the brand panel for Figma. Run it from Plugins in a Figma or FigJam file.</p></div>;
  if (!session || !host || !hello) return <div className="lpx lpx-gate"><span className="lpx-mark" aria-hidden /><p className="lpx-sub">Opening…</p></div>;
  return <PanelShell session={session} where={figmaName(hello.editor)} hint={hint} hostApi={host} openUrl={figmaOpen} />;
}
