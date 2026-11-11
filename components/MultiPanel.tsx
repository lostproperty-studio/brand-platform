'use client';
import { Trash2 } from 'lucide-react';
import type { FrameLook, TextStyle } from '@/lib/figma/blocks';
import type { GuideSystem, TypeId } from '@/lib/guideSystem';
import type { ToolbarFont } from '@/components/GuideDock';
import { TypePanel } from '@/components/TypePanel';
import { FramePanel } from '@/components/FramePanel';

// Several things selected with shift: the panel shows what they share, and a change applies to all of them.
// Texts share typography, fill and appearance; frames share layout, appearance, fill and stroke.

export type MultiItem = { key: string; kind: 'text' | 'frame' | 'other'; style?: TextStyle; look?: FrameLook; auto?: TypeId };
const I = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const;

export function MultiPanel({ items, sys, fonts, palette, openStyles, setText, setLook, onDelete, onAddFont, pageColours }: {
  items: MultiItem[]; sys: GuideSystem; fonts: ToolbarFont[]; palette: { name: string; hex: string }[]; openStyles: (id?: TypeId) => void;
  setText: (patch: Partial<TextStyle>) => void; setLook: (patch: Partial<FrameLook>) => void; onDelete: () => void; onAddFont?: (then: (role: string) => void) => void; pageColours?: string[];
}) {
  const texts = items.filter((x) => x.kind === 'text'), frames = items.filter((x) => x.kind === 'frame');
  const allText = texts.length === items.length, allFrames = frames.length === items.length;
  const first = items[0];
  const what = allText ? 'texts' : allFrames ? 'frames' : 'items';
  return <aside className="dp" aria-label="Design panel" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest('input, select')) e.preventDefault(); }}>
    <section className="dp-sec"><p className="dp-h">{items.length} {what} selected<span className="dp-h-x" style={{ color: 'var(--mute)', fontSize: 11 }}>⇧-click to add or remove</span></p>
      {!allText && !allFrames ? <p className="dp-tip" style={{ padding: 0 }}>Select only texts, or only frames, to change what they share.</p> : null}
    </section>
    {allText ? <TypePanel style={first.style || {}} setStyle={(p) => setText(p)} sys={sys} auto={first.auto || 'body'} fonts={fonts} onAddFont={onAddFont} palette={palette} openStyles={openStyles} /> : null}
    {allFrames ? <FramePanel look={first.look} set={(l) => { const base = first.look || {}; const patch: Partial<FrameLook> = {}; for (const k of new Set([...Object.keys(l), ...Object.keys(base)]) as Set<keyof FrameLook>) if (JSON.stringify(l[k]) !== JSON.stringify(base[k])) (patch as Record<string, unknown>)[k] = l[k]; if (Object.keys(patch).length) setLook(patch); }} palette={palette} pageColours={pageColours} upload={() => {}} /> : null}
    <section className="dp-sec"><div className="dp-foot"><button type="button" className="dp-act danger" onClick={onDelete}><Trash2 {...I} />Delete {items.length} <kbd>⌫</kbd></button></div></section>
  </aside>;
}
