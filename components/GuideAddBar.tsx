'use client';
import { useEffect, useState } from 'react';
import type { Block, BlockKind, GuideChapter } from '@/lib/portal/guide';
import { KINDS, KindIcon } from '@/components/GuideEditor';
import type { Sel } from '@/components/GuideDock';
import { UnfoldVertical, ChevronUp, RectangleHorizontal, ImagePlus, Palette, Plus, Shapes, Sparkles, SquarePlus, Type, type LucideIcon } from 'lucide-react';

export type AddWhat = 'headline' | 'label' | 'text' | 'image' | 'box' | 'swatch' | 'spacer' | 'icon' | 'button';
const I = { size: 18, strokeWidth: 1.6, 'aria-hidden': true } as const;
const ITEMISH = ['columns', 'grid', 'carousel'];

/** Where a new element goes, given what's selected: into the selected box, into the selected section, or as a new
 *  section below when the section has no room for it (a second text, an image in a statement…). */
export function addTarget(what: AddWhat, ch: GuideChapter, sel: Sel | null): string {
  const b = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  if (!b) return 'a new section at the end';
  const it = sel?.item !== undefined && ITEMISH.includes(b.kind) ? b.items?.[sel.item] : undefined;
  const name = KINDS.find(([k]) => k === b.kind)?.[1].toLowerCase() || 'section';
  if (what === 'spacer') return 'a new spacer below';
  if (what === 'icon' || what === 'button') return it ? 'this frame' : ITEMISH.includes(b.kind) && b.variant !== 'images' ? `a new frame in this ${name}` : 'a new frame below';
  if (what === 'swatch') return b.kind === 'swatches' ? 'this palette' : 'a new colour section below';
  if (what === 'box') return ITEMISH.includes(b.kind) && b.variant !== 'images' ? `this ${name}` : 'a new auto layout below';
  if (it) {
    const field = what === 'headline' ? 'heading' : what === 'label' ? 'label' : what === 'text' ? 'body' : 'media';
    return (it as Record<string, unknown>)[field] ? 'a new frame next to it' : `frame ${sel!.item! + 1}`;
  }
  if (ITEMISH.includes(b.kind) && (what === 'text' || what === 'image') && b.variant !== 'images') return `a new frame in this ${name}`;
  if (what === 'image') return ['split', 'media', 'image', 'text'].includes(b.kind) || (b.kind === 'carousel' && b.variant === 'images') ? `this ${name}` : 'a new image section below';
  const field = what === 'headline' ? 'heading' : what === 'label' ? 'eyebrow' : 'body';
  if (b.kind === 'divider' && what !== 'headline') return what === 'text' ? 'a new text section below' : 'a new section below';
  return b[field] ? (what === 'headline' ? 'a new subsection below' : what === 'text' ? 'a new text section below' : 'a new section below') : `this ${name}`;
}

// The adding bar at the bottom of the screen, like Figma's: top and side are for changing what's there; this is for
// adding. Each tool adds to whatever you've selected (a box, then a section), or below it when there's no room.
export function AddBar({ ch, sel, tool, onTool, onSection, onReview, reviewOpen, reviewCount }: { ch: GuideChapter; sel: Sel | null; tool: AddWhat | null; onTool: (w: AddWhat | null) => void; onSection: () => void; onReview?: () => void; reviewOpen?: boolean; reviewCount?: number }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (!menu) return; const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('.ab-menu-wrap')) setMenu(false); }; document.addEventListener('mousedown', off); return () => document.removeEventListener('mousedown', off); }, [menu]);
  const b: Block | undefined = sel ? ch.blocks.find((x) => x.id === sel.block) : undefined;
  void addTarget;
  // Figma's tools and keys: T text, F frame, ⇧⌘K place image. A text's style (headline, label…) is set in the panel.
  const tools: [AddWhat, string, LucideIcon, string][] = [['text', 'Text', Type, 'T'], ['image', 'Image', ImagePlus, '⇧⌘K'], ['box', 'Frame', SquarePlus, 'F'], ['icon', 'Icon', Shapes, ''], ['button', 'Button', RectangleHorizontal, ''], ['spacer', 'Spacer', UnfoldVertical, ''], ...(b?.kind === 'swatches' ? [['swatch', 'Colour', Palette, ''] as [AddWhat, string, LucideIcon, string]] : [])];
  return (
    <div className="ab" role="toolbar" aria-label="Add to the page" onMouseDown={(e) => e.preventDefault()}>
      <div className="ab-menu-wrap">
        <button type="button" className="ab-btn ab-sec ab-sec-w" onClick={onSection} aria-haspopup="dialog" aria-label="Add a section" data-tip={b ? 'Add a section below this one' : 'Add a section'}><Plus {...I} /><span>Section</span></button>
      </div>
      <span className="ab-sep" />
      {tools.map(([w, l, Ic, key]) => (
        <button key={w} type="button" className={'ab-btn' + (tool === w ? ' on' : '')} onClick={() => onTool(tool === w ? null : w)} aria-pressed={tool === w} aria-label={`${l}: click, then click on the page where it goes`} data-tip={tool === w ? `Click where the ${l.toLowerCase()} goes · Esc to cancel` : `${l}${key ? ` ${key}` : ''} · then point where it goes`}><Ic {...I} /></button>))}
      {onReview ? <><span className="ab-sep" /><button type="button" className={'ab-btn ab-review' + (reviewOpen ? ' on' : '')} onClick={onReview} aria-pressed={reviewOpen} aria-label="Review: an AI creative director for the guidelines" data-tip="Review the guidelines with AI"><Sparkles {...I} /><span>Review</span>{reviewCount ? <i className="ab-count">{reviewCount}</i> : null}</button></> : null}
    </div>
  );
}
